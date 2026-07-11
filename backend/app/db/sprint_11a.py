"""
Sprint 11A-1: composition_states, composition_jobs, final_video_assets tables.
"""

from .migrations import register


@register(version=11, name="sprint_11a_composition_tables")
def apply_sprint_11a(cursor):
    # 1. composition_states — editable configuration per instance
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS composition_states (
            instance_id         TEXT PRIMARY KEY,
            composition_order   TEXT NOT NULL DEFAULT '[]',
            timeline_durations  TEXT NOT NULL DEFAULT '{}',
            version             INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
            created_at          REAL NOT NULL,
            updated_at          REAL NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE
        )
    """)

    # 2. composition_jobs — immutable snapshot of each composition run
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS composition_jobs (
            id                              TEXT PRIMARY KEY,
            instance_id                     TEXT NOT NULL,
            status                          TEXT NOT NULL
                CHECK(status IN ('queued', 'processing', 'completed', 'failed')),
            composition_order_snapshot       TEXT NOT NULL,
            timeline_durations_snapshot      TEXT NOT NULL,
            source_assets_snapshot           TEXT NOT NULL,
            source_state_version             INTEGER NOT NULL CHECK(source_state_version >= 1),
            progress                         INTEGER NOT NULL DEFAULT 0
                CHECK(progress >= 0 AND progress <= 100),
            output_video_url                 TEXT,
            error_message                    TEXT,
            started_at                       REAL,
            completed_at                     REAL,
            created_at                       REAL NOT NULL,
            updated_at                       REAL NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE
        )
    """)

    # 3. final_video_assets — completed composition output versions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS final_video_assets (
            id                  TEXT PRIMARY KEY,
            instance_id         TEXT NOT NULL,
            composition_job_id  TEXT,
            video_url           TEXT NOT NULL,
            version_number      INTEGER NOT NULL CHECK(version_number >= 1),
            version_label       TEXT NOT NULL,
            status              TEXT NOT NULL CHECK(status IN ('completed', 'failed')),
            is_current          INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0, 1)),
            error_message       TEXT,
            created_at          REAL NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE,
            FOREIGN KEY (composition_job_id) REFERENCES composition_jobs(id) ON DELETE SET NULL
        )
    """)

    # Indexes
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_final_video_version_number
        ON final_video_assets(instance_id, version_number)
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_final_video_version_label
        ON final_video_assets(instance_id, version_label)
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_final_video_one_current
        ON final_video_assets(instance_id) WHERE is_current = 1
    """)
