"""
MVP-3 Sprint 3: Mock video generation and state machine helpers.

Provides:
- Generation job creation
- Mock node generation (synchronous, no real model)
- Instance/batch state recomputation
- Retry tracking
- Force status injection (TESTING=true only)
"""

import os
import uuid
import time
import sqlite3


def _get_db_path() -> str:
    return os.environ.get(
        "TEST_DATABASE_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.sqlite3"),
    )


def get_db_conn():
    conn = sqlite3.connect(_get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- State recomputation ----------

def recompute_instance_status(cursor, instance_id: str) -> str:
    """Derive video_instance status from its nodes.

    Uses only values allowed by the table CHECK constraint:
    pending / running / completed / failed.
    """
    cursor.execute(
        "SELECT status FROM video_instance_nodes WHERE instance_id = ?",
        (instance_id,),
    )
    statuses = [r[0] for r in cursor.fetchall()]
    if not statuses:
        return "pending"
    pending_or_running = any(s in ("pending", "running") for s in statuses)
    if pending_or_running:
        return "running"
    all_success = all(s == "success" for s in statuses)
    if all_success:
        return "completed"
    # Mixed or all failed: report as failed (instance-level granularity)
    return "failed"


def recompute_batch_status(cursor, batch_id: str) -> tuple[str, int, int]:
    """Derive batch_tasks status, completed_count, failed_count from its instances."""
    cursor.execute(
        "SELECT id, status FROM video_instances WHERE batch_id = ?",
        (batch_id,),
    )
    instances = cursor.fetchall()
    if not instances:
        return ("ready", 0, 0)

    completed = 0
    failed = 0
    any_running = False
    for inst in instances:
        s = recompute_instance_status(cursor, inst["id"])
        if s == "completed":
            completed += 1
        elif s in ("failed", "partially_completed"):
            failed += 1
        elif s == "running":
            any_running = True

    if any_running:
        status = "running"
    elif failed == 0 and completed > 0:
        status = "completed"
    elif completed == 0 and failed > 0:
        status = "failed"
    elif completed > 0 and failed > 0:
        status = "partially_completed"
    else:
        status = "ready"

    return (status, completed, failed)


def apply_batch_status(cursor, batch_id: str):
    """Recompute and write batch status and counts."""
    status, completed, failed = recompute_batch_status(cursor, batch_id)
    now = time.time()
    cursor.execute(
        "UPDATE batch_tasks SET status = ?, completed_count = ?, failed_count = ?, updated_at = ? WHERE id = ?",
        (status, completed, failed, now, batch_id),
    )
    return status, completed, failed


def apply_instance_status(cursor, instance_id: str) -> str:
    """Recompute and write instance status."""
    status = recompute_instance_status(cursor, instance_id)
    now = time.time()
    cursor.execute(
        "UPDATE video_instances SET status = ?, updated_at = ? WHERE id = ?",
        (status, now, instance_id),
    )
    return status


# ---------- Generation job ----------

def create_generation_job(
    cursor,
    node_id: str,
    batch_id: str,
    instance_id: str,
    product_id: str,
    template_id: str,
    shot_key: str,
    prompt: str,
    bound_asset_id: str | None,
    bound_asset_url: str,
    duration_seconds: int,
    attempt_no: int = 1,
    retry_of_job_id: str | None = None,
) -> str:
    """Create a video_generation_jobs record. Returns job_id."""
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO video_generation_jobs
        (id, batch_id, instance_id, node_id, product_id, template_id, shot_key,
         status, model_name, model_version, prompt, input_asset_id, input_asset_url,
         duration_seconds, attempt_no, retry_of_job_id, cost_estimate,
         created_at, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'mock_image_to_video', 'mock-v1',
         ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (job_id, batch_id, instance_id, node_id, product_id, template_id, shot_key,
         prompt, bound_asset_id or "", bound_asset_url,
         duration_seconds, attempt_no, retry_of_job_id or "", now, now),
    )
    return job_id


def get_latest_job_for_node(cursor, node_id: str) -> dict | None:
    """Get the most recent generation job for a node."""
    cursor.execute(
        "SELECT * FROM video_generation_jobs WHERE node_id = ? ORDER BY created_at DESC LIMIT 1",
        (node_id,),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


# ---------- Mock generation ----------

def run_mock_generation_for_node(
    cursor,
    node: dict,
    batch_id: str,
    instance_id: str,
    product_id: str,
    template_id: str,
    force_status: str | None = None,
    model_adapter: str = "mock",
    model_name_override: str | None = None,
) -> dict:
    """Run mock generation for a single node. Synchronous, no real model.

    Returns dict with: node_id, shot_key, status, job_id, video_url, cover_url, skipped
    """
    node_id = node["id"]
    shot_key = node["shot_key"]
    bound_asset_id = node.get("bound_asset_id")
    bound_asset_url = ""

    if bound_asset_id:
        cursor.execute("SELECT file_url FROM product_assets WHERE id = ?", (bound_asset_id,))
        pa = cursor.fetchone()
        bound_asset_url = pa["file_url"] if pa else ""

    # Determine final status
    if force_status:
        final_status = force_status
    else:
        final_status = "success"

    # Find previous job for attempt tracking
    prev_job = get_latest_job_for_node(cursor, node_id)
    prev_attempt = prev_job["attempt_no"] if prev_job else 0
    attempt_no = prev_attempt + 1
    retry_of = prev_job["id"] if prev_job and prev_job["status"] == "failed" else None

    # Create job
    job_id = create_generation_job(
        cursor,
        node_id=node_id,
        batch_id=batch_id,
        instance_id=instance_id,
        product_id=product_id,
        template_id=template_id,
        shot_key=shot_key,
        prompt=node.get("prompt", ""),
        bound_asset_id=bound_asset_id,
        bound_asset_url=bound_asset_url,
        duration_seconds=node.get("duration_seconds", 4),
        attempt_no=attempt_no,
        retry_of_job_id=retry_of,
    )

    # Route through model gateway
    try:
        from .model_gateway import submit_generation as gateway_submit
    except ImportError:
        from model_gateway import submit_generation as gateway_submit

    gateway_req = {
        "node_id": node_id, "image_url": bound_asset_url, "start_frame_url": bound_asset_url,
        "prompt": node.get("prompt", ""), "duration_seconds": node.get("duration_seconds", 4),
        "shot_key": shot_key, "model_adapter": model_adapter,
        "model_name": model_name_override or ("mock_image_to_video" if model_adapter == "mock" else None),
    }
    gateway_result = gateway_submit(gateway_req)

    # Update job with gateway metadata
    now = time.time()
    import json as _json
    req_summary = _json.dumps({"shot_key": shot_key, "duration": node.get("duration_seconds", 4), "adapter": model_adapter}, ensure_ascii=False)
    resp_summary = _json.dumps({"status": gateway_result.get("status"), "provider_job_id": gateway_result.get("provider_job_id", ""), "has_video": bool(gateway_result.get("video_url"))}, ensure_ascii=False)
    cursor.execute(
        """UPDATE video_generation_jobs
        SET adapter_key = ?, provider_name = ?, provider_job_id = ?, provider_status = ?,
            model_name = ?, model_version = ?, cost_estimate = ?, submitted_at = ?,
            request_payload_summary = ?, response_payload_summary = ?
        WHERE id = ?""",
        (gateway_result.get("adapter_key", "mock"), gateway_result.get("provider_name", "mock"),
         gateway_result.get("provider_job_id", ""), gateway_result.get("status", ""),
         gateway_result.get("model_name", "mock_image_to_video"), gateway_result.get("model_version", "mock-v1"),
         gateway_result.get("cost_estimate", 0.0), now,
         req_summary, resp_summary, job_id),
    )

    gw_status = gateway_result.get("status", "success")
    if force_status:
        gw_status = force_status

    if gw_status == "success":
        video_url = gateway_result.get("video_url") or f"/mock-videos/{node_id}.mp4"
        cover_url = gateway_result.get("cover_url") or f"/mock-covers/{node_id}.jpg"
        duration = node.get("duration_seconds", 4)
        cursor.execute(
            """UPDATE video_instance_nodes
            SET status = 'success', job_id = ?, video_url = ?, cover_url = ?,
                retry_count = COALESCE(retry_count, 0) + 1,
                review_status = CASE WHEN review_status != 'not_required' THEN 'pending' ELSE review_status END,
                updated_at = ?, completed_at = ?
            WHERE id = ?""",
            (job_id, video_url, cover_url, now, now, node_id),
        )
        # Reset delivery state on the instance (invalidate old preview/export)
        try:
            from .video_review_export import reset_instance_delivery_after_node_regenerate
        except ImportError:
            from video_review_export import reset_instance_delivery_after_node_regenerate
        reset_instance_delivery_after_node_regenerate(cursor, node["instance_id"])
        cursor.execute(
            """UPDATE video_generation_jobs
            SET status = 'success', output_video_url = ?, output_cover_url = ?,
                duration_seconds = ?, completed_at = ?
            WHERE id = ?""",
            (video_url, cover_url, duration, now, job_id),
        )
    elif gw_status == "failed":
        error_msg = gateway_result.get("error_message") or "Generation failed"
        cursor.execute(
            """UPDATE video_instance_nodes
            SET status = 'failed', job_id = ?, error_message = ?,
                retry_count = COALESCE(retry_count, 0) + 1, updated_at = ?, completed_at = ?
            WHERE id = ?""",
            (job_id, error_msg, now, now, node_id),
        )
        cursor.execute(
            """UPDATE video_generation_jobs
            SET status = 'failed', error_message = ?, completed_at = ?
            WHERE id = ?""",
            (error_msg, now, job_id),
        )
        video_url = None
        cover_url = None

    return {
        "node_id": node_id,
        "shot_key": shot_key,
        "status": gw_status if not force_status else force_status,
        "job_id": job_id,
        "video_url": video_url,
        "cover_url": cover_url,
        "attempt_no": attempt_no,
        "skipped": False,
    }


# ---------- Batch generation ----------

def generate_batch_nodes(
    cursor,
    batch_id: str,
    skip_success: bool = True,
    force_node_statuses: dict[str, str] | None = None,
    model_adapter: str = "mock",
) -> dict:
    """Generate all nodes in a video batch.

    Returns summary dict with generated/skipped/failed counts.
    """
    cursor.execute(
        """SELECT vin.* FROM video_instance_nodes vin
        JOIN video_instances vi ON vin.instance_id = vi.id
        WHERE vi.batch_id = ?
        ORDER BY vin.instance_id, vin.shot_order""",
        (batch_id,),
    )
    nodes = [dict(r) for r in cursor.fetchall()]

    generated = 0
    skipped = 0
    failed_nodes = 0
    node_results = []

    for node in nodes:
        node_id = node["id"]
        current_status = node.get("status", "pending")

        # Check force status first (overrides skip)
        force_status = None
        if force_node_statuses:
            force_status = force_node_statuses.get(node_id)

        # Skip success nodes unless forced
        if current_status == "success" and skip_success and not force_status:
            skipped += 1
            node_results.append({
                "node_id": node_id,
                "shot_key": node["shot_key"],
                "status": "success",
                "skipped": True,
            })
            continue

        # Mark as running
        now = time.time()
        cursor.execute(
            "UPDATE video_instance_nodes SET status = 'running', updated_at = ? WHERE id = ?",
            (now, node_id),
        )

        result = run_mock_generation_for_node(
            cursor,
            node,
            batch_id=batch_id,
            instance_id=node["instance_id"],
            product_id=node["product_id"],
            template_id=node["template_id"],
            force_status=force_status,
            model_adapter=model_adapter,
        )

        if result["status"] == "success":
            generated += 1
        else:
            failed_nodes += 1
        node_results.append(result)

    # Recompute instance/batch statuses
    instance_ids = set(n["instance_id"] for n in nodes)
    for iid in instance_ids:
        apply_instance_status(cursor, iid)
    batch_status, completed_c, failed_c = apply_batch_status(cursor, batch_id)

    return {
        "batch_id": batch_id,
        "status": batch_status,
        "total_nodes": len(nodes),
        "generated_nodes": generated,
        "skipped_success_nodes": skipped,
        "failed_nodes": failed_nodes,
        "node_results": node_results,
    }


# ---------- Force parameter security ----------

def assert_testing_force_allowed(param_name: str):
    """Raise 403 if TESTING env var is not 'true'."""
    from fastapi import HTTPException
    is_testing = os.getenv("TESTING", "false").lower() == "true"
    if not is_testing:
        raise HTTPException(
            status_code=403,
            detail=f"{param_name} is only allowed in testing environment",
        )
