"""APIMart Provider — real HTTP calls with mock fallback."""

import os, time, uuid
from app.providers.base import VideoCompositionProvider
from app.providers.registry import register


@register("apimart")
class APIMartProvider(VideoCompositionProvider):
    """APIMart video composition provider with real HTTP client integration."""

    def __init__(self, api_base: str = "", api_key: str = "", **kwargs):
        self.api_key = api_key or os.environ.get("APIMART_API_KEY", "")
        self.api_base = api_base or os.environ.get("APIMART_BASE_URL", "https://api.apimart.ai")

    @property
    def provider_name(self) -> str:
        return "apimart"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    @property
    def _client(self):
        from app.providers.apimart_client import APIMartClient
        return APIMartClient(api_key=self.api_key, base_url=self.api_base)

    def validate(self, snapshot: dict) -> bool:
        shots = snapshot.get("shots", [])
        if not shots:
            return False
        return all(s.get("review_status") == "approved" for s in shots)

    def estimate_duration(self, snapshot: dict) -> float:
        return sum(s.get("duration", 5) for s in snapshot.get("shots", [])) * 1.5

    def compose(self, snapshot: dict, job_id: str) -> dict:
        if not self.is_configured:
            # Safe fallback to mock
            from app.providers.mock_video_provider import MockVideoProvider
            mock = MockVideoProvider()
            r = mock.compose(snapshot, job_id)
            r["provider_name"] = "apimart"
            r["provider_job_id"] = f"apimart-mock-{uuid.uuid4().hex[:8]}"
            return r

        # Build prompt from generation specs (11E-1)
        shots = snapshot.get("shots", [])
        prompt_parts = []
        for s in shots:
            spec = s.get("generation_spec", {})
            sp = spec.get("prompt") or f"Shot {s.get('shot_key', '')}"
            if spec.get("camera_motion"):
                sp += f", {spec['camera_motion']}"
            if spec.get("style"):
                sp += f", {spec['style']} style"
            prompt_parts.append(sp)
        prompt = " | ".join(prompt_parts) if prompt_parts else "Video composition"
        total_duration = int(self.estimate_duration(snapshot))
        source_videos = [s.get("video_url", "") for s in shots]
        model = shots[0].get("generation_spec", {}).get("model_name", "") if shots else ""

        result = self._client.create_video_task(
            prompt=prompt,
            source_videos=source_videos,
            duration=max(total_duration, 1),
        )

        if "error" in result:
            raise RuntimeError(f"APIMart create task failed: {result['error']}")

        return {
            "video_url": "",
            "duration": total_duration,
            "provider_name": self.provider_name,
            "provider_job_id": result.get("task_id", f"apimart-{uuid.uuid4().hex[:8]}"),
            "metadata": {
                "external_status": "submitted",
                "submitted_at": time.time(),
                "configured": True,
            },
        }

    def get_status(self, provider_job_id: str) -> dict:
        if not self.is_configured:
            return {"status": "success", "progress": 100, "video_url": f"/mock-output/{provider_job_id}.mp4"}
        return self._client.get_task_status(provider_job_id)

    def cancel(self, job_id: str) -> bool:
        if not self.is_configured:
            return True
        return self._client.cancel_task(job_id)
