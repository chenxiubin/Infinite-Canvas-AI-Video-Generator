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
        """Verify that force_statuses is allowed on batch generate when TESTING is true."""
        os.environ["TESTING"] = "true"
        
        response = self.client.post("/api/v1/batches/bt_dummy/generate", json={"force_statuses": {"ins_01:S03": "failed"}})
        # Bypassing 403 check should allow the mock stub to return 200 OK.
        self.assertEqual(response.status_code, 200)

if __name__ == "__main__":
    unittest.main()
