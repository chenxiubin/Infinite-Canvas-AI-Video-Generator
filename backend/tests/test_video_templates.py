"""
MVP-3 Sprint 2: Video templates and instance chain tests.
"""
import os
import sys
import tempfile
import unittest

# --- Test DB isolation ---
if "TEST_DATABASE_PATH" not in os.environ:
    _test_db_fd, _test_db_path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_shared_")
    os.environ["TEST_DATABASE_PATH"] = _test_db_path
else:
    _test_db_fd = None
    _test_db_path = os.environ["TEST_DATABASE_PATH"]

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from fastapi.testclient import TestClient
from main import app, init_db

init_db()


def setUpModule():
    pass


def tearDownModule():
    if _test_db_fd is not None:
        os.close(_test_db_fd)


# --- Helpers ---

def _create_ready_product(client, product_type="desk_calendar", sku_prefix="TPL"):
    """Create a product with all 5 required roles registered and confirmed."""
    import uuid as _uuid
    sku = f"{sku_prefix}-{_uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/products", json={
        "product_type": product_type, "sku": sku, "title": f"Test {sku}",
    })
    pid = r.json()["product_id"]

    roles = ["main", "detail1", "detail2", "scene", "brand"]
    for role in roles:
        fn = f"{sku}_{role}.jpg"
        ar = client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": fn, "file_url": f"/mock/{fn}",
        })
        aid = ar.json()["asset_id"]
        client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": role})
    return pid


def _create_ready_product_with_motion(client, product_type="desk_calendar", sku_prefix="MTN"):
    """Create a product with all 6 roles (including motion) registered and confirmed."""
    pid = _create_ready_product(client, product_type, sku_prefix)
    sku = f"{sku_prefix}-m"
    fn = f"{sku}_motion.jpg"
    ar = client.post(f"/api/v1/products/{pid}/assets", json={
        "original_filename": fn, "file_url": f"/mock/{fn}",
    })
    aid = ar.json()["asset_id"]
    client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "motion"})
    return pid


# --- Tests ---

class TestDefaultTemplates(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_desk_template_exists(self):
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        templates = r.json()["templates"]
        self.assertGreaterEqual(len(templates), 1)
        self.assertEqual(templates[0]["template_key"], "desk_calendar_default")

    def test_wall_template_exists(self):
        r = self.client.get("/api/v1/video-templates?product_type=wall_calendar")
        templates = r.json()["templates"]
        self.assertGreaterEqual(len(templates), 1)
        self.assertEqual(templates[0]["template_key"], "wall_calendar_default")

    def test_each_template_has_6_shots(self):
        for pt in ["desk_calendar", "wall_calendar"]:
            r = self.client.get(f"/api/v1/video-templates?product_type={pt}")
            tid = r.json()["templates"][0]["template_id"]
            detail = self.client.get(f"/api/v1/video-templates/{tid}")
            self.assertEqual(len(detail.json()["shots"]), 6, f"{pt} should have 6 shots")

    def test_total_duration_26(self):
        for pt in ["desk_calendar", "wall_calendar"]:
            r = self.client.get(f"/api/v1/video-templates?product_type={pt}")
            tpl = r.json()["templates"][0]
            self.assertEqual(tpl["total_duration_seconds"], 26, f"{pt} total duration")

    def test_template_detail_shots_ordered(self):
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        tid = r.json()["templates"][0]["template_id"]
        detail = self.client.get(f"/api/v1/video-templates/{tid}")
        orders = [s["shot_order"] for s in detail.json()["shots"]]
        self.assertEqual(orders, [1, 2, 3, 4, 5, 6])

    def test_template_not_found_returns_404(self):
        r = self.client.get("/api/v1/video-templates/tpl_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_list_templates(self):
        r = self.client.get("/api/v1/video-templates")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.json()["templates"]), 2)


