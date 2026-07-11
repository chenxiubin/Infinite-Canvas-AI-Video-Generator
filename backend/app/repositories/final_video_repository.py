"""Final Video Asset Repository — data access for final_video_assets table."""

import time, uuid, sqlite3


def _parse(row):
    if row is None: return None
    return {k: row[k] for k in row.keys()}


def create_asset(
    cursor, instance_id: str, video_url: str,
    composition_job_id: str | None = None, status: str = "completed",
) -> dict:
    """Create a final video asset with auto-incremented version_number."""
    now = time.time()
    aid = f"finalvid_{uuid.uuid4().hex[:8]}"

    # Compute next version number
    cursor.execute(
        "SELECT COALESCE(MAX(version_number), 0) + 1 FROM final_video_assets WHERE instance_id = ?",
        (instance_id,),
    )
    vn = cursor.fetchone()[0]
    vl = f"v{vn}"

    # Determine if this should be current (first asset always is, or set explicitly)
    cursor.execute(
        "SELECT COUNT(*) as c FROM final_video_assets WHERE instance_id = ?", (instance_id,),
    )
    is_first = cursor.fetchone()["c"] == 0

    # Clear previous current if setting a new one
    cursor.execute(
        "UPDATE final_video_assets SET is_current = 0 WHERE instance_id = ?", (instance_id,),
    )

    cursor.execute(
        """INSERT INTO final_video_assets
           (id, instance_id, composition_job_id, video_url,
            version_number, version_label, status, is_current, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (aid, instance_id, composition_job_id, video_url, vn, vl, status, 1, now),
    )
    return _parse(
        cursor.execute("SELECT * FROM final_video_assets WHERE id = ?", (aid,)).fetchone()
    )


def get_by_job_id(cursor, job_id: str):
    cursor.execute(
        "SELECT * FROM final_video_assets WHERE composition_job_id = ? LIMIT 1", (job_id,),
    )
    return _parse(cursor.fetchone())


def get_current(cursor, instance_id: str):
    cursor.execute(
        "SELECT * FROM final_video_assets WHERE instance_id = ? AND is_current = 1 LIMIT 1",
        (instance_id,),
    )
    return _parse(cursor.fetchone())


def list_assets(cursor, instance_id: str):
    cursor.execute(
        "SELECT * FROM final_video_assets WHERE instance_id = ? ORDER BY version_number DESC",
        (instance_id,),
    )
    return [_parse(r) for r in cursor.fetchall()]


def switch_current(cursor, instance_id: str, asset_id: str):
    """Atomically switch current version."""
    existing = _parse(
        cursor.execute("SELECT * FROM final_video_assets WHERE instance_id = ? AND id = ?",
                       (instance_id, asset_id)).fetchone()
    )
    if existing is None:
        return None, "final video asset not found"
    cursor.execute("UPDATE final_video_assets SET is_current = 0 WHERE instance_id = ?",
                   (instance_id,))
    cursor.execute("UPDATE final_video_assets SET is_current = 1 WHERE id = ?", (asset_id,))
    return get_current(cursor, instance_id), None
