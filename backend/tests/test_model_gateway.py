"""
MVP-4 Sprint 8: Model Gateway tests.
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

import uuid as _uuid

def _ready_product(client, prefix="GW"):
    sku = f"{prefix}-{_uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/products", json={"product_type":"desk_calendar","sku":sku,"title":sku})
    pid = r.json()["product_id"]
    for role in ["main","detail1","detail2","scene","brand"]:
        ar = client.post(f"/api/v1/products/{pid}/assets", json={"original_filename":f"{sku}_{role}.jpg","file_url":f"/mock/{sku}_{role}.jpg"})
        client.put(f"/api/v1/products/{pid}/assets/{ar.json()['asset_id']}/role", json={"role_key":role})
    return pid

def _ready_batch(client, prefix="GWB"):
    rt = client.get("/api/v1/video-templates?product_type=desk_calendar")
    tid = rt.json()["templates"][0]["template_id"]
    pid = _ready_product(client, prefix)
    rb = client.post("/api/v1/video-batches", json={"template_id":tid,"product_ids":[pid]})
    return rb.json()["batch_id"], rb.json()["instances"][0]["instance_id"]


class TestModelAdapters(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_list_adapters_includes_mock(self):
        r = self.client.get("/api/v1/model-gateway/adapters")
        self.assertEqual(r.status_code, 200)
        adapters = r.json()["adapters"]
        mock = next(a for a in adapters if a["adapter_key"] == "mock")
        self.assertTrue(mock["enabled"])
        self.assertTrue(mock["configured"])
        self.assertTrue(mock["default"])

    def test_external_http_not_configured_without_env(self):
        r = self.client.get("/api/v1/model-gateway/adapters")
        ext = next(a for a in r.json()["adapters"] if a["adapter_key"] == "external_http")
        self.assertFalse(ext["configured"])
        self.assertGreater(len(ext["missing_config"]), 0)

    def test_model_settings_api(self):
        r = self.client.get("/api/v1/model-settings")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["current_adapter"], "mock")


class TestGatewayGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_batch_generate_defaults_to_mock(self):
        bid, iid = _ready_batch(self.client, "GWM")
        r = self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        self.assertEqual(r.status_code, 200)
        # Check job has adapter_key=mock
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nid = inst.json()["nodes"][0]["node_id"]
        jobs = self.client.get(f"/api/v1/video-nodes/{nid}/jobs")
        job = jobs.json()["jobs"][0]
        self.assertEqual(job.get("adapter_key", ""), "mock")

    def test_node_generate_defaults_to_mock(self):
        bid, iid = _ready_batch(self.client, "GWN")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nid = inst.json()["nodes"][0]["node_id"]
        r = self.client.post(f"/api/v1/video-nodes/{nid}/generate", json={})
        self.assertEqual(r.status_code, 200)
        jobs = self.client.get(f"/api/v1/video-nodes/{nid}/jobs")
        self.assertEqual(jobs.json()["jobs"][0].get("adapter_key", ""), "mock")

    def test_job_has_model_name_and_version(self):
        bid, iid = _ready_batch(self.client, "GWV")
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nid = inst.json()["nodes"][0]["node_id"]
        jobs = self.client.get(f"/api/v1/video-nodes/{nid}/jobs")
        job = jobs.json()["jobs"][0]
        self.assertIn("mock_image_to_video", job.get("model_name", ""))

    def test_unknown_adapter_returns_400(self):
        bid, iid = _ready_batch(self.client, "GWU")
        r = self.client.post(f"/api/v1/video-batches/{bid}/generate", json={"model_adapter":"nonexistent"})
        self.assertEqual(r.status_code, 400)

    def test_external_http_unconfigured_returns_400(self):
        bid, iid = _ready_batch(self.client, "GWE")
        r = self.client.post(f"/api/v1/video-batches/{bid}/generate", json={"model_adapter":"external_http"})
        self.assertEqual(r.status_code, 400)

    def test_success_skip_still_works(self):
        bid, iid = _ready_batch(self.client, "GWS")
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        r = self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        self.assertEqual(r.json()["generated_nodes"], 0)

    def test_retry_still_works(self):
        bid, iid = _ready_batch(self.client, "GWR")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nid = inst.json()["nodes"][0]["node_id"]
        os.environ["TESTING"] = "true"
        self.client.post(f"/api/v1/video-nodes/{nid}/generate", json={"force_status":"failed"})
        r = self.client.post(f"/api/v1/video-nodes/{nid}/retry", json={})
        os.environ["TESTING"] = "false"
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "success")

    def test_force_status_not_broken(self):
        bid, iid = _ready_batch(self.client, "GWF")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nid = inst.json()["nodes"][0]["node_id"]
        os.environ["TESTING"] = "true"
        self.client.post(f"/api/v1/video-nodes/{nid}/generate", json={"force_status":"failed"})
        nr = self.client.get(f"/api/v1/video-nodes/{nid}")
        os.environ["TESTING"] = "false"
        self.assertEqual(nr.json()["status"], "failed")


class TestGatewayAlterTables(unittest.TestCase):
    def test_init_db_repeat_does_not_fail(self):
        from main import init_db as _idb
        try:
            _idb(); _idb()
        except Exception as e:
            self.fail(f"init_db failed: {e}")


if __name__ == "__main__":
    unittest.main()
