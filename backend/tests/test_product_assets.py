"""
MVP-3 Sprint 1: Product asset package tests.
"""
import os
import sys
import tempfile
import unittest
import uuid

# --- Test DB isolation ---
# Use a shared temp database for all backend tests so `discover` can
# run multiple test modules in the same process without DB conflicts.
if "TEST_DATABASE_PATH" not in os.environ:
    _test_db_fd, _test_db_path = tempfile.mkstemp(
        suffix=".sqlite3", prefix="test_shared_"
    )
    os.environ["TEST_DATABASE_PATH"] = _test_db_path
else:
    _test_db_fd = None
    _test_db_path = os.environ["TEST_DATABASE_PATH"]

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from fastapi.testclient import TestClient
from main import app, init_db

# Ensure the database is initialized before any tests run
# (TestClient does not automatically trigger FastAPI startup events)
init_db()


def setUpModule():
    pass  # DB already initialized above


def tearDownModule():
    """Clean up the temp DB file handle. The file itself and env var are kept
    for other test modules that may run later in the same process (discover)."""
    if _test_db_fd is not None:
        os.close(_test_db_fd)

# Counter for unique SKU generation
_sku_counter = 0


def _unique_sku(prefix: str = "SKU") -> str:
    global _sku_counter
    _sku_counter += 1
    return f"{prefix}-{_sku_counter}-{uuid.uuid4().hex[:4]}"


class TestProductCreation(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_create_desk_calendar_product(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar",
            "sku": "SKU2027-A01",
            "title": "2027新年台历A01",
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["product_type"], "desk_calendar")
        self.assertEqual(data["sku"], "SKU2027-A01")
        self.assertEqual(data["status"], "draft")
        self.assertTrue(data["product_id"].startswith("prod_"))

    def test_create_wall_calendar_product(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "wall_calendar",
            "sku": "SKU2027-B01",
            "title": "2027新年挂历B01",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["product_type"], "wall_calendar")

    def test_invalid_product_type_returns_400(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "invalid_type",
            "sku": "SKU-XXX",
            "title": "Bad",
        })
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_sku_returns_409(self):
        self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "SKU-DUP", "title": "First",
        })
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "SKU-DUP", "title": "Second",
        })
        self.assertEqual(resp.status_code, 409)

    def test_empty_sku_returns_400(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "", "title": "No SKU",
        })
        self.assertEqual(resp.status_code, 400)


