"""APIMart HTTP Client — encapsulates all APIMart API calls with retry & error handling."""

import os, time, uuid, json, logging
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.apimart.ai"
REQUEST_TIMEOUT = 30  # seconds
MAX_RETRIES = 3

# Complete APIMart → internal status mapping
APIMART_STATUS_MAP = {
    "queued": "processing",
    "pending": "processing",
    "running": "processing",
    "processing": "processing",
    "success": "completed",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "failed",
}


class ProviderError(Exception):
    """Unified provider error with status_code."""
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


def _mask_key(key: str) -> str:
    if len(key) <= 8: return "****"
    return key[:4] + "****" + key[-4:]


def _is_retryable(code: int) -> bool:
    return code in (0, 429, 502, 503, 504)


class APIMartClient:
    """Low-level HTTP client for APIMart video generation API with retry support."""

    def __init__(self, api_key: str = "", base_url: str = ""):
        self.api_key = api_key or os.environ.get("APIMART_API_KEY", "")
        self.base_url = (base_url or os.environ.get("APIMART_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self._retries = MAX_RETRIES
        if self.api_key:
            logger.info("APIMartClient configured key=%s base=%s", _mask_key(self.api_key), self.base_url)

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "Accept": "application/json"}

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body else None
        last_error = None
        for attempt in range(self._retries):
            try:
                req = Request(url, data=data, headers=self._headers(), method=method)
                with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                    raw = resp.read()
                    if not raw:
                        return {}
                    return json.loads(raw)
            except HTTPError as e:
                err_body = {}
                try: err_body = json.loads(e.read())
                except: pass
                last_error = ProviderError(err_body.get("message", str(e)), e.code)
                if not _is_retryable(e.code): break
            except URLError as e:
                last_error = ProviderError(f"Connection error: {e.reason}", 0)
            except json.JSONDecodeError:
                last_error = ProviderError("Invalid JSON response", 0)
                break
            except Exception as e:
                last_error = ProviderError(str(e), 0)
                break
            if attempt < self._retries - 1:
                time.sleep(2 ** attempt)
        return {"error": str(last_error), "status_code": getattr(last_error, "status_code", 0)}

    def create_video_task(self, prompt: str = "", source_videos: list[str] | None = None,
                          duration: int = 5, model: str = "") -> dict:
        if not self.is_configured:
            return {"error": "APIMart not configured", "status_code": 401}
        body = {"prompt": prompt or "Generate video composition", "duration": duration,
                 "model": model or "doubao-seedance-1-5-pro"}
        if source_videos: body["source_videos"] = source_videos
        result = self._request("POST", "/v1/videos/generations", body)
        if "error" in result: return result
        tid = result.get("task_id") or f"apimart-{uuid.uuid4().hex[:8]}"
        return {"task_id": tid, "status": "queued"}

    def get_task_status(self, task_id: str) -> dict:
        result = self._request("GET", f"/v1/tasks/{task_id}")
        if "error" in result:
            return {"task_id": task_id, "status": "failed", "error": result["error"]}
        raw_status = result.get("status", "unknown")
        return {
            "task_id": task_id,
            "status": raw_status,
            "internal_status": APIMART_STATUS_MAP.get(raw_status, "processing"),
            "progress": result.get("progress", 0),
            "video_url": (result.get("result") or {}).get("video_url", ""),
            "error": (result.get("error") or {}).get("message", ""),
        }

    def cancel_task(self, task_id: str) -> bool:
        result = self._request("POST", f"/v1/tasks/{task_id}/cancel")
        return "error" not in result


_client: APIMartClient | None = None


def get_client() -> APIMartClient:
    global _client
    if _client is None: _client = APIMartClient()
    return _client
