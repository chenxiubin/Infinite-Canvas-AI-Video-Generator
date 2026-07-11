"""
Data-access layer for video_asset_versions and video_reviews.
"""

from __future__ import annotations
import time, uuid, sqlite3
from typing import Union


def _parse_version(row):
    if row is None: return None
    return {k: row[k] for k in row.keys()}

def _parse_review(row):
    if row is None: return None
    return {k: row[k] for k in row.keys()}


# ── Video Asset Versions ────────────────────────────────────────────

def create_version(
    cursor, instance_id: str, shot_key: str,
    video_url: str = "", provider: str = "", model: str = "",
    status: str = "pending",
):
    """Create a new video asset version with auto-incremented version_number."""
    now = time.time()
    vid = f"vav_{uuid.uuid4().hex[:8]}"
    cursor.execute(
        "SELECT COALESCE(MAX(version_number), 0) + 1 FROM video_asset_versions WHERE instance_id = ? AND shot_key = ?",
        (instance_id, shot_key),
    )
    vn = cursor.fetchone()[0]
    vl = f"v{vn}"
    cursor.execute(
        """INSERT INTO video_asset_versions
           (id, instance_id, shot_key, version_number, version_label, video_url, provider, model, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (vid, instance_id, shot_key, vn, vl, video_url, provider, model, status, now, now),
    )
    return get_version(cursor, vid)


def get_version(cursor, version_id: str):
    cursor.execute("SELECT * FROM video_asset_versions WHERE id = ?", (version_id,))
    return _parse_version(cursor.fetchone())


def list_versions(cursor, instance_id: str, shot_key: str):
    cursor.execute(
        "SELECT * FROM video_asset_versions WHERE instance_id = ? AND shot_key = ? ORDER BY version_number DESC",
        (instance_id, shot_key),
    )
    return [_parse_version(r) for r in cursor.fetchall()]


def get_latest_version(cursor, instance_id: str, shot_key: str):
    cursor.execute(
        "SELECT * FROM video_asset_versions WHERE instance_id = ? AND shot_key = ? ORDER BY version_number DESC LIMIT 1",
        (instance_id, shot_key),
    )
    return _parse_version(cursor.fetchone())


# ── Video Reviews ───────────────────────────────────────────────────

def create_review(
    cursor, asset_version_id: str,
    review_status: str = "pending", review_reason: str = "",
) -> dict | None:
    """Create or replace review for a specific asset version.
    Each version has at most ONE review record (UNIQUE constraint).
    Uses INSERT OR REPLACE."""
    now = time.time()
    rid = f"rvw_{uuid.uuid4().hex[:8]}"
    reviewed_at = now if review_status in ("approved", "rejected") else None
    cursor.execute(
        """INSERT OR REPLACE INTO video_reviews
           (id, asset_version_id, review_status, review_reason, reviewed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (rid, asset_version_id, review_status, review_reason, reviewed_at, now),
    )
    return get_review(cursor, asset_version_id)


def get_review(cursor, asset_version_id: str):
    cursor.execute("SELECT * FROM video_reviews WHERE asset_version_id = ?", (asset_version_id,))
    return _parse_review(cursor.fetchone())


def list_reviews(cursor, instance_id: str, shot_key: str):
    """Get all reviews for all versions of a shot."""
    cursor.execute(
        """SELECT vr.* FROM video_reviews vr
           JOIN video_asset_versions vav ON vr.asset_version_id = vav.id
           WHERE vav.instance_id = ? AND vav.shot_key = ?
           ORDER BY vav.version_number DESC""",
        (instance_id, shot_key),
    )
    return [_parse_review(r) for r in cursor.fetchall()]
