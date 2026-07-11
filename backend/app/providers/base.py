"""Video Composition Provider — full interface for 11B-4."""

from abc import ABC, abstractmethod


class VideoCompositionProvider(ABC):
    """Base class for video composition providers (mock, APIMart, RunningHub, etc.)."""

    @abstractmethod
    def validate(self, snapshot: dict) -> bool:
        """Validate that the provider can handle this snapshot. Returns True if valid."""
        ...

    @abstractmethod
    def estimate_duration(self, snapshot: dict) -> float:
        """Estimate composition duration in seconds."""
        ...

    @abstractmethod
    def compose(self, snapshot: dict, job_id: str) -> dict:
        """Execute video composition. Returns dict with video_url, duration, metadata."""
        ...

    def cancel(self, job_id: str) -> bool:
        """Cancel a running composition. Returns True if cancelled successfully."""
        return False

    @property
    def provider_name(self) -> str:
        return self.__class__.__name__
