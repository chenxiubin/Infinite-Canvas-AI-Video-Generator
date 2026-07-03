"""
MVP-4 Sprint 8: Model Gateway — unified image-to-video adapter layer.

Supports:
- mock: local synchronous mock (default)
- external_http: generic HTTP adapter (configured via env vars)
"""

import os
import time
from typing import Optional


# ---------- Adapter Registry ----------

class ModelAdapter:
    """Base class for image-to-video adapters."""
    adapter_key: str = "base"
    provider_name: str = "base"
    default: bool = False
    supports_polling: bool = False

    def check_config(self) -> tuple[bool, list[str]]:
        """Return (configured, [missing_config_keys])."""
        return (True, [])

    def submit(self, request: dict) -> dict:
        """Submit an image-to-video job. Returns job result dict."""
        raise NotImplementedError

    def poll(self, provider_job_id: str) -> dict:
        """Poll a previously submitted job."""
        raise NotImplementedError


class MockAdapter(ModelAdapter):
    adapter_key = "mock"
    provider_name = "mock"
    default = True
    supports_polling = False

    def submit(self, request: dict) -> dict:
        node_id = request.get("node_id", "unknown")
        dur = request.get("duration_seconds", 4)
        return {
            "provider_job_id": f"mock-job-{node_id}-{int(time.time())}",
            "status": "success",
            "video_url": f"/mock-videos/{node_id}.mp4",
            "cover_url": f"/mock-covers/{node_id}.jpg",
            "duration_seconds": float(dur),
            "model_name": "mock_image_to_video",
            "model_version": "mock-v1",
            "cost_estimate": 0.0,
            "raw_response_summary": {"status": "success", "mock": True},
        }

    def poll(self, provider_job_id: str) -> dict:
        return {"status": "success", "video_url": f"/mock-videos/polled.mp4"}


class ExternalHttpAdapter(ModelAdapter):
    adapter_key = "external_http"
    provider_name = "custom"
    supports_polling = True

    def check_config(self) -> tuple[bool, list[str]]:
        required = ["MODEL_GATEWAY_EXTERNAL_BASE_URL", "MODEL_GATEWAY_EXTERNAL_API_KEY"]
        missing = [k for k in required if not os.getenv(k)]
        return (len(missing) == 0, missing)

    def submit(self, request: dict) -> dict:
        ok, missing = self.check_config()
        if not ok:
            raise RuntimeError(f"external_http adapter missing config: {missing}")

        base_url = os.getenv("MODEL_GATEWAY_EXTERNAL_BASE_URL", "").rstrip("/")
        # In a production adapter, this would POST to {base_url}/...
        # For Sprint 8, we return a dry-run response.
        dry_run = request.get("dry_run", True)
        if dry_run:
            return {
                "provider_job_id": f"ext-{int(time.time())}",
                "status": "queued",
                "video_url": None,
                "cover_url": None,
                "duration_seconds": 0.0,
                "model_name": os.getenv("MODEL_GATEWAY_EXTERNAL_PROVIDER_NAME", "custom"),
                "model_version": "external-v0",
                "cost_estimate": None,
                "raw_response_summary": {"dry_run": True, "base_url": base_url},
            }

        # Real HTTP call placeholder (not implemented in Sprint 8)
        raise NotImplementedError("external_http live submission not implemented in Sprint 8")


# ---------- Registry ----------

_ADAPTERS: dict[str, ModelAdapter] = {
    "mock": MockAdapter(),
    "external_http": ExternalHttpAdapter(),
}

DEFAULT_ADAPTER = "mock"


def get_adapter(key: str) -> ModelAdapter:
    if key not in _ADAPTERS:
        raise ValueError(f"Unknown model adapter: {key}")
    return _ADAPTERS[key]


def list_adapters() -> list[dict]:
    result = []
    for key, ad in _ADAPTERS.items():
        ok, missing = ad.check_config()
        result.append({
            "adapter_key": ad.adapter_key,
            "provider_name": ad.provider_name,
            "enabled": key == DEFAULT_ADAPTER or ok,
            "default": ad.default,
            "supports_polling": ad.supports_polling,
            "configured": ok,
            "missing_config": missing if not ok else [],
        })
    return result


def submit_generation(request: dict) -> dict:
    """Route a generation request through the appropriate adapter."""
    adapter_key = request.get("model_adapter", DEFAULT_ADAPTER)
    if adapter_key not in _ADAPTERS:
        raise ValueError(f"Unknown model adapter: {adapter_key}")
    adapter = _ADAPTERS[adapter_key]
    ok, missing = adapter.check_config()
    if not ok:
        raise RuntimeError(f"Model adapter '{adapter_key}' is not configured. Missing: {missing}")
    result = adapter.submit(request)
    result["adapter_key"] = adapter_key
    result["provider_name"] = adapter.provider_name
    return result
