"""
MVP-3 Sprint 4: Draft merge preview, review, and mock export helpers.
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


# ---------- Merge Preview ----------

def all_nodes_success(cursor, instance_id: str) -> bool:
    cursor.execute(
        "SELECT status FROM video_instance_nodes WHERE instance_id = ?",
        (instance_id,),
    )
    statuses = [r[0] for r in cursor.fetchall()]
    return len(statuses) > 0 and all(s == "success" for s in statuses)


def can_merge_preview(cursor, instance_id: str) -> tuple[bool, str, list]:
    """Check if an instance can be merged. Returns (ok, reason, blocked_shot_keys)."""
    cursor.execute("SELECT * FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if not inst:
        return (False, "Instance not found", [])
    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (inst["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        return (False, "Archived batch cannot be merged", [])
    if not all_nodes_success(cursor, instance_id):
        return (False, "Not all nodes are success", [])

    # Check review_status of reviewable nodes (status='success' AND requires_review=1)
    cursor.execute(
        "SELECT shot_key, review_status FROM video_instance_nodes "
        "WHERE instance_id = ? AND status = 'success' AND requires_review = 1",
        (instance_id,),
    )
    reviewable_nodes = cursor.fetchall()
    blocked_keys = [
        f"{instance_id}:{r['shot_key']}"
        for r in reviewable_nodes if r['review_status'] != 'approved'
    ]
    if blocked_keys:
        return (False, "Not all nodes have been approved yet", blocked_keys)

    return (True, "", [])


def create_merge_job(cursor, batch_id: str, instance_id: str, attempt_no: int = 1) -> str:
    job_id = f"merge_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO video_merge_jobs
        (id, batch_id, instance_id, status, attempt_no, created_at, started_at)
        VALUES (?, ?, ?, 'running', ?, ?, ?)""",
        (job_id, batch_id, instance_id, attempt_no, now, now),
    )
    return job_id


def run_mock_merge_preview(cursor, instance_id: str, batch_id: str, attempt_no: int = 1) -> dict:
    """Synchronous mock merge. Returns dict with job info."""
    job_id = create_merge_job(cursor, batch_id, instance_id, attempt_no)
    now = time.time()
    preview_url = f"/mock-previews/{instance_id}.mp4"
    cover_url = f"/mock-previews/{instance_id}.jpg"

    cursor.execute(
        """UPDATE video_merge_jobs
        SET status = 'success', output_preview_url = ?, output_cover_url = ?, completed_at = ?
        WHERE id = ?""",
        (preview_url, cover_url, now, job_id),
    )
    cursor.execute(
        """UPDATE video_instances
        SET draft_preview_url = ?, draft_cover_url = ?, merge_status = 'success',
            review_status = 'pending', updated_at = ?
        WHERE id = ?""",
        (preview_url, cover_url, now, instance_id),
    )
    # Set all success nodes' review_status to pending
    cursor.execute(
        """UPDATE video_instance_nodes
        SET review_status = 'pending', updated_at = ?
        WHERE instance_id = ? AND status = 'success' AND requires_review = 1""",
        (now, instance_id),
    )
    return {
        "merge_job_id": job_id,
        "status": "success",
        "draft_preview_url": preview_url,
        "draft_cover_url": cover_url,
    }


# ---------- Review ----------

def recompute_instance_review_status(cursor, instance_id: str) -> str:
    """Derive instance review_status from its reviewable nodes."""
    cursor.execute(
        "SELECT review_status FROM video_instance_nodes "
        "WHERE instance_id = ? AND status = 'success' AND requires_review = 1",
        (instance_id,),
    )
    statuses = [r[0] for r in cursor.fetchall()]
    if not statuses:
        return "not_ready"
    if any(s == "rejected" for s in statuses):
        return "rejected"
    if all(s == "approved" for s in statuses):
        return "approved"
    if any(s == "pending" for s in statuses):
        return "pending"
    return "not_ready"


def apply_instance_review_status(cursor, instance_id: str) -> str:
    status = recompute_instance_review_status(cursor, instance_id)
    now = time.time()
    cursor.execute(
        "UPDATE video_instances SET review_status = ?, updated_at = ? WHERE id = ?",
        (status, now, instance_id),
    )
    return status


def create_review_record(
    cursor, target_type: str, target_id: str, batch_id: str,
    instance_id: str, node_id: str | None, action: str,
    previous_status: str, new_status: str, reason: str = "",
    reviewer: str = "local_user",
) -> str:
    rid = f"review_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO review_records
        (id, target_type, target_id, batch_id, instance_id, node_id,
         action, previous_status, new_status, reason, reviewer, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (rid, target_type, target_id, batch_id, instance_id, node_id,
         action, previous_status, new_status, reason, reviewer, now),
    )
    return rid


