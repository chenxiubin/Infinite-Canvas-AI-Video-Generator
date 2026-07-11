"""
Composition Snapshot Builder — generates source_assets_snapshot from video_asset_versions.

Only approved shots are included. Pending/rejected shots block job creation.
"""

import sqlite3
from app.repositories.video_asset_repository import list_versions, list_reviews


class SnapshotBlockedError(Exception):
    """Raised when some shots are not ready for composition."""
    def __init__(self, blocked_shots: list[dict]):
        self.blocked_shots = blocked_shots
        super().__init__(f"{len(blocked_shots)} shot(s) not ready")


def build_source_snapshot(cursor: sqlite3.Cursor, instance_id: str) -> dict:
    """
    Build a complete source_assets_snapshot for a composition job.

    Returns dict with 'shots' array containing only approved shots.
    Raises SnapshotBlockedError if any required shot is not approved.

    Currently uses a hardcoded shot list. In production, this should be
    derived from the instance's template configuration.
    """
    REQUIRED_SHOTS = ["S01_main", "S02_detail1", "S03_detail2", "S04_motion", "S05_scene", "S06_brand"]

    shots = []
    blocked = []

    for sk in REQUIRED_SHOTS:
        versions = list_versions(cursor, instance_id, sk)
        latest = versions[0] if versions else None

        if latest is None:
            blocked.append({"shot_key": sk, "reason": "no_version"})
            continue

        reviews = list_reviews(cursor, instance_id, sk)
        current_review = reviews[0] if reviews else None

        if current_review is None:
            blocked.append({"shot_key": sk, "reason": "not_reviewed"})
            continue

        if current_review["review_status"] != "approved":
            blocked.append({"shot_key": sk, "reason": current_review["review_status"]})
            continue

        # 11E-1: Include generation spec snapshot (frozen at job creation)
        from app.repositories.video_generation_repository import get_spec_snapshot
        gen_spec = get_spec_snapshot(cursor, instance_id, sk)

        shots.append({
            "shot_key": sk,
            "video_asset_version_id": latest["id"],
            "video_url": latest["video_url"],
            "duration": gen_spec.get("duration") or 5,
            "review_status": "approved",
            "version_label": latest["version_label"],
            "generation_spec": gen_spec,
        })

    if blocked:
        raise SnapshotBlockedError(blocked)

    return {"shots": shots, "generated_at": __import__("time").time()}
