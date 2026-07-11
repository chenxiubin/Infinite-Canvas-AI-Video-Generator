"""Sprint 11B-2: Composition Snapshot Builder tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_snap_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3  # noqa
init_db()
_conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
_conn.execute("PRAGMA foreign_keys = ON"); run_migrations(_conn.cursor()); _conn.commit(); _conn.close()

from app.services.composition_snapshot import build_source_snapshot, SnapshotBlockedError
from app.repositories.video_asset_repository import create_version, create_review
from app.repositories.composition_repository import create_composition_state


def _fresh_conn():
    c = sqlite3.connect(os.environ["TEST_DATABASE_PATH"]); c.row_factory = sqlite3.Row; c.execute("PRAGMA foreign_keys = ON"); return c

def _seed(cur, iid="ins_s1"):
    now = time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)", (now, now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    try:
        create_composition_state(cur, iid, ["S01_main"], {"S01_main": 5.0})
    except Exception:
        pass  # state may already exist


class TestSnapshotBuilder(unittest.TestCase):

    def _setup_with_shots(self, approved_count=6):
        conn = _fresh_conn(); cur = conn.cursor()
        iid = f"ins_s{approved_count}"
        _seed(cur, iid)
        REQUIRED = ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]
        for i, sk in enumerate(REQUIRED):
            v = create_version(cur, iid, sk, f"/v/{sk}.mp4")
            if i < approved_count:
                create_review(cur, v["id"], "approved")
            elif i == approved_count:
                create_review(cur, v["id"], "pending")
            else:
                pass  # no review
        conn.commit(); conn.close()
        return iid

    def test_cs01_all_approved_snapshot(self):
        iid = self._setup_with_shots(6)
        conn = _fresh_conn(); cur = conn.cursor()
        snap = build_source_snapshot(cur, iid)
        self.assertEqual(len(snap["shots"]), 6)
        for s in snap["shots"]:
            self.assertEqual(s["review_status"], "approved")
        conn.close()

    def test_cs02_pending_blocks(self):
        iid = self._setup_with_shots(2)  # only 2 approved, 1 pending, rest no review
        conn = _fresh_conn(); cur = conn.cursor()
        with self.assertRaises(SnapshotBlockedError) as ctx:
            build_source_snapshot(cur, iid)
        reasons = {b["shot_key"]: b["reason"] for b in ctx.exception.blocked_shots}
        self.assertIn("pending", reasons.values())
        conn.close()

    def test_cs03_no_review_blocks(self):
        iid = self._setup_with_shots(1)  # only 1 approved, rest no review
        conn = _fresh_conn(); cur = conn.cursor()
        with self.assertRaises(SnapshotBlockedError) as ctx:
            build_source_snapshot(cur, iid)
        reasons = {b["reason"] for b in ctx.exception.blocked_shots}
        self.assertIn("not_reviewed", reasons)
        conn.close()

    def test_cs04_snapshot_contains_metadata(self):
        iid = self._setup_with_shots(6)
        conn = _fresh_conn(); cur = conn.cursor()
        snap = build_source_snapshot(cur, iid)
        for s in snap["shots"]:
            self.assertIn("video_asset_version_id", s)
            self.assertIn("version_label", s)
        conn.close()


class TestVideoProvider(unittest.TestCase):

    def test_vp01_mock_returns_url(self):
        from app.providers.mock_video_provider import MockVideoProvider
        p = MockVideoProvider()
        result = p.compose({"shots": [{"shot_key": "S01", "duration": 5}]}, "job1")
        self.assertIn("/mock-output/", result["video_url"])
        self.assertEqual(result["duration"], 5)

    def test_vp02_mock_failure(self):
        from app.providers.mock_video_provider import MockVideoProvider
        p = MockVideoProvider(simulate_failure=True)
        with self.assertRaises(RuntimeError):
            p.compose({"shots": []}, "job1")

    def test_vp03_worker_uses_provider(self):
        from app.repositories.composition_repository import create_composition_job, get_composition_job
        from app.workers.composition_worker import run_composition_job
        from app.providers.mock_video_provider import MockVideoProvider
        conn = _fresh_conn(); cur = conn.cursor()
        iid = f"ins_vp{int(time.time())}"
        _seed(cur, iid)
        job = create_composition_job(cur, iid, ["S01"], {"S01": 5}, {"shots": [{"shot_key":"S01","duration":5}]}, 1)
        conn.commit()
        jid = job["id"]
        provider = MockVideoProvider()
        result = run_composition_job(cur, jid, provider=provider)
        conn.commit()
        self.assertEqual(result["status"], "completed")
        self.assertIn("/mock-output/", result.get("output_video_url",""))
        conn.close()


if __name__ == "__main__":
    unittest.main()
