"""Sprint 11C: Provider Registry + Adapter + Poller tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_11c_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.providers.registry import get_provider, list_providers, register
from app.providers.mock_video_provider import MockVideoProvider
from app.providers.apimart_provider import APIMartProvider
from app.providers.runninghub_provider import RunningHubProvider
from app.providers.base import VideoCompositionProvider

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_ctr=0
def _setup():
    global _ctr;_ctr+=1;iid=f"ins_p{_ctr}"
    conn=_c();cur=conn.cursor()
    now=time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",(iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    from app.repositories.composition_repository import create_composition_state, create_composition_job
    try:create_composition_state(cur,iid,["S01_main"],{"S01_main":5})
    except:pass
    from app.repositories.video_asset_repository import create_version, create_review
    for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
        v=create_version(cur,iid,sk,f"/v/{sk}.mp4");create_review(cur,v["id"],"approved")
    from app.services.composition_snapshot import build_source_snapshot
    snap=build_source_snapshot(cur,iid)
    job=create_composition_job(cur,iid,["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"],{"S01_main":5},snap,1)
    conn.commit();jid=job["id"];conn.close()
    return iid,jid

class TestProviderRegistry(unittest.TestCase):
    def test_pr01_mock_loads(self):
        p=get_provider("mock")
        self.assertIsInstance(p,MockVideoProvider)

    def test_pr02_unknown_raises(self):
        with self.assertRaises(ValueError):
            get_provider("nonexistent")

    def test_pr03_list_all(self):
        names=list_providers()
        self.assertIn("mock",names)
        self.assertIn("apimart",names)
        self.assertIn("runninghub",names)

    def test_pr04_apimart_loads(self):
        p=get_provider("apimart")
        self.assertIsInstance(p,APIMartProvider)

    def test_pr05_runninghub_loads(self):
        p=get_provider("runninghub")
        self.assertIsInstance(p,RunningHubProvider)


class TestAPIMartProvider(unittest.TestCase):
    def test_ap01_validate(self):
        p=APIMartProvider()
        self.assertTrue(p.validate({"shots":[{"shot_key":"S01","review_status":"approved"}]}))
        self.assertFalse(p.validate({"shots":[]}))
        self.assertFalse(p.validate({"shots":[{"shot_key":"S01","review_status":"pending"}]}))

    def test_ap02_compose_returns_provider_job_id(self):
        p=APIMartProvider()
        r=p.compose({"shots":[{"shot_key":"S01","duration":5}]},"j1")
        self.assertIn("apimart-",r["provider_job_id"])
        self.assertEqual(r["provider_name"],"apimart")

    def test_ap03_estimate_duration(self):
        p=APIMartProvider()
        d=p.estimate_duration({"shots":[{"duration":5},{"duration":3}]})
        self.assertEqual(d,12.0)  # (5+3)*1.5

    def test_ap04_worker_uses_provider_from_registry(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        from app.workers.runtime import execute_job
        result=execute_job(cur,jid,provider=get_provider("mock"))
        conn.commit()
        self.assertEqual(result["status"],"completed")
        conn.close()


class TestProviderPoller(unittest.TestCase):
    def test_pp01_mock_not_polled(self):
        from app.workers.provider_poller import poll_pending
        results=poll_pending(os.environ["TEST_DATABASE_PATH"])
        self.assertEqual(len(results),0)  # mock jobs already completed

    def test_pp02_worker_with_apimart(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        from app.workers.runtime import execute_job
        result=execute_job(cur,jid,provider=APIMartProvider())
        conn.commit()
        self.assertEqual(result["status"],"completed")
        self.assertIn("apimart-",result.get("provider_job_id",""))
        conn.close()

    def test_pp03_poller_creates_final_asset(self):
        _,jid=_setup()
        conn=_c();cur=conn.cursor()
        from app.workers.runtime import execute_job
        execute_job(cur,jid,provider=get_provider("mock"))
        conn.commit()
        from app.repositories.final_video_repository import get_by_job_id
        asset=get_by_job_id(cur,jid)
        self.assertIsNotNone(asset)
        conn.close()


if __name__=="__main__":
    unittest.main()
