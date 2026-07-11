"""
Composition Worker — executes a single composition job via VideoCompositionProvider.

Flow:
  1. Validate snapshot
  2. Update status: queued → processing
  3. Update progress, call provider.compose()
  4. Complete with real output URL, or fail with error
"""

import time, sqlite3
from app.repositories.composition_repository import get_composition_job
from app.workers.worker_service import (
    start_job, update_progress, complete_job, fail_job, JobStateError,
)
from app.providers.mock_video_provider import MockVideoProvider
from app.providers.base import VideoCompositionProvider


class CompositionWorkerError(Exception):
    pass


def run_composition_job(
    cursor: sqlite3.Cursor,
    job_id: str,
    simulate_failure: bool = False,
    provider: VideoCompositionProvider | None = None,
) -> dict:
    """
    Execute a composition job synchronously.

    Args:
        cursor: Database cursor (caller manages transaction).
        job_id: The composition job ID to execute.
        simulate_failure: If True, use a failing MockVideoProvider.
        provider: VideoCompositionProvider to use. Defaults to MockVideoProvider.

    Returns:
        Final job state dict.
    """
    if provider is None:
        provider = MockVideoProvider(simulate_failure=simulate_failure)

    # 1. Load job and validate snapshot
    job = get_composition_job(cursor, job_id)
    if job is None:
        raise CompositionWorkerError(f"Job {job_id} not found")

    if not job["composition_order_snapshot"]:
        raise CompositionWorkerError("Job has empty composition_order_snapshot")

    # 2. Start: queued → processing
    try:
        start_job(cursor, job_id)
    except JobStateError:
        return job

    try:
        # 3. Update progress and call provider
        update_progress(cursor, job_id, 25)
        update_progress(cursor, job_id, 50)

        if simulate_failure:
            raise Exception("Simulated worker failure at 50%")

        result = provider.compose(job["source_assets_snapshot"], job_id)
        update_progress(cursor, job_id, 100)

        # Complete job
        job = complete_job(cursor, job_id, result["video_url"])

        # Auto-create FinalVideoAsset (backend-driven, not frontend-dependent)
        from app.services.final_video_service import create_from_job
        try:
            create_from_job(cursor, job_id)
        except Exception as asset_err:
            return fail_job(cursor, job_id, f"FinalVideoAsset creation failed: {asset_err}")

        return job

    except Exception as e:
        return fail_job(cursor, job_id, str(e))
