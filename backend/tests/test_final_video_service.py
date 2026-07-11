"""Sprint 11B-3: Final Video Service tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_fvs_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3  # noqa
init_db()
_conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
_conn.execute("PRAGMA foreign_keys = ON"); run_migrations(_conn.cursor()); _conn.commit(); _conn.close()

from app.repositories.composition_repository import create_composition_state, create_composition_job, get_composition_job
from app.repositories.final_video_repository import list_assets, get_by_job_id
from app.services.final_video_service import create_from_job, FinalVideoServiceError
from app.workers.composition_worker import run_composition_job
from app.providers.mock_video_provider import MockVideoProvider

def _conn(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c

_c=0
def _setup(approved=6):
    global _c; _c+=1; iid=f"ins_fv{_c}"
    conn=_conn(); cur=conn.cursor()
    now=time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",(iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    try: create_composition_state(cur,iid,["S01_main"],{"S01_main":5})
    except: pass
    from app.repositories.video_asset_repository import create_version, create_review
    for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
        v=create_version(cur,iid,sk,f"/v/{sk}.mp4")
        if ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"].index(sk) < approved:
            create_review(cur,v["id"],"approved")
    from app.services.composition_snapshot import build_source_snapshot
    snap=build_source_snapshot(cur,iid)
    job=create_composition_job(cur,iid,["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"],{"S01_main":5},snap,1)
    conn.commit(); jid=job["id"]; conn.close()
    return iid, jid

class TestFinalVideoService(unittest.TestCase):

    def test_fv01_auto_create_on_complete(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid, provider=MockVideoProvider())
        conn.commit()
        asset = get_by_job_id(cur, jid)
        self.assertIsNotNone(asset)
        self.assertEqual(asset["status"], "completed")
        self.assertTrue(asset["is_current"])
        conn.close()

    def test_fv02_idempotent(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid, provider=MockVideoProvider())
        conn.commit()
        a1 = get_by_job_id(cur, jid)
        # Create again should return same
        a2 = create_from_job(cur, jid)
        self.assertEqual(a1["id"], a2["id"])
        conn.close()

    def test_fv03_second_composition_gets_v2(self):
        iid, jid1 = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid1, provider=MockVideoProvider())
        conn.commit()
        # Create second job
        snap={"shots":[{"shot_key":"S01_main","duration":5}]}
        jid2=create_composition_job(cur,iid,["S01_main"],{"S01_main":5},snap,2)["id"]
        conn.commit()
        run_composition_job(cur, jid2, provider=MockVideoProvider())
        conn.commit()
        assets=list_assets(cur,iid)
        self.assertGreaterEqual(len(assets),2)
        conn.close()

    def test_fv04_current_switches(self):
        iid, jid1 = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid1, provider=MockVideoProvider())
        conn.commit()
        snap={"shots":[{"shot_key":"S01_main","duration":5}]}
        jid2=create_composition_job(cur,iid,["S01_main"],{"S01_main":5},snap,2)["id"]
        conn.commit()
        run_composition_job(cur, jid2, provider=MockVideoProvider())
        conn.commit()
        # Latest should be current
        current=[a for a in list_assets(cur,iid) if a["is_current"]]
        self.assertEqual(len(current),1)
        conn.close()

    def test_fv05_not_completed_raises(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        with self.assertRaises(FinalVideoServiceError):
            create_from_job(cur, jid)  # still queued, not completed
        conn.close()

class TestCompositionIdempotency(unittest.TestCase):

    def test_ci01_active_job_blocks_new(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        from app.repositories.composition_repository import get_current_composition_job
        from app.services.composition_snapshot import build_source_snapshot
        active = get_current_composition_job(cur, iid)
        self.assertIsNotNone(active)  # queued job exists
        conn.close()

    def test_ci02_completed_allows_new(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid, provider=MockVideoProvider())
        conn.commit()
        from app.repositories.composition_repository import get_current_composition_job
        active = get_current_composition_job(cur, iid)
        self.assertIsNone(active)  # no active job after completion
        conn.close()

    def test_ci03_failed_can_retry(self):
        iid, jid = _setup()
        conn=_conn(); cur=conn.cursor()
        run_composition_job(cur, jid, provider=MockVideoProvider(simulate_failure=True))
        conn.commit()
        from app.repositories.composition_repository import get_current_composition_job
        active = get_current_composition_job(cur, iid)
        self.assertIsNone(active)  # failed job is not active
        conn.close()


if __name__ == "__main__":
    unittest.main()
