"""Mock video composition provider — implements full 11B-4 interface."""

import time
from app.providers.base import VideoCompositionProvider


class MockVideoProvider(VideoCompositionProvider):
    """Simulates video composition by returning a mock output URL."""

    def __init__(self, simulate_failure: bool = False):
        self.simulate_failure = simulate_failure

    @property
    def provider_name(self) -> str:
        return "mock"

    def validate(self, snapshot: dict) -> bool:
        shots = snapshot.get("shots", [])
        return len(shots) > 0

    def estimate_duration(self, snapshot: dict) -> float:
        return sum(s.get("duration", 5) for s in snapshot.get("shots", []))

    def compose(self, snapshot: dict, job_id: str) -> dict:
        if self.simulate_failure:
            raise RuntimeError("Mock provider failure")

        shot_count = len(snapshot.get("shots", []))
        total_duration = self.estimate_duration(snapshot)

        return {
            "video_url": f"/mock-output/composition/{job_id}.mp4",
            "duration": total_duration,
            "provider_name": self.provider_name,
            "provider_job_id": f"mock-{job_id}",
            "metadata": {"shot_count": shot_count, "generated_at": time.time()},
        }
