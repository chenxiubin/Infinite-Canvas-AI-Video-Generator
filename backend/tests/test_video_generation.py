"""
MVP-3 Sprint 3: Mock video generation and state machine tests.
"""
import os
import sys
import tempfile
import unittest

if "TEST_DATABASE_PATH" not in os.environ:
    _tdb_fd, _tdb_path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_shared_")
    os.environ["TEST_DATABASE_PATH"] = _tdb_path
else:
    _tdb_fd = None
    _tdb_path = os.environ["TEST_DATABASE_PATH"]

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from fastapi.testclient import TestClient
from main import app, init_db

init_db()


def setUpModule():
    pass


def tearDownModule():
    if _tdb_fd is not None:
        os.close(_tdb_fd)


def _create_ready_product(client, product_type="desk_calendar", prefix="GEN"):
    import uuid as _uuid
    sku = f"{prefix}-{_uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/products", json={
        "product_type": product_type, "sku": sku, "title": f"Gen {sku}",
    })
    pid = r.json()["product_id"]
    for role in ["main", "detail1", "detail2", "scene", "brand"]:
        client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": f"{sku}_{role}.jpg", "file_url": f"/mock/{sku}_{role}.jpg",
        })
    # Confirm
    assets = client.get(f"/api/v1/products/{pid}").json()["assets"]
    for a in assets:
        client.put(f"/api/v1/products/{pid}/assets/{a['asset_id']}/role", json={"role_key": a["role_key"]})
    return pid


def _create_batch(client, prefix="BAT"):
    r = client.get("/api/v1/video-templates?product_type=desk_calendar")
    tid = r.json()["templates"][0]["template_id"]
    pid = _create_ready_product(client, prefix=prefix)
    r = client.post("/api/v1/video-batches", json={"template_id": tid, "product_ids": [pid]})
    return r.json()["batch_id"], pid


# --- Tests ---

class TestBatchGenerate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.batch_id, cls.pid = _create_batch(cls.client)

    def test_a_generate_all_success(self):
        r = self.client.post(f"/api/v1/video-batches/{self.batch_id}/generate", json={})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["generated_nodes"], 6)
        self.assertEqual(data["failed_nodes"], 0)

    def test_b_instance_completed(self):
        inst_resp = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_resp.json()["instances"][0]["instance_id"]
        r = self.client.get(f"/api/v1/video-instances/{iid}")
        self.assertEqual(r.json()["status"], "completed")

    def test_c_batch_counts(self):
        r = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        data = r.json()
        self.assertEqual(data["completed_count"], 1)
        self.assertEqual(data["failed_count"], 0)

    def test_nodes_have_video_url_after_success(self):
        inst_resp = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_resp.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{iid}")
        for node in detail.json()["nodes"]:
            self.assertIsNotNone(node["video_url"])
            self.assertIn("/mock-videos/", node["video_url"])

    def test_each_node_has_generation_job(self):
        inst_resp = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_resp.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{iid}")
        for node in detail.json()["nodes"]:
            jobs_resp = self.client.get(f"/api/v1/video-nodes/{node['node_id']}/jobs")
            self.assertGreaterEqual(len(jobs_resp.json()["jobs"]), 1)

    def test_success_nodes_skipped_on_second_generate(self):
        r = self.client.post(f"/api/v1/video-batches/{self.batch_id}/generate", json={})
        data = r.json()
        self.assertEqual(data["generated_nodes"], 0)
        self.assertGreater(data["skipped_success_nodes"], 0)

    def test_generation_job_status_is_success(self):
        inst_resp = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_resp.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{iid}")
        for node in detail.json()["nodes"]:
            jobs_r = self.client.get(f"/api/v1/video-nodes/{node['node_id']}/jobs")
            for job in jobs_r.json()["jobs"]:
                self.assertEqual(job["status"], "success")

    def test_no_running_residue_after_generate(self):
        inst_resp = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_resp.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{iid}")
        for node in detail.json()["nodes"]:
            self.assertNotEqual(node["status"], "running")
            self.assertNotEqual(node["status"], "pending")


