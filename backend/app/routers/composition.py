"""Sprint 11A-2: Composition Persistence API routes."""

import sqlite3
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from app.db.connection import get_db
from app.repositories.composition_repository import (
    get_composition_state, create_composition_state, update_composition_state,
    create_composition_job, get_composition_job, get_current_composition_job,
    create_final_video_asset, list_final_video_assets, set_current_final_video,
)

router = APIRouter(prefix="/api/v1/composition", tags=["composition"])


# ── Response models ─────────────────────────────────────────────────

class CompositionStateResponse(BaseModel):
    instance_id: str
    composition_order: list[str]
    timeline_durations: dict[str, float]
    version: int
    created_at: float
    updated_at: float


class CompositionStateUpdateRequest(BaseModel):
    composition_order: list[str] = Field(default_factory=list)
    timeline_durations: dict[str, float] = Field(default_factory=dict)
    expected_version: int = Field(ge=1)


class CompositionJobResponse(BaseModel):
    id: str
    instance_id: str
    status: str
    composition_order_snapshot: list[str]
    timeline_durations_snapshot: dict[str, float]
    source_assets_snapshot: dict
    source_state_version: int
    progress: int
    output_video_url: str | None = None
    error_message: str | None = None
    started_at: float | None = None
    completed_at: float | None = None
    created_at: float
    updated_at: float


class CompositionJobCreateRequest(BaseModel):
    instance_id: str = Field(min_length=1)


class FinalVideoAssetResponse(BaseModel):
    id: str
    instance_id: str
    composition_job_id: str | None = None
    video_url: str
    version_number: int
    version_label: str
    status: str
    is_current: bool
    error_message: str | None = None
    created_at: float


# ── Composition States ──────────────────────────────────────────────

@router.get("/composition-states/{instance_id}", response_model=CompositionStateResponse)
def get_state(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    state = get_composition_state(cur, instance_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Composition state not found")
    return state


@router.put("/composition-states/{instance_id}", response_model=CompositionStateResponse)
def put_state(instance_id: str, body: CompositionStateUpdateRequest, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    # Try update first
    state, err = update_composition_state(
        cur, instance_id,
        body.composition_order, body.timeline_durations,
        body.expected_version,
    )
    if state is not None:
        db.commit()
        return state
    if err and "not found" in err:
        # Upsert: create new state
        state = create_composition_state(
            cur, instance_id, body.composition_order, body.timeline_durations,
        )
        db.commit()
        return state
    if err and "version conflict" in err:
        raise HTTPException(status_code=409, detail=err)
    raise HTTPException(status_code=500, detail=err or "unknown error")


# ── Composition Jobs ────────────────────────────────────────────────

@router.post("/composition-jobs", response_model=CompositionJobResponse, status_code=201)
def start_job(body: CompositionJobCreateRequest, db: sqlite3.Connection = Depends(get_db)):
    from app.services.composition_service import create_job_with_snapshot
    from app.services.composition_snapshot import SnapshotBlockedError
    cur = db.cursor()
    # Idempotency: prevent duplicate active jobs
    active = get_current_composition_job(cur, body.instance_id)
    if active:
        raise HTTPException(status_code=409, detail={
            "error": "composition_job_exists",
            "job_id": active["id"],
        })
    try:
        job = create_job_with_snapshot(cur, body.instance_id)
        db.commit()
        return job
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SnapshotBlockedError as e:
        raise HTTPException(status_code=400, detail={
            "error": "shots_not_ready",
            "blocked_shots": e.blocked_shots,
        })


@router.post("/composition-jobs/{job_id}/run", response_model=CompositionJobResponse)
def run_job_endpoint(job_id: str, db: sqlite3.Connection = Depends(get_db)):
    """DEV internal: manually trigger a composition job worker run."""
    from app.workers.composition_worker import run_composition_job
    cur = db.cursor()
    result = run_composition_job(cur, job_id)
    db.commit()
    return result


@router.get("/composition-jobs/{job_id}", response_model=CompositionJobResponse)
def get_job(job_id: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    job = get_composition_job(cur, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Composition job not found")
    return job


@router.post("/composition-jobs/{job_id}/retry", response_model=CompositionJobResponse)
def retry_job_endpoint(job_id: str, db: sqlite3.Connection = Depends(get_db)):
    from app.workers.runtime import retry_job
    cur = db.cursor()
    result = retry_job(cur, job_id)
    db.commit()
    return result


@router.get("/workers/status")
def worker_status(db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT COUNT(*) as c FROM composition_jobs WHERE status = 'queued'")
    queued = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) as c FROM composition_jobs WHERE status = 'processing'")
    running = cur.fetchone()[0]
    return {"worker": "online", "running_jobs": running, "queued_jobs": queued}


@router.get("/composition-jobs/instance/{instance_id}", response_model=CompositionJobResponse)
def get_job_by_instance(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    job = get_current_composition_job(cur, instance_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No active composition job found")
    return job


# ── Final Video Assets ──────────────────────────────────────────────

@router.get("/final-video-assets/{instance_id}/current", response_model=FinalVideoAssetResponse)
def get_current_asset(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    from app.repositories.final_video_repository import get_current
    cur = db.cursor()
    a = get_current(cur, instance_id)
    if a is None:
        raise HTTPException(status_code=404, detail="No current final video asset")
    return a


@router.get("/final-video-assets/{instance_id}", response_model=list[FinalVideoAssetResponse])
def list_assets(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    return list_final_video_assets(cur, instance_id)


@router.post("/final-video-assets", response_model=FinalVideoAssetResponse, status_code=201)
def create_asset(
    instance_id: str = Query(...),
    video_url: str = Query(""),
    composition_job_id: str = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    cur = db.cursor()
    a = create_final_video_asset(cur, instance_id, video_url, composition_job_id)
    db.commit()
    return a


@router.put("/final-video-assets/{asset_id}/current", response_model=FinalVideoAssetResponse)
def switch_current(
    asset_id: str,
    instance_id: str = Query(..., description="Instance ID that owns this asset"),
    db: sqlite3.Connection = Depends(get_db),
):
    cur = db.cursor()
    asset, err = set_current_final_video(cur, instance_id, asset_id)
    if err:
        raise HTTPException(status_code=400, detail=err)
    db.commit()
    return asset
