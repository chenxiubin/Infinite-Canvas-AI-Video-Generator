"""
Pydantic models for Sprint 11A-1 composition persistence.
"""

from __future__ import annotations
import json, math
from typing import Any
from pydantic import BaseModel, Field, model_validator


# ── Helpers ──────────────────────────────────────────────────────────

def _is_finite_positive(n: Any) -> bool:
    try:
        f = float(n)
    except (TypeError, ValueError):
        return False
    return math.isfinite(f) and f > 0


# ── CompositionState ─────────────────────────────────────────────────

class CompositionState(BaseModel):
    instance_id: str = Field(min_length=1)
    composition_order: list[str] = Field(default_factory=list)
    timeline_durations: dict[str, float] = Field(default_factory=dict)
    version: int = Field(default=1, ge=1)
    created_at: float
    updated_at: float

    @model_validator(mode="after")
    def validate_order(self):
        # No empty strings
        if any(k == "" for k in self.composition_order):
            raise ValueError("composition_order contains empty shot key")
        # No duplicates
        if len(self.composition_order) != len(set(self.composition_order)):
            raise ValueError("composition_order contains duplicate shot keys")
        return self

    @model_validator(mode="after")
    def validate_durations(self):
        for k, v in self.timeline_durations.items():
            if not k:
                raise ValueError("timeline_durations key is empty")
            if not _is_finite_positive(v):
                raise ValueError(f"timeline_durations[{k!r}]={v!r} — must be finite positive")
        return self


class CompositionStateUpdate(BaseModel):
    composition_order: list[str] = Field(default_factory=list)
    timeline_durations: dict[str, float] = Field(default_factory=dict)
    expected_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_order(self):
        if any(k == "" for k in self.composition_order):
            raise ValueError("composition_order contains empty shot key")
        if len(self.composition_order) != len(set(self.composition_order)):
            raise ValueError("composition_order contains duplicate shot keys")
        return self

    @model_validator(mode="after")
    def validate_durations(self):
        for k, v in self.timeline_durations.items():
            if not k:
                raise ValueError("timeline_durations key is empty")
            if not _is_finite_positive(v):
                raise ValueError(f"timeline_durations[{k!r}]={v!r} — must be finite positive")
        return self


# ── CompositionJob ───────────────────────────────────────────────────

_VALID_JOB_STATUSES = {"queued", "processing", "completed", "failed"}

class CompositionJob(BaseModel):
    id: str = Field(min_length=1)
    instance_id: str = Field(min_length=1)
    status: str
    composition_order_snapshot: list[str]
    timeline_durations_snapshot: dict[str, float]
    source_assets_snapshot: dict[str, Any]
    source_state_version: int = Field(ge=1)
    progress: int = Field(default=0, ge=0, le=100)
    output_video_url: str | None = None
    error_message: str | None = None
    started_at: float | None = None
    completed_at: float | None = None
    created_at: float
    updated_at: float

    @model_validator(mode="after")
    def validate_status(self):
        if self.status not in _VALID_JOB_STATUSES:
            raise ValueError(f"status must be one of {_VALID_JOB_STATUSES}, got {self.status!r}")
        return self


class CompositionJobCreate(BaseModel):
    instance_id: str = Field(min_length=1)
    composition_order_snapshot: list[str]
    timeline_durations_snapshot: dict[str, float]
    source_assets_snapshot: dict[str, Any]
    source_state_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_order(self):
        if any(k == "" for k in self.composition_order_snapshot):
            raise ValueError("composition_order_snapshot contains empty shot key")
        if len(self.composition_order_snapshot) != len(set(self.composition_order_snapshot)):
            raise ValueError("composition_order_snapshot contains duplicate shot keys")
        return self


# ── FinalVideoAsset ──────────────────────────────────────────────────

class FinalVideoAsset(BaseModel):
    id: str = Field(min_length=1)
    instance_id: str = Field(min_length=1)
    composition_job_id: str | None = None
    video_url: str = Field(min_length=1)
    version_number: int = Field(ge=1)
    version_label: str = Field(min_length=1)
    status: str
    is_current: bool = False
    error_message: str | None = None
    created_at: float

    @model_validator(mode="after")
    def validate_status(self):
        if self.status not in ("completed", "failed"):
            raise ValueError(f"status must be 'completed' or 'failed', got {self.status!r}")
        return self
