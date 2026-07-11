"""Sprint 11D-3: Provider Resilience tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_res_")
    os.environ["TEST_DATABASE_PATH"] = _path
os.environ.pop("APIMART_API_KEY", None)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.providers.apimart_client import APIMartClient, _is_retryable, APIMART_STATUS_MAP, ProviderError
from app.providers.apimart_provider import APIMartProvider
from app.workers.runtime import execute_job
from app.workers.poller_runtime import PollerRuntime, JOB_TIMEOUT

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_ctr=0
def _setup(approved=6):
    global _ctr;_ctr+=1;iid=f"ins_r{_ctr}"
    conn=_c();cur=conn.cursor()
    now=time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",(iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    from app.repositories.composition_repository import create_composition_state, create_composition_job
    try:create_composition_state(cur,iid,["S01_main"],{"S01_main":5})
    except:pass
    from app.repositories.video_asset_repository import create_version, create_review
    REQ=["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]
    for i,sk in enumerate(REQ):
        v=create_version(cur,iid,sk,f"/v/{sk}.mp4")
        if i<approved:create_review(cur,v["id"],"approved")
    from app.services.composition_snapshot import build_source_snapshot
    snap=build_source_snapshot(cur,iid)
    job=create_composition_job(cur,iid,REQ,{"S01_main":5},snap,1)
    conn.commit();jid=job["id"];conn.close()
    return iid,jid


class TestProviderResilience(unittest.TestCase):

    def test_prd01_unconfigured_returns_error(self):
        c = APIMartClient(api_key="")
        r = c.create_video_task()
        self.assertIn("error", r)

    def test_prd02_timeout_job_detected(self):
        # Create a stuck processing job and verify timeout check works
        _, jid = _setup()
        conn = _c(); cur = conn.cursor()
        # Force job into old processing state
        old_time = time.time() - JOB_TIMEOUT - 10
        cur.execute("UPDATE composition_jobs SET status='processing', started_at=? WHERE id=?", (old_time, jid))
        conn.commit()
        # Run timeout check
        rt = PollerRuntime(os.environ["TEST_DATABASE_PATH"])
        rt._check_timeouts()
        cur.execute("SELECT status, error_message FROM composition_jobs WHERE id=?", (jid,))
        row = cur.fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertIn("timeout", row["error_message"])
        conn.close()

    def test_prd03_retry_classification(self):
        self.assertTrue(_is_retryable(0))     # Connection error
        self.assertTrue(_is_retryable(502))
        self.assertTrue(_is_retryable(503))
        self.assertTrue(_is_retryable(504))
        self.assertFalse(_is_retryable(400))
        self.assertFalse(_is_retryable(401))
        self.assertFalse(_is_retryable(404))

    def test_prd04_status_map_complete(self):
        for ext in ("queued","pending","running","processing","success","completed","failed","cancelled"):
            self.assertIn(ext, APIMART_STATUS_MAP, f"Missing mapping for {ext}")
        self.assertEqual(APIMART_STATUS_MAP["success"], "completed")
        self.assertEqual(APIMART_STATUS_MAP["failed"], "failed")
        self.assertEqual(APIMART_STATUS_MAP["cancelled"], "failed")

    def test_prd05_provider_error_handling(self):
        c = APIMartClient(api_key="")
        r = c.create_video_task()
        self.assertIn("error", r)
        status = c.get_task_status("nonexistent")
        self.assertIn("status", status)

    def test_prd06_cancel_returns_bool(self):
        c = APIMartClient(api_key="")
        result = c.cancel_task("task1")
        self.assertIsInstance(result, bool)

    def test_prd07_poller_runtime_lifecycle(self):
        rt = PollerRuntime(os.environ["TEST_DATABASE_PATH"], interval=1)
        self.assertFalse(rt.is_running)
        rt.start()
        self.assertTrue(rt.is_running)
        rt.stop()
        self.assertFalse(rt.is_running)

    def test_prd08_mock_fallback_completes(self):
        _, jid = _setup()
        conn = _c(); cur = conn.cursor()
        result = execute_job(cur, jid, provider=APIMartProvider(api_key=""))
        conn.commit()
        self.assertEqual(result["status"], "completed")
        conn.close()


if __name__=="__main__":
    unittest.main()
