"""Sprint 11A-3: Video Asset Versions API."""

import sqlite3
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from app.db.connection import get_db
from app.repositories.video_asset_repository import (
    create_version, get_version, list_versions, get_latest_version,
    create_review, get_review, list_reviews,
)

router = APIRouter(prefix="/api/v1/video-assets", tags=["video-assets"])


# ── Response models ─────────────────────────────────────────────────

class VideoAssetVersionResponse(BaseModel):
    id: str
    instance_id: str
    shot_key: str
    version_number: int
    version_label: str
    video_url: str
    provider: str
    model: str
    status: str
    created_at: float
    updated_at: float


class CreateVersionRequest(BaseModel):
    video_url: str = ""
    provider: str = ""
    model: str = ""


class ReviewRequest(BaseModel):
    review_status: str = Field(..., pattern="^(approved|rejected)$")
    review_reason: str = ""


class ReviewResponse(BaseModel):
    id: str
    asset_version_id: str
    review_status: str
    review_reason: str
    reviewed_at: float | None = None
    created_at: float


class ShotVersionsResponse(BaseModel):
    versions: list[VideoAssetVersionResponse]
    latest: VideoAssetVersionResponse | None = None
    reviews: list[ReviewResponse]


# ── Routes ──────────────────────────────────────────────────────────

# Specific routes MUST come before parameterized routes
@router.get("/versions/{version_id}/review", response_model=ReviewResponse)
def get_version_review(version_id: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    r = get_review(cur, version_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return r


@router.put("/versions/{version_id}/review", response_model=ReviewResponse)
def review_version(
    version_id: str,
    body: ReviewRequest,
    db: sqlite3.Connection = Depends(get_db),
):
    cur = db.cursor()
    v = get_version(cur, version_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Video asset version not found")
    r = create_review(cur, version_id, body.review_status, body.review_reason)
    db.commit()
    return r


@router.get("/{instance_id}/{shot_key}", response_model=ShotVersionsResponse)
def get_shot_versions(instance_id: str, shot_key: str, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    versions = list_versions(cur, instance_id, shot_key)
    latest = get_latest_version(cur, instance_id, shot_key)
    reviews = list_reviews(cur, instance_id, shot_key)
    return {"versions": versions, "latest": latest, "reviews": reviews}


@router.post("/{instance_id}/{shot_key}", response_model=VideoAssetVersionResponse, status_code=201)
def create_shot_version(
    instance_id: str, shot_key: str,
    body: CreateVersionRequest, db: sqlite3.Connection = Depends(get_db),
):
    cur = db.cursor()
    v = create_version(cur, instance_id, shot_key, body.video_url, body.provider, body.model)
    db.commit()
    return v
