"""Composition Service — orchestrates job creation and execution."""

import sqlite3
from app.repositories.composition_repository import (
    get_composition_state, create_composition_job, get_composition_job,
)
from app.services.composition_snapshot import build_source_snapshot, SnapshotBlockedError
from app.workers.composition_worker import run_composition_job
from app.providers.mock_video_provider import MockVideoProvider


def create_job_with_snapshot(cursor: sqlite3.Cursor, instance_id: str) -> dict:
    """
    Create a composition job with a real source snapshot.

    1. Load composition state (order + durations)
    2. Build source snapshot from video_asset_versions
    3. Create job with immutable snapshot
    4. Return job
    """
    state = get_composition_state(cursor, instance_id)
    if state is None:
        raise ValueError("No composition state found. Create state first.")

    snapshot = build_source_snapshot(cursor, instance_id)

    return create_composition_job(
        cursor,
        instance_id=instance_id,
        composition_order_snapshot=state["composition_order"],
        timeline_durations_snapshot=state["timeline_durations"],
        source_assets_snapshot=snapshot,
        source_state_version=state["version"],
    )


def execute_job(cursor: sqlite3.Cursor, job_id: str, provider=None) -> dict:
    """
    Execute a composition job using the given provider.

    If no provider is given, uses MockVideoProvider.
    """
    if provider is None:
        provider = MockVideoProvider()
    return run_composition_job(cursor, job_id, provider=provider)
