"""
Worker Runtime — async-safe job execution engine for 11B-4.
"""

import sqlite3, time
from app.repositories.composition_repository import get_composition_job, get_current_composition_job
from app.workers.worker_service import start_job, complete_job, fail_job, JobStateError
from app.workers.composition_worker import CompositionWorkerError
from app.providers.base import VideoCompositionProvider
from app.providers.mock_video_provider import MockVideoProvider


def execute_job(
    cursor: sqlite3.Cursor,
    job_id: str,
    provider: VideoCompositionProvider | None = None,
) -> dict:
    """Execute a single composition job end-to-end."""
    if provider is None:
        provider = MockVideoProvider()

    job = get_composition_job(cursor, job_id)
    if job is None:
        raise CompositionWorkerError(f"Job {job_id} not found")

    snapshot = job["source_assets_snapshot"]

    # 1. Validate snapshot through provider
    if not provider.validate(snapshot):
        return fail_job(cursor, job_id, "Provider validation failed")

    # 2. Start job
    try:
        start_job(cursor, job_id)
    except JobStateError:
        return job  # Already running or completed

    try:
        # Store provider metadata
        cursor.execute(
            "UPDATE composition_jobs SET provider_name = ?, provider_job_id = ? WHERE id = ?",
            (provider.provider_name, f"{provider.provider_name}-{job_id}", job_id),
        )

        # 3. Execute composition
        result = provider.compose(snapshot, job_id)

        # 4. Complete
        job = complete_job(cursor, job_id, result.get("video_url", ""))

        # 5. Auto-create FinalVideoAsset
        from app.services.final_video_service import create_from_job
        try:
            create_from_job(cursor, job_id)
        except Exception as e:
            return fail_job(cursor, job_id, f"FinalVideoAsset creation failed: {e}")

        return job

    except Exception as e:
        err = str(e)
        cursor.execute(
            "UPDATE composition_jobs SET last_error = ? WHERE id = ?", (err, job_id),
        )
        return fail_job(cursor, job_id, err)


def run_pending_jobs(db_path: str, max_jobs: int = 1) -> list[dict]:
    """Find and execute queued jobs. Returns list of final job states."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM composition_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?",
        (max_jobs,),
    )
    results = []
    for row in cur.fetchall():
        try:
            result = execute_job(cur, row["id"])
            conn.commit()
            results.append(result)
        except Exception as e:
            conn.rollback()
            results.append({"id": row["id"], "status": "failed", "error_message": str(e)})

    conn.close()
    return results


def retry_job(cursor: sqlite3.Cursor, job_id: str, max_retries: int = 3) -> dict:
    """Retry a failed job. Returns updated job state."""
    from app.repositories.composition_repository import update_composition_job_status

    job = get_composition_job(cursor, job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found")
    if job["status"] not in ("failed",):
        raise JobStateError(f"Cannot retry job in status {job['status']}")

    retry_count = job.get("retry_count", 0)
    if retry_count >= max_retries:
        cursor.execute(
            "UPDATE composition_jobs SET retry_count = ?, last_error = ? WHERE id = ?",
            (retry_count, "Max retries exceeded", job_id),
        )
        return get_composition_job(cursor, job_id)

    # Reset to queued with incremented retry count
    cursor.execute(
        "UPDATE composition_jobs SET status = 'queued', retry_count = ?, updated_at = ? WHERE id = ?",
        (retry_count + 1, time.time(), job_id),
    )
    return get_composition_job(cursor, job_id)