class TestAssetRoleInference(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        sku = _unique_sku("ROLE")
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": sku, "title": "Role Inference",
        })
        self.product_id = resp.json()["product_id"]

    def _register(self, filename, file_url=None):
        return self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": filename,
            "file_url": file_url or f"/mock/{filename}",
        })

    def test_infer_main_from_english(self):
        resp = self._register("SKU2027-A01_main.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "main")

    def test_infer_main_from_chinese(self):
        resp = self._register("SKU2027-A01_主图.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "main")

    def test_infer_detail1_from_filename(self):
        resp = self._register("SKU2027-A01_detail1.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "detail1")

    def test_old_detail_1_alias_stored_as_detail1(self):
        """detail_1 in filename should be canonicalized to detail1."""
        resp = self._register("SKU2027-A01_detail_1.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "detail1")

    def test_infer_detail2_from_filename(self):
        resp = self._register("SKU2027-A01_detail2.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "detail2")

    def test_old_detail_2_alias_stored_as_detail2(self):
        resp = self._register("SKU2027-A01_detail_2.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "detail2")

    def test_infer_scene(self):
        resp = self._register("SKU2027-A01_scene.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "scene")

    def test_infer_motion(self):
        resp = self._register("SKU2027-A01_motion.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "motion")

    def test_infer_brand(self):
        resp = self._register("SKU2027-A01_brand.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "brand")

    def test_unrecognized_file_goes_to_unrecognized(self):
        resp = self._register("photo_12345.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role_key"], "unrecognized")
        self.assertEqual(resp.json()["role_confidence"], 0.0)

    def test_auto_role_not_confirmed(self):
        resp = self._register("SKU2027-A01_main.jpg")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["role_confirmed"])
        self.assertEqual(resp.json()["role_source"], "auto")

    def test_asset_registration_product_not_found_returns_404(self):
        resp = self.client.post("/api/v1/products/prod_nonexistent/assets", json={
            "original_filename": "test.jpg",
            "file_url": "/mock/test.jpg",
        })
        self.assertEqual(resp.status_code, 404)


class TestManualRoleConfirmation(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        sku = _unique_sku("ROLE")
        resp = self.client.post("/api/v1/products", json={
            "product_type": "wall_calendar", "sku": sku, "title": "Role Confirm",
        })
        self.product_id = resp.json()["product_id"]

    def _register(self, filename):
        return self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": filename, "file_url": f"/mock/{filename}",
        })

    def test_manual_confirm_role_sets_manual_and_confirmed(self):
        reg = self._register("SKU2027-T02_photo.jpg")  # unrecognized
        asset_id = reg.json()["asset_id"]

        resp = self.client.put(
            f"/api/v1/products/{self.product_id}/assets/{asset_id}/role",
            json={"role_key": "detail1"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["role_key"], "detail1")
        self.assertEqual(data["role_source"], "manual")
        self.assertTrue(data["role_confirmed"])

    def test_invalid_role_key_returns_400(self):
        reg = self._register("SKU2027-T02_test.jpg")
        asset_id = reg.json()["asset_id"]

        resp = self.client.put(
            f"/api/v1/products/{self.product_id}/assets/{asset_id}/role",
            json={"role_key": "nonexistent_role"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_asset_not_found_returns_404(self):
        resp = self.client.put(
            f"/api/v1/products/{self.product_id}/assets/pa_nonexistent/role",
            json={"role_key": "main"},
        )
        self.assertEqual(resp.status_code, 404)


class TestChecklist(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        sku = _unique_sku("CHK")
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": sku, "title": "Checklist Test",
        })
        self.product_id = resp.json()["product_id"]

    def _register_and_confirm(self, filename):
        reg = self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": filename, "file_url": f"/mock/{filename}",
        })
        asset_id = reg.json()["asset_id"]
        role = reg.json()["role_key"]
        if role != "unrecognized":
            self.client.put(
                f"/api/v1/products/{self.product_id}/assets/{asset_id}/role",
                json={"role_key": role},
            )
        return asset_id, role

    def test_checklist_not_ready_when_roles_unconfirmed(self):
        # Register main but don't confirm
        self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": "SKU2027-T03_main.jpg", "file_url": "/mock/main.jpg",
        })
        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_ready"])
        # main has an asset but it's unconfirmed → NOT in missing, IS in unconfirmed
        self.assertNotIn("main", data["missing_required_roles"])
        self.assertIn("main", data["unconfirmed_required_roles"])

    def test_only_main_unconfirmed_all_others_missing(self):
        """Upload only main (unconfirmed): missing = others, unconfirmed = main."""
        self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": "only_main.jpg", "file_url": "/mock/main.jpg",
        })
        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertFalse(data["is_ready"])
        # main has asset but unconfirmed
        self.assertNotIn("main", data["missing_required_roles"])
        self.assertIn("main", data["unconfirmed_required_roles"])
        # detail1, detail2, scene, brand are completely missing
        for role in ["detail1", "detail2", "scene", "brand"]:
            self.assertIn(role, data["missing_required_roles"])

    def test_all_required_uploaded_but_unconfirmed(self):
        """Upload all 5 required roles but don't confirm any."""
        for fn in [
            "SKU_main.jpg", "SKU_detail1.jpg", "SKU_detail2.jpg",
            "SKU_scene.jpg", "SKU_brand.jpg",
        ]:
            self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
                "original_filename": fn, "file_url": f"/mock/{fn}",
            })
        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertFalse(data["is_ready"])
        self.assertEqual(len(data["missing_required_roles"]), 0)
        self.assertEqual(len(data["unconfirmed_required_roles"]), 5)

    def test_checklist_ready_when_all_required_confirmed(self):
        for fn in [
            "SKU_main.jpg", "SKU_detail1.jpg", "SKU_detail2.jpg",
            "SKU_scene.jpg", "SKU_brand.jpg",
        ]:
            self._register_and_confirm(fn)

        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertTrue(data["is_ready"])
        self.assertEqual(len(data["missing_required_roles"]), 0)
        self.assertEqual(len(data["unconfirmed_required_roles"]), 0)

    def test_ready_without_motion(self):
        """Missing motion should NOT block ready."""
        for fn in [
            "SKU_main.jpg", "SKU_detail1.jpg", "SKU_detail2.jpg",
            "SKU_scene.jpg", "SKU_brand.jpg",
        ]:
            self._register_and_confirm(fn)

        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertTrue(data["is_ready"])
        self.assertIn("motion", data["missing_recommended_roles"])

    def test_motion_fallback_to_scene(self):
        for fn in [
            "SKU2027-T03_main.jpg",
            "SKU2027-T03_detail1.jpg",
            "SKU2027-T03_detail2.jpg",
            "SKU2027-T03_scene.jpg",
            "SKU2027-T03_brand.jpg",
        ]:
            self._register_and_confirm(fn)

        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertIn("motion", data["fallback_plan"])
        self.assertEqual(data["fallback_plan"]["motion"]["source_role"], "scene")
        self.assertEqual(data["fallback_plan"]["motion"]["fallback_source"], "fallback_from_scene")

    def test_motion_fallback_to_main_when_scene_missing(self):
        for fn in [
            "SKU2027-T03_main.jpg",
            "SKU2027-T03_detail1.jpg",
            "SKU2027-T03_detail2.jpg",
            "SKU2027-T03_brand.jpg",
        ]:
            self._register_and_confirm(fn)

        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        self.assertIn("motion", data["fallback_plan"])
        self.assertEqual(data["fallback_plan"]["motion"]["source_role"], "main")
        self.assertEqual(data["fallback_plan"]["motion"]["fallback_source"], "fallback_from_main")

    def test_duplicate_role_flagged(self):
        self._register_and_confirm("SKU2027-T03_main.jpg")
        # Register a second main without confirming
        self.client.post(f"/api/v1/products/{self.product_id}/assets", json={
            "original_filename": "SKU2027-T03_main_v2.jpg", "file_url": "/mock/main2.jpg",
        })
        resp = self.client.get(f"/api/v1/products/{self.product_id}/checklist")
        data = resp.json()
        # Role has duplicate assets; not all are confirmed → main is unconfirmed
        self.assertIn("main", data["duplicate_roles"])
        self.assertIn("main", data["unconfirmed_required_roles"])
        self.assertNotIn("main", data["missing_required_roles"])


