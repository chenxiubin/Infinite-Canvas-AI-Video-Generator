"""
Data-access layer for Sprint 11A-1 composition tables.

All functions receive a *cursor* (sqlite3.Cursor) and leave transaction
management to the caller.
"""

from __future__ import annotations
import json, time, uuid
from typing import Union


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def _parse_state(row: Union[dict, None]):
    """Parse a composition_states row into a dict with proper types."""
    if row is None:
        return None
    return {
        "instance_id": row["instance_id"],
        "composition_order": json.loads(row["composition_order"]),
        "timeline_durations": json.loads(row["timeline_durations"]),
        "version": row["version"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _parse_job(row: Union[dict, None]):
    if row is None:
        return None
    # Include ALL columns (including 11B-4 additions) via generic dict
    d = {k: row[k] for k in row.keys()}
    # Parse JSON fields
    for jf in ("composition_order_snapshot", "timeline_durations_snapshot", "source_assets_snapshot"):
        if jf in d and isinstance(d[jf], str):
            try: d[jf] = json.loads(d[jf])
            except: pass
    return d


def _parse_asset(row: Union[dict, None]):
    if row is None:
        return None
    return {
        "id": row["id"],
        "instance_id": row["instance_id"],
        "composition_job_id": row["composition_job_id"],
        "video_url": row["video_url"],
        "version_number": row["version_number"],
        "version_label": row["version_label"],
        "status": row["status"],
        "is_current": bool(row["is_current"]),
        "error_message": row["error_message"],
        "created_at": row["created_at"],
    }


# ──────────────────────────────────────────────────────────────────────
# composition_states
# ──────────────────────────────────────────────────────────────────────

def get_composition_state(cursor, instance_id: str):
    cursor.execute(
        "SELECT * FROM composition_states WHERE instance_id = ?", (instance_id,)
    )
    return _parse_state(cursor.fetchone())


def create_composition_state(
    cursor,
    instance_id: str,
    composition_order: list[str] | None = None,
    timeline_durations: dict[str, float] | None = None,
):
    now = time.time()
    cursor.execute(
        """INSERT INTO composition_states
           (instance_id, composition_order, timeline_durations, version, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)""",
        (
            instance_id,
            json.dumps(composition_order or []),
            json.dumps(timeline_durations or {}),
            now, now,
        ),
    )
    return get_composition_state(cursor, instance_id)


def update_composition_state(
    cursor,
    instance_id: str,
    composition_order: list[str],
    timeline_durations: dict[str, float],
    expected_version: int,
):
    """Optimistic-lock update.  Returns (new_state | None, error | None)."""
    now = time.time()
    cursor.execute(
        """UPDATE composition_states
           SET composition_order = ?,
               timeline_durations = ?,
               version = version + 1,
               updated_at = ?
           WHERE instance_id = ?
             AND version = ?""",
        (
            json.dumps(composition_order),
            json.dumps(timeline_durations),
            now,
            instance_id,
            expected_version,
        ),
    )
    if cursor.rowcount == 0:
        # Determine if instance doesn't exist or version conflict
        existing = get_composition_state(cursor, instance_id)
        if existing is None:
            return None, "composition state not found"
        return None, "version conflict: expected %d, current %d" % (
            expected_version, existing["version"],
        )
    return get_composition_state(cursor, instance_id), None


# ──────────────────────────────────────────────────────────────────────
# composition_jobs
# ──────────────────────────────────────────────────────────────────────

def create_composition_job(
    cursor,
    instance_id: str,
    composition_order_snapshot: list[str],
    timeline_durations_snapshot: dict[str, float],
    source_assets_snapshot: dict,
    source_state_version: int,
):
    job_id = f"compjob_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO composition_jobs
           (id, instance_id, status,
            composition_order_snapshot, timeline_durations_snapshot,
            source_assets_snapshot, source_state_version,
            progress, created_at, updated_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?, 0, ?, ?)""",
        (
            job_id, instance_id,
            json.dumps(composition_order_snapshot),
            json.dumps(timeline_durations_snapshot),
            json.dumps(source_assets_snapshot),
            source_state_version,
            now, now,
        ),
    )
    return _parse_job(
        cursor.execute("SELECT * FROM composition_jobs WHERE id = ?", (job_id,)).fetchone()
    )


def get_composition_job(cursor, job_id: str):
    cursor.execute("SELECT * FROM composition_jobs WHERE id = ?", (job_id,))
    return _parse_job(cursor.fetchone())


def get_current_composition_job(cursor, instance_id: str):
    """Return the most recent job in 'queued' or 'processing' status."""
    cursor.execute(
        """SELECT * FROM composition_jobs
           WHERE instance_id = ?
             AND status IN ('queued', 'processing')
           ORDER BY created_at DESC
           LIMIT 1""",
        (instance_id,),
    )
    return _parse_job(cursor.fetchone())


def update_composition_job_status(
    cursor, job_id: str, status: str, progress: int | None = None,
    output_video_url: str | None = None, error_message: str | None = None,
):
    now = time.time()
    if status == "processing" and progress is None:
        progress = 0
    updates: list[str] = []
    params: list = []

    updates.append("status = ?"); params.append(status)
    if progress is not None:
        updates.append("progress = ?"); params.append(progress)
    if output_video_url is not None:
        updates.append("output_video_url = ?"); params.append(output_video_url)
    if error_message is not None:
        updates.append("error_message = ?"); params.append(error_message)
    updates.append("updated_at = ?"); params.append(now)

    if status in ("processing",):
        cursor.execute("UPDATE composition_jobs SET started_at = ? WHERE id = ? AND started_at IS NULL",
                       (now, job_id))
    if status in ("completed", "failed"):
        updates.append("completed_at = ?"); params.append(now)

    params.append(job_id)
    cursor.execute(
        f"UPDATE composition_jobs SET {', '.join(updates)} WHERE id = ?", params
    )
    return get_composition_job(cursor, job_id)


# ──────────────────────────────────────────────────────────────────────
# final_video_assets
# ──────────────────────────────────────────────────────────────────────

def create_final_video_asset(
    cursor, instance_id: str, video_url: str,
    composition_job_id: str | None = None, status: str = "completed",
    error_message: str | None = None,
):
    """Create a new final video version, auto-computing version_number."""
    now = time.time()
    asset_id = f"finalvid_{uuid.uuid4().hex[:8]}"
    # Compute next version number inside transaction
    cursor.execute(
        "SELECT COALESCE(MAX(version_number), 0) + 1 FROM final_video_assets WHERE instance_id = ?",
        (instance_id,),
    )
    vn = cursor.fetchone()[0]
    vl = f"v{vn}"
    cursor.execute(
        """INSERT INTO final_video_assets
           (id, instance_id, composition_job_id, video_url,
            version_number, version_label, status, is_current, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (asset_id, instance_id, composition_job_id, video_url, vn, vl, status, error_message, now),
    )
    return _parse_asset(
        cursor.execute("SELECT * FROM final_video_assets WHERE id = ?", (asset_id,)).fetchone()
    )


def list_final_video_assets(cursor, instance_id: str):
    cursor.execute(
        "SELECT * FROM final_video_assets WHERE instance_id = ? ORDER BY version_number DESC",
        (instance_id,),
    )
    return [_parse_asset(r) for r in cursor.fetchall()]


def get_final_video_asset(cursor, instance_id: str, asset_id: str):
    cursor.execute(
        "SELECT * FROM final_video_assets WHERE instance_id = ? AND id = ?",
        (instance_id, asset_id),
    )
    return _parse_asset(cursor.fetchone())


def set_current_final_video(cursor, instance_id: str, asset_id: str):
    """Atomically set one asset as current within an instance."""
    # Validate asset belongs to instance
    asset = get_final_video_asset(cursor, instance_id, asset_id)
    if asset is None:
        return None, "final video asset not found or belongs to different instance"
    # Clear all current flags
    cursor.execute(
        "UPDATE final_video_assets SET is_current = 0 WHERE instance_id = ?",
        (instance_id,),
    )
    # Set target as current
    cursor.execute(
        "UPDATE final_video_assets SET is_current = 1 WHERE id = ?",
        (asset_id,),
    )
    return get_final_video_asset(cursor, instance_id, asset_id), None
