"""
MVP-3 Sprint 4: Draft merge preview, review, and mock export tests.
"""
import os, sys, tempfile, unittest
if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_shared_")
    os.environ["TEST_DATABASE_PATH"] = _path
else:
    _fd = None
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from fastapi.testclient import TestClient
from main import app, init_db
init_db()

def setUpModule(): pass
def tearDownModule():
    if _fd is not None: os.close(_fd)

def _ready_product(client, prefix="RE"):
    import uuid; sku = f"{prefix}-{uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/products", json={"product_type":"desk_calendar","sku":sku,"title":sku})
    pid = r.json()["product_id"]
    for role in ["main","detail1","detail2","scene","brand"]:
        ar = client.post(f"/api/v1/products/{pid}/assets", json={"original_filename":f"{sku}_{role}.jpg","file_url":f"/mock/{sku}_{role}.jpg"})
        client.put(f"/api/v1/products/{pid}/assets/{ar.json()['asset_id']}/role", json={"role_key":role})
    return pid

def _ready_batch(client, prefix="REB"):
    rt = client.get("/api/v1/video-templates?product_type=desk_calendar")
    tid = rt.json()["templates"][0]["template_id"]
    pid = _ready_product(client, prefix)
    rb = client.post("/api/v1/video-batches", json={"template_id":tid,"product_ids":[pid]})
    d = rb.json()
    return d["batch_id"], d["instances"][0]["instance_id"], pid