class TestProductListAndStatus(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_list_products(self):
        self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "SKU-LIST-01", "title": "L1",
        })
        self.client.post("/api/v1/products", json={
            "product_type": "wall_calendar", "sku": "SKU-LIST-02", "title": "L2",
        })
        resp = self.client.get("/api/v1/products")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(len(data), 2)

    def test_list_filter_by_type(self):
        resp = self.client.get("/api/v1/products?product_type=desk_calendar")
        self.assertEqual(resp.status_code, 200)
        for p in resp.json():
            self.assertEqual(p["product_type"], "desk_calendar")

    def test_update_status_to_archived(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "SKU-ARCH-01", "title": "Arch",
        })
        pid = resp.json()["product_id"]
        resp2 = self.client.patch(f"/api/v1/products/{pid}/status", json={"status": "archived"})
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json()["status"], "archived")

    def test_get_product_with_checklist_and_assets(self):
        resp = self.client.post("/api/v1/products", json={
            "product_type": "desk_calendar", "sku": "SKU-DETAIL-01", "title": "Detail",
        })
        pid = resp.json()["product_id"]
        self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "SKU_main.jpg", "file_url": "/mock/main.jpg",
        })
        resp2 = self.client.get(f"/api/v1/products/{pid}")
        self.assertEqual(resp2.status_code, 200)
        data = resp2.json()
        self.assertIn("assets", data)
        self.assertIn("checklist", data)
        self.assertEqual(len(data["assets"]), 1)


if __name__ == "__main__":
    unittest.main()
