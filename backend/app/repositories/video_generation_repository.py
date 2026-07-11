"""Repository for video_generation_specs table."""

import time, uuid, sqlite3


def _parse(row):
    if row is None: return None
    return {k: row[k] for k in row.keys()}


def create_spec(cursor, instance_id: str, shot_key: str, prompt: str = "",
                camera_motion: str = "", duration: int = 5, style: str = "",
                model_name: str = "", negative_prompt: str = "", **kwargs) -> dict:
    now = time.time()
    sid = f"vgs_{uuid.uuid4().hex[:8]}"
    cursor.execute(
        """INSERT INTO video_generation_specs
           (id, instance_id, shot_key, prompt, negative_prompt, camera_motion, camera_angle,
            camera_type, duration, aspect_ratio, style, model_name, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (sid, instance_id, shot_key, prompt, negative_prompt, camera_motion,
         kwargs.get("camera_angle", ""), kwargs.get("camera_type", ""),
         duration, kwargs.get("aspect_ratio", "16:9"), style, model_name, now, now),
    )
    return get_spec(cursor, instance_id, shot_key)


def get_spec(cursor, instance_id: str, shot_key: str):
    cursor.execute(
        "SELECT * FROM video_generation_specs WHERE instance_id = ? AND shot_key = ?",
        (instance_id, shot_key),
    )
    return _parse(cursor.fetchone())


def get_all_specs(cursor, instance_id: str) -> list[dict]:
    cursor.execute(
        "SELECT * FROM video_generation_specs WHERE instance_id = ? ORDER BY shot_key",
        (instance_id,),
    )
    return [_parse(r) for r in cursor.fetchall()]


def get_spec_snapshot(cursor, instance_id: str, shot_key: str) -> dict:
    """Return a frozen spec dict for snapshot embedding."""
    spec = get_spec(cursor, instance_id, shot_key)
    if spec is None:
        return {"shot_key": shot_key, "prompt": "", "camera_motion": "", "duration": 5,
                "style": "", "model_name": "", "negative_prompt": ""}
    return {k: spec.get(k, "") for k in
            ("shot_key", "prompt", "camera_motion", "duration", "style", "model_name", "negative_prompt")}
