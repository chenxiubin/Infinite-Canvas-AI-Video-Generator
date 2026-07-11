"""Sprint 11B-4: Add provider metadata and retry fields to composition_jobs."""

from .migrations import register


@register(version=13, name="sprint_11b4_job_metadata")
def apply_sprint_11b4(cursor):
    for col, col_def in [
        ("provider_name", "TEXT DEFAULT ''"),
        ("provider_job_id", "TEXT DEFAULT ''"),
        ("retry_count", "INTEGER NOT NULL DEFAULT 0 CHECK(retry_count >= 0)"),
        ("last_error", "TEXT DEFAULT ''"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE composition_jobs ADD COLUMN {col} {col_def}")
        except Exception:
            pass  # Column may already exist
