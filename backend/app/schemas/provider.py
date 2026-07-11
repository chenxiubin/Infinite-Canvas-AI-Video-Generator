"""Provider result schema for 11B-4."""

from pydantic import BaseModel, Field


class CompositionProviderResult(BaseModel):
    video_url: str = Field(min_length=1)
    duration: float = Field(ge=0)
    provider_name: str = ""
    provider_job_id: str = ""
    metadata: dict = Field(default_factory=dict)
    created_at: float = 0.0
