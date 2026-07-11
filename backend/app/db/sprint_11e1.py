"""Sprint 11E-1: video_generation_specs table."""

from .migrations import register


@register(version=15, name="sprint_11e1_video_generation_specs")
def apply_sprint_11e1(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS video_generation_specs (
            id              TEXT PRIMARY KEY,
            instance_id     TEXT NOT NULL,
            shot_key        TEXT NOT NULL,
            prompt          TEXT NOT NULL DEFAULT '',
            negative_prompt TEXT DEFAULT '',
            camera_motion   TEXT DEFAULT '',
            camera_angle    TEXT DEFAULT '',
            camera_type     TEXT DEFAULT '',
            duration        INTEGER NOT NULL DEFAULT 5,
            aspect_ratio    TEXT DEFAULT '16:9',
            style           TEXT DEFAULT '',
            model_name      TEXT DEFAULT '',
            created_at      REAL NOT NULL,
            updated_at      REAL NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE,
            UNIQUE(instance_id, shot_key)
        )
    """)
