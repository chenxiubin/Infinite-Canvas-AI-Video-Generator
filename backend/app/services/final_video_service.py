"""Final Video Asset Service — backend-driven asset creation from completed jobs."""

import sqlite3
from app.repositories.composition_repository import get_composition_job
from app.repositories.final_video_repository import create_asset, get_by_job_id


class FinalVideoServiceError(Exception):
    pass


def create_from_job(cursor: sqlite3.Cursor, job_id: str) -> dict:
    """
    Create a final_video_asset from a completed composition_job.

    - Idempotent: if already exists for this job_id, return existing.
    - Sets is_current=True (clears previous current).
    - Auto-increments version_number.
    """
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise FinalVideoServiceError(f"Job {job_id} not found")
    if job["status"] != "completed":
        raise FinalVideoServiceError(f"Job {job_id} is {job['status']}, expected completed")

    # Idempotency check
    existing = get_by_job_id(cursor, job_id)
    if existing:
        return existing

    video_url = job["output_video_url"] or f"/mock-output/composition/{job_id}.mp4"

    return create_asset(
        cursor,
        instance_id=job["instance_id"],
        video_url=video_url,
        composition_job_id=job_id,
        status="completed",
    )