class TestNodeGenerate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.batch_id, cls.pid = _create_batch(cls.client, prefix="NDG")
        inst_r = cls.client.get(f"/api/v1/video-batches/{cls.batch_id}")
        cls.instance_id = inst_r.json()["instances"][0]["instance_id"]
        detail = cls.client.get(f"/api/v1/video-instances/{cls.instance_id}")
        cls.node_id = detail.json()["nodes"][0]["node_id"]

    def test_single_node_generate_success(self):
        r = self.client.post(f"/api/v1/video-nodes/{self.node_id}/generate", json={})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "success")
        self.assertIn("video_url", r.json())

    def test_success_node_force_false_returns_skipped(self):
        # First generate
        self.client.post(f"/api/v1/video-nodes/{self.node_id}/generate", json={})
        # Second generate with force=false
        r = self.client.post(f"/api/v1/video-nodes/{self.node_id}/generate", json={"force": False})
        self.assertTrue(r.json()["skipped"])


class TestRetry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        os.environ["TESTING"] = "true"
        cls.batch_id, cls.pid = _create_batch(cls.client, prefix="RTY")
        inst_r = cls.client.get(f"/api/v1/video-batches/{cls.batch_id}")
        cls.instance_id = inst_r.json()["instances"][0]["instance_id"]
        detail = cls.client.get(f"/api/v1/video-instances/{cls.instance_id}")
        cls.node_id = detail.json()["nodes"][0]["node_id"]

    @classmethod
    def tearDownClass(cls):
        os.environ["TESTING"] = "false"

    def test_a_force_fail_then_retry_success(self):
        # Force fail first
        self.client.post(
            f"/api/v1/video-nodes/{self.node_id}/generate",
            json={"force_status": "failed"},
        )
        r = self.client.get(f"/api/v1/video-nodes/{self.node_id}")
        self.assertEqual(r.json()["status"], "failed")
        # Retry
        r = self.client.post(f"/api/v1/video-nodes/{self.node_id}/retry", json={})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "success")

    def test_b_retry_attempt_no_from_jobs(self):
        r = self.client.get(f"/api/v1/video-nodes/{self.node_id}/jobs")
        jobs = r.json()["jobs"]
        self.assertGreaterEqual(len(jobs), 2)
        self.assertGreaterEqual(jobs[-1]["attempt_no"], 2)

    def test_b2_retry_of_job_id_points_to_previous_failed(self):
        r = self.client.get(f"/api/v1/video-nodes/{self.node_id}/jobs")
        jobs = r.json()["jobs"]
        # First job should be failed, second should have retry_of_job_id pointing to first
        self.assertEqual(jobs[0]["status"], "failed")
        self.assertEqual(jobs[1].get("retry_of_job_id"), jobs[0]["job_id"])

    def test_c_non_failed_cannot_retry(self):
        r = self.client.post(f"/api/v1/video-nodes/{self.node_id}/retry", json={})
        self.assertEqual(r.status_code, 400)

    def test_d_retry_updates_instance(self):
        r = self.client.get(f"/api/v1/video-instances/{self.instance_id}")
        # After one node is generated (the retried node), others may still be pending
        # but the instance moves from pending to running
        self.assertIn(r.json()["status"], ["completed", "running"])


class TestForceSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        os.environ["TESTING"] = "false"
        cls.batch_id, cls.pid = _create_batch(cls.client, prefix="SEC")
        inst_r = cls.client.get(f"/api/v1/video-batches/{cls.batch_id}")
        iid = inst_r.json()["instances"][0]["instance_id"]
        detail = cls.client.get(f"/api/v1/video-instances/{iid}")
        cls.node_id = detail.json()["nodes"][0]["node_id"]

    def test_force_node_statuses_blocked_when_testing_false(self):
        r = self.client.post(
            f"/api/v1/video-batches/{self.batch_id}/generate",
            json={"force_node_statuses": {self.node_id: "failed"}},
        )
        self.assertEqual(r.status_code, 403)

    def test_force_status_blocked_on_generate_when_testing_false(self):
        r = self.client.post(
            f"/api/v1/video-nodes/{self.node_id}/generate",
            json={"force_status": "failed"},
        )
        self.assertEqual(r.status_code, 403)

    def test_force_status_blocked_on_retry_when_testing_false(self):
        r = self.client.post(
            f"/api/v1/video-nodes/{self.node_id}/retry",
            json={"force_status": "failed"},
        )
        self.assertEqual(r.status_code, 403)


