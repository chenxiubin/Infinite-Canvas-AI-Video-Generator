"""
Sprint 11A-3: video_asset_versions + video_reviews tables.
"""

from .migrations import register


@register(version=12, name="sprint_11a3_video_asset_versions")
def apply_sprint_11a3(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS video_asset_versions (
            id              TEXT PRIMARY KEY,
            instance_id     TEXT NOT NULL,
            shot_key        TEXT NOT NULL,
            version_number  INTEGER NOT NULL CHECK(version_number >= 1),
            version_label   TEXT NOT NULL,
            video_url       TEXT NOT NULL DEFAULT '',
            provider        TEXT DEFAULT '',
            model           TEXT DEFAULT '',
            status          TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'success', 'failed')),
            created_at      REAL NOT NULL,
            updated_at      REAL NOT NULL,
            FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE,
            UNIQUE(instance_id, shot_key, version_number),
            UNIQUE(instance_id, shot_key, version_label)
        )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vav_shot ON video_asset_versions(instance_id, shot_key)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS video_reviews (
            id                  TEXT PRIMARY KEY,
            asset_version_id    TEXT NOT NULL,
            review_status       TEXT NOT NULL DEFAULT 'pending'
                CHECK(review_status IN ('pending', 'approved', 'rejected')),
            review_reason       TEXT DEFAULT '',
            reviewed_at         REAL,
            created_at          REAL NOT NULL,
            FOREIGN KEY (asset_version_id) REFERENCES video_asset_versions(id) ON DELETE CASCADE,
            UNIQUE(asset_version_id)
        )
    """)
