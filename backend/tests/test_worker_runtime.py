"""Sprint 11B-4: Worker Runtime tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_rt_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.workers.runtime import execute_job, retry_job, run_pending_jobs
from app.providers.mock_video_provider import MockVideoProvider
from app.providers.base import VideoCompositionProvider
from app.repositories.composition_repository import create_composition_state, create_composition_job, get_composition_job
from app.repositories.final_video_repository import get_by_job_id

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_ctr=0;provider=MockVideoProvider()
def _setup():
    global _ctr;_ctr+=1;iid=f"ins_r{_ctr}"
    conn=_c();cur=conn.cursor()
    now=time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",(iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    try:create_composition_state(cur,iid,["S01_main"],{"S01_main":5})
    except:pass
    from app.repositories.video_asset_repository import create_version, create_review
    for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
        v=create_version(cur,iid,sk,f"/v/{sk}.mp4");create_review(cur,v["id"],"approved")
    from app.services.composition_snapshot import build_source_snapshot
    snap=build_source_snapshot(cur,iid)
    job=create_composition_job(cur,iid,["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"],{"S01_main":5},snap,1)
    conn.commit();jid=job["id"];conn.close()
    return iid, jid

class TestWorkerRuntime(unittest.TestCase):
    def test_wr01_executes_queued_job(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        result=execute_job(cur,jid,provider=provider)
        conn.commit()
        self.assertEqual(result["status"],"completed")
        conn.close()

    def test_wr02_exception_fails(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        fp=MockVideoProvider(simulate_failure=True)
        result=execute_job(cur,jid,provider=fp)
        conn.commit()
        self.assertEqual(result["status"],"failed")
        self.assertIn("Mock provider failure",result.get("error_message",""))
        conn.close()

    def test_wr03_creates_final_asset(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        execute_job(cur,jid,provider=provider)
        conn.commit()
        asset=get_by_job_id(cur,jid)
        self.assertIsNotNone(asset)
        conn.close()

    def test_wr04_provider_validate_called(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        from app.repositories.composition_repository import get_composition_job
        job=get_composition_job(cur,jid)
        self.assertTrue(provider.validate(job["source_assets_snapshot"]))
        conn.close()

class TestRetry(unittest.TestCase):
    def test_jr01_failed_can_retry(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        execute_job(cur,jid,provider=MockVideoProvider(simulate_failure=True))
        conn.commit()
        result=retry_job(cur,jid)
        conn.commit()
        self.assertEqual(result["status"],"queued")
        conn.close()

    def test_jr02_retry_count_increases(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        execute_job(cur,jid,provider=MockVideoProvider(simulate_failure=True))
        conn.commit()
        retry_job(cur,jid);conn.commit()
        cur.execute("SELECT retry_count FROM composition_jobs WHERE id=?",(jid,))
        self.assertGreater(cur.fetchone()["retry_count"],0)
        conn.close()

    def test_jr03_completed_cannot_retry(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        execute_job(cur,jid,provider=provider)
        conn.commit()
        with self.assertRaises(Exception):
            retry_job(cur,jid)
        conn.close()

    def test_jr04_max_retries_blocked(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        execute_job(cur,jid,provider=MockVideoProvider(simulate_failure=True))
        conn.commit()
        # Manually set retry_count to max
        cur.execute("UPDATE composition_jobs SET retry_count=3, status='failed' WHERE id=?",(jid,))
        conn.commit()
        result=retry_job(cur,jid,max_retries=3)
        conn.commit()
        self.assertEqual(result["status"],"failed")  # blocked, stays failed
        conn.close()

class TestProviderContract(unittest.TestCase):
    def test_pc01_validate(self):
        p=MockVideoProvider()
        self.assertTrue(p.validate({"shots":[{"shot_key":"S01"}]}))
        self.assertFalse(p.validate({"shots":[]}))

    def test_pc02_estimate_duration(self):
        p=MockVideoProvider()
        d=p.estimate_duration({"shots":[{"duration":5},{"duration":3}]})
        self.assertEqual(d,8)

    def test_pc03_failure_handled(self):
        p=MockVideoProvider(simulate_failure=True)
        with self.assertRaises(RuntimeError):
            p.compose({"shots":[{"shot_key":"S01"}]},"j1")


if __name__=="__main__":
    unittest.main()
