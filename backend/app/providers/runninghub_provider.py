"""RunningHub Provider Adapter — placeholder for RunningHub workflow integration."""

import time, uuid
from app.providers.base import VideoCompositionProvider
from app.providers.registry import register


@register("runninghub")
class RunningHubProvider(VideoCompositionProvider):
    """RunningHub workflow-based video composition provider. Placeholder."""

    def __init__(self, workflow_id: str = "", api_key: str = "", **kwargs):
        self.workflow_id = workflow_id
        self.api_key = api_key

    @property
    def provider_name(self) -> str:
        return "runninghub"

    def validate(self, snapshot: dict) -> bool:
        return len(snapshot.get("shots", [])) > 0 and bool(self.workflow_id)

    def estimate_duration(self, snapshot: dict) -> float:
        return len(snapshot.get("shots", [])) * 10.0

    def compose(self, snapshot: dict, job_id: str) -> dict:
        ext_id = f"rh-{uuid.uuid4().hex[:8]}"
        return {
            "video_url": "",
            "duration": self.estimate_duration(snapshot),
            "provider_name": self.provider_name,
            "provider_job_id": ext_id,
            "metadata": {"workflow_id": self.workflow_id, "external_status": "submitted"},
        }

    def cancel(self, job_id: str) -> bool:
        return True
