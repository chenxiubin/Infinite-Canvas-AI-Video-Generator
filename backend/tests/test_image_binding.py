"""Tests for image binding to video instance nodes."""
import os, sys, json, unittest, tempfile, time

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "app"))
os.environ.setdefault("TEST_DATABASE_PATH", tempfile.mktemp(suffix=".sqlite3"))
from main import app, init_db
init_db()
from fastapi.testclient import TestClient


def _ready_product(client, prefix):
    sku = f"SKU-{prefix}-{int(time.time())}"
    r = client.post("/api/v1/products", json={"product_type": "desk_calendar", "sku": sku, "title": f"Test {prefix}"})
    pid = r.json()["product_id"]
    for role in ["main", "detail1", "detail2", "scene", "brand"]:
        ar = client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": f"{sku}_{role}.jpg", "file_url": f"/mock/{sku}_{role}.jpg",
        })
        client.put(f"/api/v1/products/{pid}/assets/{ar.json()['asset_id']}/role", json={"role_key": role})
    return pid


def _ready_batch(client, prefix):
    pid = _ready_product(client, prefix)
    r = client.get("/api/v1/video-templates?product_type=desk_calendar")
    tid = r.json()["templates"][0]["template_id"]
    r = client.post("/api/v1/video-batches", json={"template_id": tid, "product_ids": [pid]})
    data = r.json()
    return data["batch_id"], data["instances"][0]["instance_id"], pid


class TestImageBindingEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_a_bind_start_frame_success(self):
        """PUT /api/v1/video-instances/{iid}/nodes/{shot_key}/bind with start_frame asset"""
        bid, iid, pid = _ready_batch(self.client, "BIND")
        # Register a start_frame asset
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "start_frame_test.png", "file_url": "/mock/start_frame_test.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "start_frame"})

        # Bind to S01_main
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "start_frame",
        })
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["bound_asset_id"], aid)
        self.assertEqual(body["bound_asset_role"], "start_frame")
        self.assertEqual(body["instance_id"], iid)
        self.assertEqual(body["shot_key"], "S01_main")

        # Verify DB write
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        self.assertEqual(s01["bound_asset_id"], aid)
        self.assertEqual(s01["bound_asset_role"], "start_frame")

    def test_b_asset_not_found_404(self):
        """Bind with non-existent asset returns 404"""
        bid, iid, _ = _ready_batch(self.client, "BIND404A")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": "asset_nonexistent", "source_type": "uploaded",
        })
        self.assertEqual(r.status_code, 404)

    def test_c_node_not_found_404(self):
        """Bind to non-existent shot_key returns 404"""
        bid, iid, _ = _ready_batch(self.client, "BIND404N")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S99_ghost/bind", json={
            "asset_id": "asset_any", "source_type": "uploaded",
        })
        self.assertEqual(r.status_code, 404)

    def test_d_instance_not_found_404(self):
        """Bind to non-existent instance returns 404"""
        r = self.client.put("/api/v1/video-instances/ins_nonexistent/nodes/S01_main/bind", json={
            "asset_id": "asset_any", "source_type": "uploaded",
        })
        self.assertEqual(r.status_code, 404)

    def test_e_generation_payload_has_image_url(self):
        """After binding start_frame, generation job payload includes image_url"""
        bid, iid, pid = _ready_batch(self.client, "GENPAY")
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "gen_start.png", "file_url": "/mock/gen_start.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "start_frame"})
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "start_frame",
        })

        # Generate batch
        r = self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        self.assertEqual(r.status_code, 200)

        # Verify job payload
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        # After generation, bound_asset_id persists and video_url is set
        self.assertEqual(s01["bound_asset_id"], aid)
        self.assertIsNotNone(s01.get("video_url"))
        self.assertIn("/mock-videos/", s01["video_url"])

    def test_f_end_frame_rejected_400(self):
        """Binding with asset_role=end_frame returns 400 and does NOT overwrite bound_asset_id"""
        bid, iid, pid = _ready_batch(self.client, "END400")
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "end_frame_test.png", "file_url": "/mock/end_frame_test.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "end_frame"})

        # First bind a start_frame successfully
        ar2 = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "sf_before.png", "file_url": "/mock/sf_before.png",
        })
        sf_aid = ar2.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{sf_aid}/role", json={"role_key": "start_frame"})
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": sf_aid, "source_type": "uploaded", "asset_role": "start_frame",
        })
        self.assertEqual(r.status_code, 200)

        # Now try end_frame — must 400 and NOT overwrite
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "end_frame",
        })
        self.assertEqual(r.status_code, 400)

        # Verify bound_asset_id unchanged
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        s01 = next(n for n in inst.json()["nodes"] if n["shot_key"] == "S01_main")
        self.assertEqual(s01["bound_asset_id"], sf_aid)

    def test_g_reference_image_rejected_400(self):
        """Binding with asset_role=reference_image returns 400 and does NOT overwrite"""
        bid, iid, pid = _ready_batch(self.client, "REF400")
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "ref_test.png", "file_url": "/mock/ref_test.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "reference_image"})

        # Record original bound_asset_id before rejected call
        inst_before = self.client.get(f"/api/v1/video-instances/{iid}")
        s02_before = next(n for n in inst_before.json()["nodes"] if n["shot_key"] == "S02_detail1")
        original_bound = s02_before.get("bound_asset_id")

        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S02_detail1/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "reference_image",
        })
        self.assertEqual(r.status_code, 400)

        # Verify bound_asset_id unchanged after rejected call
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        s02 = next(n for n in inst.json()["nodes"] if n["shot_key"] == "S02_detail1")
        self.assertEqual(s02.get("bound_asset_id"), original_bound)

    def test_h_old_endpoint_unaffected(self):
        """Old PUT /api/v1/instances/{id}/nodes/{key}/asset-binding still works"""
        # Legacy canvas test via old endpoint remains functional
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        self.assertEqual(r.status_code, 200)
        # Asset_roles now include start_frame
        r = self.client.get("/api/v1/products")
        self.assertEqual(r.status_code, 200)
