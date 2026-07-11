"""Provider Poller — checks external task status and completes jobs."""

import sqlite3, time
from app.repositories.composition_repository import get_composition_job
from app.workers.worker_service import complete_job, fail_job
from app.providers.registry import get_provider


def poll_job(cursor: sqlite3.Cursor, job_id: str) -> dict:
    """Poll external provider status and transition job if complete."""
    job = get_composition_job(cursor, job_id)
    if job is None or job["status"] != "processing":
        return job or {}

    provider_name = job.get("provider_name", "mock")
    provider = get_provider(provider_name)

    # Simulate polling: mock completes immediately, others need real API
    if provider_name == "mock":
        # Mock jobs are already completed by the worker
        return job

    # Poll external provider for real status
    now = time.time()
    cursor.execute(
        "UPDATE composition_jobs SET last_polled_at = ? WHERE id = ?", (now, job_id),
    )

    # Map external status to internal
    APIMART_STATUS_MAP = {
        "queued": "processing",
        "running": "processing",
        "success": "completed",
        "failed": "failed",
    }

    try:
        ext_status = provider.get_status(job.get("provider_job_id", ""))
        ext = ext_status.get("status", "processing")
        internal = APIMART_STATUS_MAP.get(ext, "processing")

        if internal == "completed":
            video_url = ext_status.get("video_url") or f"/output/{provider_name}/{job_id}.mp4"
            job = complete_job(cursor, job_id, video_url)
            from app.services.final_video_service import create_from_job
            try:
                create_from_job(cursor, job_id)
            except Exception:
                pass
        elif internal == "failed":
            err = ext_status.get("error", "External provider failed")
            job = fail_job(cursor, job_id, err)
        # else: still processing, leave as-is
    except Exception as e:
        # Polling failure shouldn't fail the job
        cursor.execute(
            "UPDATE composition_jobs SET external_status = ? WHERE id = ?",
            (f"poll_error: {e}", job_id),
        )

    return job


def poll_pending(db_path: str) -> list[dict]:
    """Poll all processing jobs with external providers."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM composition_jobs WHERE status = 'processing' AND provider_name != 'mock'"
    )
    results = []
    for row in cur.fetchall():
        try:
            result = poll_job(cur, row["id"])
            conn.commit()
            results.append(result)
        except Exception:
            conn.rollback()
    conn.close()
    return results
