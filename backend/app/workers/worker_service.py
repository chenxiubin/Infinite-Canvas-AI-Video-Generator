"""
Composition Job Service — state transition orchestration.
Sits between Worker and Repository. Worker never touches DB directly.
"""

import time, sqlite3
from app.repositories.composition_repository import (
    get_composition_job, update_composition_job_status,
)


class JobStateError(Exception):
    """Raised when a state transition is invalid."""


VALID_TRANSITIONS = {
    "queued": {"processing"},
    "processing": {"completed", "failed"},
}


def start_job(cursor: sqlite3.Cursor, job_id: str) -> dict:
    """Transition job from queued → processing."""
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise JobStateError(f"Job {job_id} not found")
    if job["status"] != "queued":
        raise JobStateError(f"Job {job_id} is {job['status']}, expected queued")
    return update_composition_job_status(cursor, job_id, "processing", progress=0)


def update_progress(cursor: sqlite3.Cursor, job_id: str, progress: int) -> dict:
    """Update job progress (0-100)."""
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise JobStateError(f"Job {job_id} not found")
    if job["status"] != "processing":
        raise JobStateError(f"Job {job_id} is {job['status']}, expected processing")
    return update_composition_job_status(cursor, job_id, "processing", progress=progress)


def complete_job(cursor: sqlite3.Cursor, job_id: str, output_video_url: str = "") -> dict:
    """Transition job from processing → completed."""
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise JobStateError(f"Job {job_id} not found")
    if job["status"] != "processing":
        raise JobStateError(f"Job {job_id} is {job['status']}, expected processing")
    return update_composition_job_status(cursor, job_id, "completed", progress=100,
                                         output_video_url=output_video_url)


def fail_job(cursor: sqlite3.Cursor, job_id: str, error_message: str) -> dict:
    """Transition job from processing → failed."""
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise JobStateError(f"Job {job_id} not found")
    if job["status"] != "processing":
        raise JobStateError(f"Job {job_id} is {job['status']}, expected processing")
    return update_composition_job_status(cursor, job_id, "failed", error_message=error_message)


def can_run(job: dict) -> bool:
    """Check if a job can be executed (queued state, not already completed/failed)."""
    return job["status"] == "queued"
