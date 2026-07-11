"""Sprint 11A-2: Composition API integration tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_comp_api_")
    os.environ["TEST_DATABASE_PATH"] = _path
else:
    _fd = None

# Add parent app directory to path (existing test pattern)
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from fastapi.testclient import TestClient
from main import app, init_db

# Import migration runner modules
from db.migrations import run_migrations, ensure_schema_migrations_table
import db.sprint_11a  # noqa — registers migration

# Run init_db and explicitly apply migrations (relative imports fail in test context)
init_db()
_conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
_conn.execute("PRAGMA foreign_keys = ON")
run_migrations(_conn.cursor())
_conn.commit()
_conn.close()

client = TestClient(app)


def _create_conn():
    c = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def _create_deps():
    conn = _create_conn()
    cur = conn.cursor()
    now = time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sku','test',?,?)", (now, now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_1','b1','p1','t1','desk_calendar','sku','pending',?,?)", (now, now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_2','b2','p1','t1','desk_calendar','sku2','pending',?,?)", (now, now))
    conn.commit()
    conn.close()


def setUpModule():
    _create_deps()


class TestCompositionStates(unittest.TestCase):

    def test_01_put_creates_state(self):
        r = client.put("/api/v1/composition/composition-states/ins_1", json={
            "composition_order": ["S01_main"], "timeline_durations": {"S01_main": 5.0}, "expected_version": 1,
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["composition_order"], ["S01_main"])
        self.assertEqual(data["version"], 1)

    def test_02_get_state(self):
        r = client.get("/api/v1/composition/composition-states/ins_1")
        self.assertEqual(r.status_code, 200)
        self.assertGreater(r.json()["version"], 0)

    def test_03_get_missing_404(self):
        r = client.get("/api/v1/composition/composition-states/nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_04_version_conflict_409(self):
        # Update succeeds with correct version
        r = client.put("/api/v1/composition/composition-states/ins_1", json={
            "composition_order": ["S01","S02"], "timeline_durations": {}, "expected_version": 1,
        })
        self.assertEqual(r.status_code, 200)
        # Stale version → conflict
        r2 = client.put("/api/v1/composition/composition-states/ins_1", json={
            "composition_order": ["S03"], "timeline_durations": {}, "expected_version": 1,
        })
        self.assertEqual(r2.status_code, 409)

    def test_05_version_increments(self):
        r = client.get("/api/v1/composition/composition-states/ins_1")
        self.assertGreater(r.json()["version"], 1)


class TestCompositionJobs(unittest.TestCase):

    INSTANCE = "ins_2"

    @classmethod
    def setUpClass(cls):
        # Create fresh state for job tests using separate instance
        client.put("/api/v1/composition/composition-states/" + cls.INSTANCE, json={
            "composition_order": ["S01_main"], "timeline_durations": {"S01_main": 5.0}, "expected_version": 1,
        })

    def test_06_no_state_400(self):
        r = client.post("/api/v1/composition/composition-jobs", json={"instance_id": "nonexistent"})
        self.assertEqual(r.status_code, 400)

    def test_07_create_job(self):
        # Need approved shots — create video versions and reviews
        conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        from repositories.video_asset_repository import create_version, create_review
        for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
            v = create_version(cur, self.INSTANCE, sk, f"/v/{sk}.mp4")
            create_review(cur, v["id"], "approved")
        conn.commit(); conn.close()

        r = client.post("/api/v1/composition/composition-jobs", json={"instance_id": self.INSTANCE})
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertEqual(data["status"], "queued")
        self.assertIn("composition_order_snapshot", data)
        self.__class__.last_job_id = data["id"]

    def test_08_get_job(self):
        # Use job created by test_07
        self.assertTrue(hasattr(self.__class__, 'last_job_id'), "test_07 must run first")
        r = client.get(f"/api/v1/composition/composition-jobs/{self.__class__.last_job_id}")
        self.assertEqual(r.status_code, 200)

    def test_09_job_404(self):
        r = client.get("/api/v1/composition/composition-jobs/nonexistent")
        self.assertEqual(r.status_code, 404)


class TestFinalVideoAssets(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Directly create assets via repository (no POST endpoint yet)
        conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        from repositories.composition_repository import create_final_video_asset
        a1 = create_final_video_asset(cur, "ins_1", "/v1.mp4")
        a2 = create_final_video_asset(cur, "ins_1", "/v2.mp4")
        conn.commit()
        conn.close()
        cls.a1_id = a1["id"]
        cls.a2_id = a2["id"]

    def test_10_list_assets(self):
        r = client.get("/api/v1/composition/final-video-assets/ins_1")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.json()), 2)

    def test_11_switch_current(self):
        r = client.put(f"/api/v1/composition/final-video-assets/{self.a1_id}/current?instance_id=ins_1")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["is_current"])

    def test_12_switch_requires_instance_id(self):
        r = client.put(f"/api/v1/composition/final-video-assets/{self.a1_id}/current")
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