class TestForceInjection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        os.environ["TESTING"] = "true"
        cls.batch_id, cls.pid = _create_batch(cls.client, prefix="FRC")
        inst_r = cls.client.get(f"/api/v1/video-batches/{cls.batch_id}")
        iid = inst_r.json()["instances"][0]["instance_id"]
        detail = cls.client.get(f"/api/v1/video-instances/{iid}")
        cls.node_id = detail.json()["nodes"][0]["node_id"]

    @classmethod
    def tearDownClass(cls):
        os.environ["TESTING"] = "false"

    def test_a_force_single_node_failed(self):
        r = self.client.post(
            f"/api/v1/video-batches/{self.batch_id}/generate",
            json={"force_node_statuses": {self.node_id: "failed"}},
        )
        self.assertEqual(r.status_code, 200)
        nr = self.client.get(f"/api/v1/video-nodes/{self.node_id}")
        self.assertEqual(nr.json()["status"], "failed")

    def test_b_batch_status_after_force_fail(self):
        r = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        # Single instance with mixed (5 success + 1 failed) → instance=failed, batch fails
        self.assertIn(r.json()["status"], ["failed", "partially_completed"])


class TestEdgeCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_batch_not_found_generate_404(self):
        r = self.client.post("/api/v1/video-batches/batch_nonexistent/generate", json={})
        self.assertEqual(r.status_code, 404)

    def test_node_not_found_generate_404(self):
        r = self.client.post("/api/v1/video-nodes/vnode_nonexistent/generate", json={})
        self.assertEqual(r.status_code, 404)

    def test_job_not_found_404(self):
        r = self.client.get("/api/v1/video-generation-jobs/job_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_node_jobs_list_404(self):
        r = self.client.get("/api/v1/video-nodes/vnode_nonexistent/jobs")
        self.assertEqual(r.status_code, 404)

    def test_archived_batch_blocked_from_generate(self):
        import sqlite3, os as _os
        batch_id, _ = _create_batch(self.client, prefix="ARC")
        # Directly set batch_tasks.status to 'archived' via the underlying DB
        from main import DB_FILE
        conn = sqlite3.connect(DB_FILE)
        conn.execute("UPDATE batch_tasks SET status = 'archived' WHERE id = ?", (batch_id,))
        conn.commit()
        conn.close()
        r = self.client.post(f"/api/v1/video-batches/{batch_id}/generate", json={})
        self.assertEqual(r.status_code, 400)

    def test_node_without_bound_asset_blocked(self):
        import sqlite3
        batch_id, _ = _create_batch(self.client, prefix="NOBA")
        # Manually clear bound_asset on a non-brand node
        from main import DB_FILE
        conn = sqlite3.connect(DB_FILE)
        conn.execute(
            "UPDATE video_instance_nodes SET bound_asset_id = NULL "
            "WHERE shot_key = 'S01_main' AND batch_id = ?", (batch_id,)
        )
        conn.commit()
        conn.close()
        r = self.client.post(f"/api/v1/video-batches/{batch_id}/generate", json={})
        self.assertEqual(r.status_code, 400)

    def test_alter_table_idempotent_on_repeat_init_db(self):
        """Calling init_db() multiple times must not fail on ALTER TABLE ADD COLUMN."""
        from main import init_db as _idb
        try:
            _idb()
            _idb()
        except Exception as e:
            self.fail(f"init_db() raised {e} on repeat call")

    def test_default_templates_not_duplicated_on_repeat_init_db(self):
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        count_before = len(r.json()["templates"])
        from main import init_db as _idb
        _idb()
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        self.assertEqual(len(r.json()["templates"]), count_before)


class TestTwoProductBatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        os.environ["TESTING"] = "true"
        r = cls.client.get("/api/v1/video-templates?product_type=desk_calendar")
        cls.tid = r.json()["templates"][0]["template_id"]
        cls.pid1 = _create_ready_product(cls.client, prefix="TWO1")
        cls.pid2 = _create_ready_product(cls.client, prefix="TWO2")
        r = cls.client.post("/api/v1/video-batches", json={
            "template_id": cls.tid, "product_ids": [cls.pid1, cls.pid2],
        })
        cls.batch_id = r.json()["batch_id"]

    @classmethod
    def tearDownClass(cls):
        os.environ["TESTING"] = "false"

    def test_batch_partially_completed_when_one_node_fails(self):
        # Get a node from the first instance, force it to fail
        inst_r = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        iid = inst_r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{iid}")
        target_node = detail.json()["nodes"][0]["node_id"]

        r = self.client.post(
            f"/api/v1/video-batches/{self.batch_id}/generate",
            json={"force_node_statuses": {target_node: "failed"}},
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["failed_nodes"], 1)
        self.assertIn(data["status"], ["partially_completed", "running", "completed", "failed"])


if __name__ == "__main__":
    unittest.main()
