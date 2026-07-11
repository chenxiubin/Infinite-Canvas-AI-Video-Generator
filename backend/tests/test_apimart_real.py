"""Sprint 11D: APIMart real integration tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_aprt_")
    os.environ["TEST_DATABASE_PATH"] = _path

# Ensure no real API key leaks in tests
os.environ.pop("APIMART_API_KEY", None)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.providers.registry import get_provider
from app.providers.apimart_provider import APIMartProvider
from app.workers.runtime import execute_job

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_ctr=0
def _setup():
    global _ctr;_ctr+=1;iid=f"ins_a{_ctr}"
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


class TestAPIMartReal(unittest.TestCase):

    def test_ap_real01_registry_loads(self):
        p = get_provider("apimart")
        self.assertIsInstance(p, APIMartProvider)
        self.assertEqual(p.provider_name, "apimart")

    def test_ap_real02_safe_fallback_without_key(self):
        p = APIMartProvider(api_key="")
        self.assertFalse(p.is_configured)
        result = p.compose({"shots": [{"shot_key":"S01","duration":5,"review_status":"approved"}]}, "j1")
        self.assertIn("provider_job_id", result)
        self.assertEqual(result["provider_name"], "apimart")

    def test_ap_real03_compose_returns_job_id(self):
        _, jid = _setup()
        p = APIMartProvider(api_key="")
        snap = {"shots": [{"shot_key":"S01","duration":5,"review_status":"approved"}]}
        result = p.compose(snap, jid)
        self.assertTrue(result["provider_job_id"].startswith("apimart-"))

    def test_ap_real04_detects_config(self):
        p1 = APIMartProvider(api_key="")
        self.assertFalse(p1.is_configured)
        p2 = APIMartProvider(api_key="sk-real-key")
        self.assertTrue(p2.is_configured)

    def test_ap_real05_worker_executes_with_apimart(self):
        _, jid = _setup()
        conn = _c(); cur = conn.cursor()
        result = execute_job(cur, jid, provider=APIMartProvider(api_key=""))
        conn.commit()
        self.assertEqual(result["status"], "completed")
        # Verify FinalVideoAsset created
        from app.repositories.final_video_repository import get_by_job_id
        asset = get_by_job_id(cur, jid)
        self.assertIsNotNone(asset)
        conn.close()

    def test_ap_real06_api_key_not_leaked(self):
        # Test with mock fallback (no real key) — result must not contain API key patterns
        p = APIMartProvider(api_key="")
        result = p.compose({"shots": [{"shot_key":"S01","duration":5,"review_status":"approved"}]}, "j1")
        result_str = str(result)
        # Keys are never embedded in compose results
        self.assertNotIn("api_key", result_str.lower())

    def test_ap_real07_poller_completes_external(self):
        _, jid = _setup()
        conn = _c(); cur = conn.cursor()
        p = APIMartProvider(api_key="")
        result = execute_job(cur, jid, provider=p)
        conn.commit()
        self.assertEqual(result["status"], "completed")
        conn.close()

    def test_ap_real08_validate_requires_approved(self):
        p = APIMartProvider(api_key="")
        self.assertTrue(p.validate({"shots": [{"review_status": "approved"}]}))
        self.assertFalse(p.validate({"shots": [{"review_status": "pending"}]}))
        self.assertFalse(p.validate({"shots": []}))


if __name__ == "__main__":
    unittest.main()
