"""Sprint 11A-3: Video Asset Versions API tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_va_")
    os.environ["TEST_DATABASE_PATH"] = _path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from fastapi.testclient import TestClient
from main import app, init_db

from db.migrations import run_migrations
import db.sprint_11a     # noqa
import db.sprint_11a3    # noqa

init_db()
_conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
_conn.execute("PRAGMA foreign_keys = ON")
run_migrations(_conn.cursor())
_conn.commit()
_conn.close()

client = TestClient(app)

IID = "ins_va1"
SK = "S01_main"


def _create_deps():
    conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sku','t',?,?)", (now, now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (IID,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    conn.commit()
    conn.close()


def setUpModule():
    _create_deps()


class TestVideoAssetVersions(unittest.TestCase):

    def test_01_create_version(self):
        r = client.post(f"/api/v1/video-assets/{IID}/{SK}", json={"video_url": "/v1.mp4", "provider": "mock"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["version_number"], 1)
        self.assertEqual(r.json()["version_label"], "v1")

    def test_02_second_version(self):
        r = client.post(f"/api/v1/video-assets/{IID}/{SK}", json={"video_url": "/v2.mp4"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["version_number"], 2)

    def test_03_list_versions(self):
        r = client.get(f"/api/v1/video-assets/{IID}/{SK}")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["versions"]), 2)
        self.assertIsNotNone(data["latest"])

    def test_04_version_unique(self):
        # Two different shots get independent version numbering
        r1 = client.post(f"/api/v1/video-assets/{IID}/S02_detail1", json={"video_url": "/s2.mp4"})
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r1.json()["version_number"], 1)

    def test_05_instance_isolation(self):
        # Create ins_va2 in DB
        conn = sqlite3.connect(os.environ["TEST_DATABASE_PATH"])
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        now = time.time()
        cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_va2','b2','p1','t1','desk_calendar','sk2','pending',?,?)", (now, now))
        conn.commit()
        conn.close()
        r = client.get(f"/api/v1/video-assets/ins_va2/{SK}")
        self.assertEqual(r.status_code, 200)
        # Different instance should have no versions
        self.assertEqual(len(r.json()["versions"]), 0)


class TestVideoReviews(unittest.TestCase):

    VID = None  # set by setUpClass

    @classmethod
    def setUpClass(cls):
        r = client.post(f"/api/v1/video-assets/{IID}/{SK}", json={"video_url": "/review_test.mp4"})
        cls.VID = r.json()["id"]

    def test_06_review_approve(self):
        r = client.put(f"/api/v1/video-assets/versions/{self.VID}/review", json={"review_status": "approved"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["review_status"], "approved")
        self.assertIsNotNone(r.json()["reviewed_at"])

    def test_07_review_reject_with_reason(self):
        r = client.put(f"/api/v1/video-assets/versions/{self.VID}/review", json={"review_status": "rejected", "review_reason": "bad quality"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["review_status"], "rejected")
        self.assertEqual(r.json()["review_reason"], "bad quality")

    def test_08_get_review(self):
        r = client.get(f"/api/v1/video-assets/versions/{self.VID}/review")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["review_status"], "rejected")

    def test_09_review_404(self):
        r = client.get("/api/v1/video-assets/versions/nonexistent/review")
        self.assertEqual(r.status_code, 404)

    def test_10_list_shows_reviews(self):
        r = client.get(f"/api/v1/video-assets/{IID}/{SK}")
        self.assertEqual(r.status_code, 200)
        self.assertGreater(len(r.json()["reviews"]), 0)


if __name__ == "__main__":
    unittest.main()
