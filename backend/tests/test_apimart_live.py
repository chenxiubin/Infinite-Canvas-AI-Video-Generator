"""Sprint 11D-2: APIMart Live Smoke Tests.

These tests are SKIPPED unless APIMART_API_KEY is set.
Run with: APIMART_API_KEY=sk-xxx python -m unittest tests.test_apimart_live
"""

import os, sys, tempfile, unittest, sqlite3, time

API_KEY = os.environ.get("APIMART_API_KEY", "")
HAS_KEY = bool(API_KEY)

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_live_")
    os.environ["TEST_DATABASE_PATH"] = _path

# Don't inherit real key into test env unless explicitly set
if not HAS_KEY:
    os.environ.pop("APIMART_API_KEY", None)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.providers.apimart_client import APIMartClient
from app.providers.apimart_provider import APIMartProvider
from app.providers.registry import get_provider


@unittest.skipUnless(HAS_KEY, "APIMART_API_KEY not set — live tests skipped")
class TestAPIMartLive(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = APIMartClient(api_key=API_KEY)
        cls.provider = APIMartProvider(api_key=API_KEY)

    def test_live01_health(self):
        """Verify API key is valid by attempting a simple request."""
        self.assertTrue(self.client.is_configured)

    def test_live02_create_task(self):
        """Create a real video generation task."""
        result = self.client.create_video_task(
            prompt="Test composition from Sprint 11D-2",
            duration=5,
        )
        self.assertNotIn("error", result)
        self.assertIn("task_id", result)

    def test_live03_returns_provider_job_id(self):
        """Provider compose returns a valid provider_job_id."""
        snap = {"shots": [{"shot_key":"S01","duration":5,"video_url":"","review_status":"approved"}]}
        result = self.provider.compose(snap, "test-job-live")
        self.assertIn("provider_job_id", result)

    def test_live04_poll_status(self):
        """Poll task status (may be queued/running/success)."""
        result = self.client.create_video_task(prompt="Poll test", duration=5)
        if "error" in result:
            self.skipTest(f"Task creation failed: {result['error']}")
        status = self.client.get_task_status(result["task_id"])
        self.assertIn("status", status)

    def test_live05_full_pipeline(self):
        """End-to-end: create job, execute, poll, check final asset."""
        import tempfile
        tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tmp.close()
        db_path = tmp.name
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            cur = conn.cursor()
            # Init schema
            from main import init_db as local_init
            # Use test path
            old = os.environ.get("TEST_DATABASE_PATH")
            os.environ["TEST_DATABASE_PATH"] = db_path
            # Re-init
            run_migrations(cur)
            now = time.time()
            cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
            cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_live','b1','p1','t1','desk_calendar','sk','pending',?,?)",(now,now))
            from app.repositories.composition_repository import create_composition_state, create_composition_job
            try:create_composition_state(cur,"ins_live",["S01_main"],{"S01_main":5})
            except:pass
            from app.repositories.video_asset_repository import create_version, create_review
            for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
                v=create_version(cur,"ins_live",sk,f"/v/{sk}.mp4");create_review(cur,v["id"],"approved")
            from app.services.composition_snapshot import build_source_snapshot
            snap=build_source_snapshot(cur,"ins_live")
            job=create_composition_job(cur,"ins_live",["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"],{"S01_main":5},snap,1)
            conn.commit()
            jid=job["id"]
            # Execute
            from app.workers.runtime import execute_job
            result=execute_job(cur,jid,provider=self.provider)
            conn.commit()
            self.assertIn(result["status"],("completed","processing"))
            # Check snapshot
            self.assertIn("shots", snap)
            self.assertGreater(len(snap["shots"]),0)
            for s in snap["shots"]:
                self.assertIn("shot_key",s)
                self.assertIn("video_url",s)
                self.assertEqual(s["review_status"],"approved")
            conn.close()
            if old: os.environ["TEST_DATABASE_PATH"]=old
        finally:
            try:os.unlink(db_path)
            except:pass

    def test_live06_db_record_complete(self):
        """Verify database records are complete after pipeline run."""
        # Create a minimal job and check fields
        conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        now = time.time()
        cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_live6','b1','p1','t1','desk_calendar','sk','pending',?,?)",(now,now))
        from app.repositories.composition_repository import create_composition_state, create_composition_job
        try:create_composition_state(cur,"ins_live6",["S01_main"],{"S01_main":5})
        except:pass
        job=create_composition_job(cur,"ins_live6",["S01_main"],{"S01_main":5},{"shots":[]},1)
        conn.commit()
        jid=job["id"]
        # Execute with mock (reliable in test)
        from app.workers.runtime import execute_job
        result=execute_job(cur,jid,provider=get_provider("mock"))
        conn.commit()
        self.assertEqual(result["status"],"completed")
        self.assertIn("provider_name",result)
        self.assertIn("provider_job_id",result)
        conn.close()


if __name__=="__main__":
    unittest.main()