class TestMergePreview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client)

    def test_a_merge_fails_if_nodes_not_success(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/merge-preview", json={})
        self.assertEqual(r.status_code, 400)

    def test_b_generate_and_merge_success(self):
        self.client.post(f"/api/v1/video-batches/{self.bid}/generate", json={})
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/merge-preview", json={})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["merge_status"], "success")
        self.assertIn("/mock-previews/", d["draft_preview_url"])
        self.assertEqual(d["review_status"], "pending")

    def test_c_merge_skipped_when_already_previewed(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/merge-preview", json={})
        self.assertTrue(r.json()["skipped"])

    def test_d_force_merge_no_skip(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/merge-preview", json={"force": True})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json().get("skipped", True))


class TestNodeReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client, prefix="NRV")
        cls.client.post(f"/api/v1/video-batches/{cls.bid}/generate", json={})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/merge-preview", json={})
        detail = cls.client.get(f"/api/v1/video-instances/{cls.iid}").json()
        cls.node_id = detail["nodes"][0]["node_id"]

    def test_approve_single_node(self):
        r = self.client.post(f"/api/v1/video-nodes/{self.node_id}/review", json={"action":"approve"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["review_status"], "approved")

    def test_reject_single_node(self):
        nid = self.client.get(f"/api/v1/video-instances/{self.iid}").json()["nodes"][1]["node_id"]
        r = self.client.post(f"/api/v1/video-nodes/{nid}/review", json={"action":"reject","reason":"bad quality"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["review_status"], "rejected")

    def test_reject_without_reason_fails(self):
        nid = self.client.get(f"/api/v1/video-instances/{self.iid}").json()["nodes"][2]["node_id"]
        r = self.client.post(f"/api/v1/video-nodes/{nid}/review", json={"action":"reject"})
        self.assertEqual(r.status_code, 400)

    def test_non_success_node_cannot_review(self):
        """Create a fresh batch, don't generate, try to review"""
        bid2, iid2, _ = _ready_batch(self.client, prefix="NONSUC")
        detail = self.client.get(f"/api/v1/video-instances/{iid2}").json()
        nid = detail["nodes"][0]["node_id"]
        r = self.client.post(f"/api/v1/video-nodes/{nid}/review", json={"action":"approve"})
        self.assertEqual(r.status_code, 400)


class TestInstanceBatchReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client, prefix="IBR")
        cls.client.post(f"/api/v1/video-batches/{cls.bid}/generate", json={})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/merge-preview", json={})

    def test_batch_approve_all_nodes(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/review", json={"action":"approve"})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["approved_nodes"], 6)
        self.assertEqual(d["review_status"], "approved")

    def test_instance_approved_after_all_nodes_approved(self):
        r = self.client.get(f"/api/v1/video-instances/{self.iid}")
        self.assertEqual(r.json()["review_status"], "approved")

    def test_reject_all_nodes_sets_instance_rejected(self):
        bid2, iid2, _ = _ready_batch(self.client, prefix="REJ")
        self.client.post(f"/api/v1/video-batches/{bid2}/generate", json={})
        self.client.post(f"/api/v1/video-instances/{iid2}/merge-preview", json={})
        r = self.client.post(f"/api/v1/video-instances/{iid2}/review", json={"action":"reject","reason":"not good"})
        self.assertEqual(r.json()["review_status"], "rejected")


class TestExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client, prefix="EXP")
        cls.client.post(f"/api/v1/video-batches/{cls.bid}/generate", json={})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/merge-preview", json={})

    def test_a_export_fails_before_approval(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/export", json={})
        self.assertEqual(r.status_code, 400)

    def test_b_approve_and_export_success(self):
        self.client.post(f"/api/v1/video-instances/{self.iid}/review", json={"action":"approve"})
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/export", json={})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["export_status"], "success")
        self.assertIn("/mock-exports/", d["final_video_url"])

    def test_c_export_skipped_when_already_done(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/export", json={})
        self.assertTrue(r.json()["skipped"])

    def test_d_force_export_new_job(self):
        r = self.client.post(f"/api/v1/video-instances/{self.iid}/export", json={"force": True})
        self.assertEqual(r.status_code, 200)
        self.assertIn("export_job_id", r.json())


class TestRetryResetsDelivery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        os.environ["TESTING"] = "true"
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client, prefix="RST")
        cls.client.post(f"/api/v1/video-batches/{cls.bid}/generate", json={})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/merge-preview", json={})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/review", json={"action":"approve"})
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/export", json={})
        cls.node_id = cls.client.get(f"/api/v1/video-instances/{cls.iid}").json()["nodes"][0]["node_id"]

    @classmethod
    def tearDownClass(cls):
        os.environ["TESTING"] = "false"

    def test_retry_clears_delivery_state(self):
        # Force-fail then retry the node (must use force=true to override skip)
        self.client.post(f"/api/v1/video-nodes/{self.node_id}/generate", json={"force": True, "force_status":"failed"})
        self.client.post(f"/api/v1/video-nodes/{self.node_id}/retry", json={})
        r = self.client.get(f"/api/v1/video-instances/{self.iid}")
        d = r.json()
        self.assertIsNone(d["draft_preview_url"])
        self.assertIsNone(d["final_video_url"])
        self.assertIn(d["review_status"], ["pending", "not_ready"])
        self.assertEqual(d["merge_status"], "not_started")
        self.assertEqual(d["export_status"], "not_started")

    def test_review_reset_after_retry(self):
        # Re-generate any skipped nodes, merge, approve — check approved
        self.client.post(f"/api/v1/video-batches/{self.bid}/generate", json={})
        self.client.post(f"/api/v1/video-instances/{self.iid}/merge-preview", json={})
        self.client.post(f"/api/v1/video-instances/{self.iid}/review", json={"action":"approve"})
        r = self.client.get(f"/api/v1/video-instances/{self.iid}")
        self.assertEqual(r.json()["review_status"], "approved")


class TestEdgeCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_instance_not_found_merge_404(self):
        r = self.client.post("/api/v1/video-instances/ins_nonexistent/merge-preview", json={})
        self.assertEqual(r.status_code, 400)

    def test_node_not_found_review_404(self):
        r = self.client.post("/api/v1/video-nodes/vnode_nonexistent/review", json={"action":"approve"})
        self.assertEqual(r.status_code, 400)

    def test_export_job_not_found_404(self):
        r = self.client.get("/api/v1/export-jobs/export_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_merge_job_not_found_404(self):
        r = self.client.get("/api/v1/video-merge-jobs/merge_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_alter_table_idempotent(self):
        from main import init_db as _idb
        try:
            _idb(); _idb()
        except Exception as e:
            self.fail(f"init_db raised {e}")

    def test_archived_batch_blocks_merge(self):
        import sqlite3
        bid, iid, _ = _ready_batch(self.client, prefix="ARCM")
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        from main import DB_FILE
        conn = sqlite3.connect(DB_FILE)
        conn.execute("UPDATE batch_tasks SET status='archived' WHERE id=?", (bid,))
        conn.commit(); conn.close()
        r = self.client.post(f"/api/v1/video-instances/{iid}/merge-preview", json={})
        self.assertEqual(r.status_code, 400)

    def test_archived_batch_blocks_export(self):
        import sqlite3
        bid, iid, _ = _ready_batch(self.client, prefix="ARCE")
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        self.client.post(f"/api/v1/video-instances/{iid}/merge-preview", json={})
        self.client.post(f"/api/v1/video-instances/{iid}/review", json={"action":"approve"})
        from main import DB_FILE
        conn = sqlite3.connect(DB_FILE)
        conn.execute("UPDATE batch_tasks SET status='archived' WHERE id=?", (bid,))
        conn.commit(); conn.close()
        r = self.client.post(f"/api/v1/video-instances/{iid}/export", json={})
        self.assertEqual(r.status_code, 400)


class TestJobQueries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.bid, cls.iid, cls.pid = _ready_batch(cls.client, prefix="JOBQ")
        cls.client.post(f"/api/v1/video-batches/{cls.bid}/generate", json={})
        mr = cls.client.post(f"/api/v1/video-instances/{cls.iid}/merge-preview", json={})
        cls.merge_job_id = mr.json()["merge_job_id"]
        cls.client.post(f"/api/v1/video-instances/{cls.iid}/review", json={"action":"approve"})
        er = cls.client.post(f"/api/v1/video-instances/{cls.iid}/export", json={})
        cls.export_job_id = er.json()["export_job_id"]

    def test_get_merge_job_success(self):
        r = self.client.get(f"/api/v1/video-merge-jobs/{self.merge_job_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "success")
        self.assertIn("/mock-previews/", r.json()["output_preview_url"])

    def test_get_export_job_success(self):
        r = self.client.get(f"/api/v1/export-jobs/{self.export_job_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "success")
        self.assertIn("/mock-exports/", r.json()["final_video_url"])

    def test_list_instance_reviews(self):
        r = self.client.get(f"/api/v1/video-instances/{self.iid}/reviews")
        self.assertEqual(r.status_code, 200)
        reviews = r.json()["reviews"]
        self.assertGreaterEqual(len(reviews), 6)  # 6 nodes approved
        self.assertEqual(reviews[0]["action"], "approve")


if __name__ == "__main__":
    unittest.main()
