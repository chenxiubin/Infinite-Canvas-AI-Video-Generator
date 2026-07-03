import os
import sys
import unittest
from fastapi.testclient import TestClient

# Add app folder to path to import main
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))

from main import app

class TestSecurityRestriction(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_force_status_forbidden_when_testing_false(self):
        """Verify that force_status query parameter returns 403 Forbidden when TESTING is false."""
        os.environ["TESTING"] = "false"
        
        response = self.client.post("/api/v1/instances/ins_dummy/nodes/S03_detail2/generate?force_status=failed")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "force_status is only allowed in testing environment")

    def test_force_status_allowed_when_testing_true(self):
        """Verify that force_status query parameter is allowed (bypasses 403 check) when TESTING is true."""
        os.environ["TESTING"] = "true"
        
        response = self.client.post("/api/v1/instances/ins_dummy/nodes/S03_detail2/generate?force_status=failed")
        # Bypassing 403 check should proceed to query the database.
        # Since 'ins_dummy' does not exist, it should return 404 Storyboard node not found.
        self.assertEqual(response.status_code, 404)

    def test_batch_force_statuses_forbidden_when_testing_false(self):
        """Verify that force_statuses returns 403 Forbidden on batch generate when TESTING is false."""
        os.environ["TESTING"] = "false"
        
        response = self.client.post("/api/v1/batches/bt_dummy/generate", json={"force_statuses": {"ins_01:S03": "failed"}})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "force_statuses is only allowed in testing environment")

    def test_batch_force_statuses_allowed_when_testing_true(self):
        """Verify that force_statuses is allowed on batch generate when TESTING is true.
        Uses a non-existent batch_id; after passing the 403 gate, should return 404 (batch not found),
        proving the security check was bypassed."""
        os.environ["TESTING"] = "true"

        response = self.client.post("/api/v1/batches/bt_dummy/generate", json={"force_statuses": {"ins_01:S03": "failed"}})
        # Bypassing 403 check proceeds to DB lookup → 404 because bt_dummy doesn't exist.
        self.assertEqual(response.status_code, 404)

    def test_batch_force_statuses_forbidden_with_real_batch(self):
        """Verify that with TESTING=false, a REAL batch with valid force_statuses is still 403 blocked.
        This tests that the security check fires BEFORE force_statuses routing logic,
        not just because the dummy batch_id doesn't exist."""
        os.environ["TESTING"] = "false"

        # Create a real canvas and batch
        cv_resp = self.client.post("/api/v1/canvases")
        self.assertEqual(cv_resp.status_code, 200)
        canvas_id = cv_resp.json()["canvas_id"]

        # Clone 2 instances via batch
        assets = []
        for sku in ["SKU2027-A01", "SKU2027-A02"]:
            for role, fn in [("main", f"{sku}_main.jpg"), ("detail_1", f"{sku}_detail1.jpg")]:
                assets.append({"filename": fn, "url": f"https://example.com/{fn}"})
        batch_resp = self.client.post(
            f"/api/v1/canvases/{canvas_id}/instances/batch",
            json={"template_id": "tpl_hanging", "assets": assets},
        )
        self.assertEqual(batch_resp.status_code, 200)
        batch_id = batch_resp.json()["batch_id"]
        instances = batch_resp.json()["instances"]
        self.assertGreaterEqual(len(instances), 1)
        ins_id = instances[0]["instance_id"]

        # Try generating with valid compound-key force_statuses — must be 403
        gen_resp = self.client.post(
            f"/api/v1/batches/{batch_id}/generate",
            json={"force_statuses": {f"{ins_id}:S02_detail1": "failed"}},
        )
        self.assertEqual(gen_resp.status_code, 403)
        self.assertEqual(gen_resp.json()["detail"], "force_statuses is only allowed in testing environment")

        # Verify no nodes were actually force-set (batch should still be queued, not running)
        batch_check = self.client.get(f"/api/v1/batches/{batch_id}")
        self.assertEqual(batch_check.json()["status"], "queued")

if __name__ == "__main__":
    unittest.main()
