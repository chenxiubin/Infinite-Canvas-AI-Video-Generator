"""Provider Registry — returns provider instances by name. Worker never imports specific providers."""

from app.providers.base import VideoCompositionProvider
from app.providers.mock_video_provider import MockVideoProvider

_registry: dict[str, type[VideoCompositionProvider]] = {"mock": MockVideoProvider}


def register(name: str):
    """Decorator to register a provider class under a given name."""
    def decorator(cls: type[VideoCompositionProvider]):
        _registry[name] = cls
        return cls
    return decorator


def get_provider(name: str = "mock", **kwargs) -> VideoCompositionProvider:
    cls = _registry.get(name)
    if cls is None:
        raise ValueError(f"Unknown provider: {name}")
    return cls(**kwargs)


def list_providers() -> list[str]:
    return list(_registry.keys())