def review_node(
    cursor, node_id: str, action: str, reason: str = "", reviewer: str = "local_user",
) -> dict:
    cursor.execute("SELECT * FROM video_instance_nodes WHERE id = ?", (node_id,))
    node = cursor.fetchone()
    if not node:
        raise ValueError("Node not found")
    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (node["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        raise ValueError("Archived batch cannot be reviewed")
    if node["status"] != "success":
        raise ValueError(f"Cannot review node with status '{node['status']}'")
    if action not in ("approve", "reject"):
        raise ValueError(f"Invalid action: {action}")
    if action == "reject" and not reason:
        raise ValueError("Reason is required for reject")

    prev = node["review_status"] or "not_required"
    now = time.time()
    cursor.execute(
        "UPDATE video_instance_nodes SET review_status = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
        (action + ("ed" if action == "reject" else "d"), now, now, node_id),
    )
    rid = create_review_record(
        cursor, "node", node_id, node["batch_id"], node["instance_id"],
        node_id, action, prev, (action + ("ed" if action == "reject" else "d")), reason, reviewer,
    )
    new_inst_status = apply_instance_review_status(cursor, node["instance_id"])
    return {
        "node_id": node_id,
        "review_status": (action + ("ed" if action == "reject" else "d")),
        "instance_review_status": new_inst_status,
        "review_record_id": rid,
    }


def review_instance_nodes(cursor, instance_id: str, action: str, reason: str = "") -> dict:
    cursor.execute("SELECT batch_id FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if not inst:
        raise ValueError("Instance not found")
    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (inst["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        raise ValueError("Archived batch cannot be reviewed")
    if action not in ("approve", "reject"):
        raise ValueError(f"Invalid action: {action}")
    if action == "reject" and not reason:
        raise ValueError("Reason is required for reject")

    cursor.execute(
        "SELECT * FROM video_instance_nodes "
        "WHERE instance_id = ? AND status = 'success' AND requires_review = 1",
        (instance_id,),
    )
    nodes = cursor.fetchall()
    now = time.time()
    approved = 0
    rejected = 0
    for node in nodes:
        prev = node["review_status"] or "not_required"
        cursor.execute(
            "UPDATE video_instance_nodes SET review_status = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
            ((action + ("ed" if action == "reject" else "d")), now, now, node["id"]),
        )
        create_review_record(
            cursor, "node", node["id"], node["batch_id"], instance_id,
            node["id"], action, prev, (action + ("ed" if action == "reject" else "d")), reason,
        )
        if action == "approve":
            approved += 1
        else:
            rejected += 1

    new_inst_status = apply_instance_review_status(cursor, instance_id)
    return {
        "instance_id": instance_id,
        "review_status": new_inst_status,
        "approved_nodes": approved,
        "rejected_nodes": rejected,
    }


# ---------- Export ----------

def can_export_instance(cursor, instance_id: str) -> tuple[bool, str]:
    cursor.execute("SELECT * FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if not inst:
        return (False, "Instance not found")
    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (inst["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        return (False, "Archived batch cannot be exported")
    if inst["review_status"] != "approved":
        return (False, f"Instance review_status is '{inst['review_status']}', must be 'approved'")
    if not inst["draft_preview_url"]:
        return (False, "No draft preview URL — run merge preview first")
    return (True, "")


def create_export_job(cursor, batch_id: str, instance_id: str, draft_url: str, attempt_no: int = 1) -> str:
    job_id = f"export_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO export_jobs
        (id, batch_id, instance_id, status, draft_preview_url, attempt_no, created_at, started_at)
        VALUES (?, ?, ?, 'running', ?, ?, ?, ?)""",
        (job_id, batch_id, instance_id, draft_url, attempt_no, now, now),
    )
    return job_id


def run_mock_export(cursor, instance_id: str, batch_id: str, attempt_no: int = 1) -> dict:
    cursor.execute("SELECT draft_preview_url FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    draft_url = inst["draft_preview_url"] if inst else ""
    job_id = create_export_job(cursor, batch_id, instance_id, draft_url, attempt_no)
    now = time.time()
    final_url = f"/mock-exports/{instance_id}.mp4"

    cursor.execute(
        "UPDATE export_jobs SET status = 'success', final_video_url = ?, completed_at = ? WHERE id = ?",
        (final_url, now, job_id),
    )
    cursor.execute(
        """UPDATE video_instances
        SET export_status = 'success', final_video_url = ?, exported_at = ?, updated_at = ?
        WHERE id = ?""",
        (final_url, now, now, instance_id),
    )
    return {
        "export_job_id": job_id,
        "status": "success",
        "final_video_url": final_url,
    }


# ---------- Delivery State Reset ----------

def reset_instance_delivery_after_node_regenerate(cursor, instance_id: str):
    """When any node is regenerated (retry/force), invalidate previous delivery state."""
    now = time.time()
    cursor.execute(
        """UPDATE video_instances
        SET draft_preview_url = NULL, draft_cover_url = NULL,
            merge_status = 'not_started', review_status = 'not_ready',
            export_status = 'not_started', final_video_url = NULL,
            updated_at = ?
        WHERE id = ?""",
        (now, instance_id),
    )
