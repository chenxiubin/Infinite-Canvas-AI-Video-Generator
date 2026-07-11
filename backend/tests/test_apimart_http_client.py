"""Sprint 11D-1: APIMart HTTP Client tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_ahc_")
    os.environ["TEST_DATABASE_PATH"] = _path

os.environ.pop("APIMART_API_KEY", None)  # No real key in tests
os.environ.pop("APIMART_BASE_URL", None)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.providers.apimart_client import APIMartClient, _mask_key
from app.providers.apimart_provider import APIMartProvider
from app.providers.registry import get_provider

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_ctr=0
def _setup():
    global _ctr;_ctr+=1;iid=f"ins_h{_ctr}"
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


class TestAPIMartHTTPClient(unittest.TestCase):

    def test_http01_not_configured_without_key(self):
        c = APIMartClient(api_key="")
        self.assertFalse(c.is_configured)

    def test_http02_configured_with_key(self):
        c = APIMartClient(api_key="sk-test-1234")
        self.assertTrue(c.is_configured)

    def test_http03_key_masked_in_repr(self):
        masked = _mask_key("sk-test-key-12345678")
        self.assertIn("****", masked)
        self.assertNotIn("12345678", masked)

    def test_http04_no_key_returns_error(self):
        c = APIMartClient(api_key="")
        result = c.create_video_task()
        self.assertIn("error", result)

    def test_http05_get_status_without_key(self):
        c = APIMartClient(api_key="")
        result = c.get_task_status("task123")
        self.assertIn("error", result)

    def test_http06_provider_fallback_without_key(self):
        p = APIMartProvider(api_key="")
        self.assertFalse(p.is_configured)
        result = p.compose(
            {"shots": [{"shot_key":"S01","duration":5,"review_status":"approved"}]}, "j1"
        )
        self.assertIn("provider_job_id", result)

    def test_http07_provider_get_status_fallback(self):
        p = APIMartProvider(api_key="")
        status = p.get_status("task1")
        self.assertEqual(status["status"], "success")

    def test_http08_full_pipeline_mock_fallback(self):
        _, jid = _setup()
        conn = _c(); cur = conn.cursor()
        from app.workers.runtime import execute_job
        result = execute_job(cur, jid, provider=APIMartProvider(api_key=""))
        conn.commit()
        self.assertEqual(result["status"], "completed")
        from app.repositories.final_video_repository import get_by_job_id
        self.assertIsNotNone(get_by_job_id(cur, jid))
        conn.close()


if __name__ == "__main__":
    unittest.main()
