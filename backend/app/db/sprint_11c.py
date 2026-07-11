"""Sprint 11C: video_provider_settings + external fields on composition_jobs."""

from .migrations import register


@register(version=14, name="sprint_11c_provider_integration")
def apply_sprint_11c(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS video_provider_settings (
            id              TEXT PRIMARY KEY,
            provider_name   TEXT NOT NULL UNIQUE,
            enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
            api_base        TEXT DEFAULT '',
            api_key_encrypted TEXT DEFAULT '',
            config_json     TEXT DEFAULT '{}',
            created_at      REAL NOT NULL,
            updated_at      REAL NOT NULL
        )
    """)
    for col, col_def in [
        ("external_status", "TEXT DEFAULT ''"),
        ("last_polled_at", "REAL"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE composition_jobs ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    # Seed mock provider as default
    import time
    cursor.execute(
        "INSERT OR IGNORE INTO video_provider_settings (id, provider_name, enabled, api_base, created_at, updated_at) VALUES (?, ?, 1, '', ?, ?)",
        ("vps_mock", "mock", time.time(), time.time()),
    )
