"""Sprint 11B-1: Composition Worker tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_worker_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from main import init_db
from db.migrations import run_migrations
import db.sprint_11a   # noqa
import db.sprint_11a3  # noqa

init_db()
_conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
_conn.execute("PRAGMA foreign_keys = ON")
run_migrations(_conn.cursor())
_conn.commit()
_conn.close()

from app.repositories.composition_repository import (
    create_composition_state, create_composition_job, get_composition_job,
)
from app.workers.composition_worker import run_composition_job
from app.workers.worker_service import can_run


def _fresh_conn():
    c = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def _create_deps(cur):
    now = time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)", (now, now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_w1','b1','p1','t1','desk_calendar','sk','pending',?,?)", (now, now))


_counter = 0

class TestCompositionWorker(unittest.TestCase):

    def _setup_job(self):
        global _counter
        _counter += 1
        iid = f"ins_w{_counter}"
        conn = _fresh_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                    (iid, 'b1', 'p1', 't1', 'desk_calendar', 'sk', 'pending', time.time(), time.time()))
        create_composition_state(cur, iid, ["S01_main"], {"S01_main": 5.0})
        job = create_composition_job(cur, iid, ["S01_main"], {"S01_main": 5.0}, {"shots": []}, source_state_version=1)
        conn.commit()
        jid = job["id"]
        conn.close()
        return jid

    def test_wb01_worker_completes(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        result = run_composition_job(cur, jid)
        conn.commit()
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["progress"], 100)
        self.assertTrue(result["output_video_url"].startswith("/mock-output/"))
        conn.close()

    def test_wb02_progress_updates(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        run_composition_job(cur, jid)
        conn.commit()
        job = get_composition_job(cur, jid)
        self.assertEqual(job["progress"], 100)
        conn.close()

    def test_wb03_worker_failure(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        result = run_composition_job(cur, jid, simulate_failure=True)
        conn.commit()
        self.assertEqual(result["status"], "failed")
        self.assertIn("Simulated", result.get("error_message", ""))
        conn.close()

    def test_wb04_snapshot_preserved(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        original = get_composition_job(cur, jid)
        run_composition_job(cur, jid)
        conn.commit()
        after = get_composition_job(cur, jid)
        self.assertEqual(original["composition_order_snapshot"], after["composition_order_snapshot"])
        self.assertEqual(original["source_state_version"], after["source_state_version"])
        conn.close()

    def test_wb05_cannot_run_completed(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        run_composition_job(cur, jid)
        conn.commit()
        # Second run should not execute (already completed)
        job = get_composition_job(cur, jid)
        self.assertFalse(can_run(job))
        conn.close()

    def test_wb06_can_run_queued(self):
        jid = self._setup_job()
        conn = _fresh_conn()
        cur = conn.cursor()
        job = get_composition_job(cur, jid)
        self.assertTrue(can_run(job))
        conn.close()


if __name__ == "__main__":
    unittest.main()