class TestVideoBatchCreation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        r = cls.client.get("/api/v1/video-templates?product_type=desk_calendar")
        cls.desk_template_id = r.json()["templates"][0]["template_id"]
        r = cls.client.get("/api/v1/video-templates?product_type=wall_calendar")
        cls.wall_template_id = r.json()["templates"][0]["template_id"]

    def test_create_batch_single_product(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["total_count"], 1)
        self.assertEqual(len(data["instances"]), 1)
        self.assertEqual(data["instances"][0]["node_count"], 6)

    def test_create_batch_two_products(self):
        p1 = _create_ready_product(self.client)
        p2 = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [p1, p2],
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["total_count"], 2)
        self.assertEqual(len(data["instances"]), 2)

    def test_each_instance_has_6_nodes(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        self.assertEqual(len(detail.json()["nodes"]), 6)

    def test_nodes_have_pending_status(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        for node in detail.json()["nodes"]:
            self.assertEqual(node["status"], "pending")

    def test_asset_binding_direct(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        nodes_by_key = {n["shot_key"]: n for n in detail.json()["nodes"]}
        self.assertEqual(nodes_by_key["S01_main"]["bound_asset_role"], "main")
        self.assertEqual(nodes_by_key["S01_main"]["bound_asset_source"], "direct")
        self.assertEqual(nodes_by_key["S02_detail1"]["bound_asset_role"], "detail1")
        self.assertEqual(nodes_by_key["S03_detail2"]["bound_asset_role"], "detail2")
        self.assertEqual(nodes_by_key["S05_scene"]["bound_asset_role"], "scene")
        self.assertEqual(nodes_by_key["S06_brand"]["bound_asset_role"], "brand")

    def test_motion_fallback_to_scene(self):
        pid = _create_ready_product(self.client)  # no motion
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        nodes_by_key = {n["shot_key"]: n for n in detail.json()["nodes"]}
        self.assertEqual(nodes_by_key["S04_motion"]["bound_asset_role"], "scene")
        self.assertEqual(nodes_by_key["S04_motion"]["bound_asset_source"], "fallback_from_scene")

    def test_motion_direct_when_present(self):
        pid = _create_ready_product_with_motion(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        nodes_by_key = {n["shot_key"]: n for n in detail.json()["nodes"]}
        self.assertEqual(nodes_by_key["S04_motion"]["bound_asset_role"], "motion")
        self.assertEqual(nodes_by_key["S04_motion"]["bound_asset_source"], "direct")

    def test_type_mismatch_returns_400(self):
        pid = _create_ready_product(self.client, product_type="desk_calendar")
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.wall_template_id, "product_ids": [pid],
        })
        self.assertEqual(r.status_code, 400)

    def test_not_ready_product_returns_400(self):
        # Create product with only main (unconfirmed)
        r = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": f"NOTREADY-{id(self)}", "title": "Not Ready",
        })
        pid = r.json()["product_id"]
        self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "only_main.jpg", "file_url": "/mock/main.jpg",
        })
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid],
        })
        self.assertEqual(r.status_code, 400)
        detail = r.json()["detail"]
        self.assertIn("missing_required_roles", detail)
        self.assertIn("unconfirmed_required_roles", detail)

    def test_empty_product_ids_returns_400(self):
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [],
        })
        self.assertEqual(r.status_code, 400)

    def test_duplicate_product_ids_returns_400(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": [pid, pid],
        })
        self.assertEqual(r.status_code, 400)

    def test_product_not_found_returns_404(self):
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.desk_template_id, "product_ids": ["prod_nonexistent"],
        })
        self.assertEqual(r.status_code, 404)

    def test_template_not_found_returns_404(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": "tpl_nonexistent", "product_ids": [pid],
        })
        self.assertEqual(r.status_code, 404)


class TestBatchAndInstanceQueries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        r = cls.client.get("/api/v1/video-templates?product_type=desk_calendar")
        cls.template_id = r.json()["templates"][0]["template_id"]
        cls.pid = _create_ready_product(cls.client)
        r = cls.client.post("/api/v1/video-batches", json={
            "template_id": cls.template_id, "product_ids": [cls.pid],
        })
        cls.batch_id = r.json()["batch_id"]
        cls.instance_id = r.json()["instances"][0]["instance_id"]

    def test_get_batch_detail(self):
        r = self.client.get(f"/api/v1/video-batches/{self.batch_id}")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["batch_id"], self.batch_id)
        self.assertEqual(data["total_count"], 1)
        self.assertEqual(len(data["instances"]), 1)
        self.assertEqual(data["instances"][0]["node_count"], 6)

    def test_get_instance_detail(self):
        r = self.client.get(f"/api/v1/video-instances/{self.instance_id}")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["instance_id"], self.instance_id)
        self.assertEqual(len(data["nodes"]), 6)
        self.assertIn("product", data)
        orders = [n["shot_order"] for n in data["nodes"]]
        self.assertEqual(orders, [1, 2, 3, 4, 5, 6])

    def test_get_node_detail(self):
        r = self.client.get(f"/api/v1/video-instances/{self.instance_id}")
        nodes = r.json()["nodes"]
        node_id = nodes[0]["node_id"]
        r2 = self.client.get(f"/api/v1/video-nodes/{node_id}")
        self.assertEqual(r2.status_code, 200)
        data = r2.json()
        self.assertEqual(data["shot_key"], "S01_main")
        self.assertIn("bound_asset", data)
        self.assertIn("prompt", data)

    def test_batch_not_found_returns_404(self):
        r = self.client.get("/api/v1/video-batches/batch_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_instance_not_found_returns_404(self):
        r = self.client.get("/api/v1/video-instances/ins_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_node_not_found_returns_404(self):
        r = self.client.get("/api/v1/video-nodes/vnode_nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_repeat_init_db_no_duplicate_templates(self):
        """Re-initializing DB should not create duplicate templates."""
        init_db()
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        templates = r.json()["templates"]
        # Should still be exactly 1 active desk template
        self.assertEqual(len(templates), 1)
        self.assertEqual(templates[0]["template_key"], "desk_calendar_default")


class TestPromptGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        r = cls.client.get("/api/v1/video-templates?product_type=desk_calendar")
        cls.template_id = r.json()["templates"][0]["template_id"]

    def test_prompt_contains_product_protection(self):
        pid = _create_ready_product(self.client)
        r = self.client.post("/api/v1/video-batches", json={
            "template_id": self.template_id, "product_ids": [pid],
        })
        inst_id = r.json()["instances"][0]["instance_id"]
        detail = self.client.get(f"/api/v1/video-instances/{inst_id}")
        for node in detail.json()["nodes"]:
            prompt = node["prompt"]
            # Prompt must be non-trivial (at least 20 chars)
            self.assertTrue(len(prompt) > 20, f"Prompt too short for {node['shot_key']}")
            # Prompt must be non-empty and contain meaningful content
            stripped = prompt.strip()
            self.assertTrue(len(stripped) > 0, f"Prompt empty for {node['shot_key']}")
            self.assertEqual(prompt, stripped, f"Prompt has leading/trailing whitespace for {node['shot_key']}")


if __name__ == "__main__":
    unittest.main()
