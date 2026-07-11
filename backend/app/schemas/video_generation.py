"""Pydantic schemas for video generation specs."""

from pydantic import BaseModel, Field


class VideoGenerationSpecCreate(BaseModel):
    shot_key: str = Field(min_length=1)
    prompt: str = ""
    negative_prompt: str = ""
    camera_motion: str = ""
    camera_angle: str = ""
    camera_type: str = ""
    duration: int = Field(default=5, ge=1, le=300)
    aspect_ratio: str = "16:9"
    style: str = ""
    model_name: str = ""


class VideoGenerationSpecUpdate(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = None
    camera_motion: str | None = None
    camera_angle: str | None = None
    camera_type: str | None = None
    duration: int | None = Field(default=None, ge=1, le=300)
    aspect_ratio: str | None = None
    style: str | None = None
    model_name: str | None = None


class VideoGenerationSpecResponse(BaseModel):
    id: str
    instance_id: str
    shot_key: str
    prompt: str
    negative_prompt: str
    camera_motion: str
    camera_angle: str
    camera_type: str
    duration: int
    aspect_ratio: str
    style: str
    model_name: str
    created_at: float
    updated_at: float


class VideoGenerationSpecSnapshot(BaseModel):
    """Frozen spec at job creation time — JSON in source_assets_snapshot."""
    shot_key: str
    prompt: str
    camera_motion: str
    duration: int
    style: str
    model_name: str
    negative_prompt: str = ""
