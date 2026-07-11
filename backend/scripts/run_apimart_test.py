#!/usr/bin/env python
"""Sprint 11D-2: APIMart real generation CLI test tool.

Usage:
  python scripts/run_apimart_test.py [instance_id]

If instance_id is omitted, creates a fresh instance and tests the pipeline.
"""

import os, sys, sqlite3, time, json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def main():
    db_path = os.path.join(os.path.dirname(__file__), "..", "app", "db.sqlite3")
    if not os.path.exists(db_path):
        print("Database not found at", db_path)
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Get or create instance
    iid = sys.argv[1] if len(sys.argv) > 1 else None
    if not iid:
        cur.execute("SELECT id FROM video_instances ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            print("No video instances found. Create one first.")
            sys.exit(1)
        iid = row["id"]

    print(f"Instance: {iid}")

    # 1. Build snapshot
    from app.services.composition_snapshot import build_source_snapshot, SnapshotBlockedError
    try:
        snap = build_source_snapshot(cur, iid)
        print(f"Snapshot: {len(snap['shots'])} approved shots")
        for s in snap["shots"]:
            print(f"  {s['shot_key']}: {s['video_url'][:50]} ({s['duration']}s)")
    except SnapshotBlockedError as e:
        print(f"BLOCKED: {len(e.blocked_shots)} shots not ready")
        for b in e.blocked_shots:
            print(f"  {b['shot_key']}: {b['reason']}")
        sys.exit(1)

    # 2. Create composition state
    from app.repositories.composition_repository import create_composition_state, create_composition_job
    try:
        create_composition_state(cur, iid, [s["shot_key"] for s in snap["shots"]],
                                  {s["shot_key"]: s["duration"] for s in snap["shots"]})
    except Exception:
        pass  # Already exists

    # 3. Create job
    job = create_composition_job(cur, iid,
        [s["shot_key"] for s in snap["shots"]],
        {s["shot_key"]: s["duration"] for s in snap["shots"]},
        snap, 1)
    conn.commit()
    jid = job["id"]
    print(f"Job: {jid}")

    # 4. Execute
    from app.providers.apimart_provider import APIMartProvider
    provider = APIMartProvider()  # Uses env var or mock fallback
    print(f"Provider: {provider.provider_name} (configured: {provider.is_configured})")

    from app.workers.runtime import execute_job
    result = execute_job(cur, jid, provider=provider)
    conn.commit()
    print(f"Status: {result['status']}")
    print(f"Provider Job ID: {result.get('provider_job_id', 'N/A')}")

    # 5. Check final video asset
    from app.repositories.final_video_repository import get_by_job_id
    asset = get_by_job_id(cur, jid)
    if asset:
        print(f"FinalVideoAsset: {asset['id']} ({asset['version_label']}, current={asset['is_current']})")
        print(f"Video URL: {asset['video_url']}")
    else:
        print("FinalVideoAsset: not yet created (job still processing)")

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
