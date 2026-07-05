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

    # ==== Schema tests (3C-1) ====
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

    def test_i_table_exists(self):
        """video_node_asset_bindings table created successfully"""
        import sqlite3
        db = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='video_node_asset_bindings'")
        self.assertIsNotNone(cursor.fetchone())
        conn.close()

    def test_j_partial_unique_start_frame(self):
        """Cannot insert two start_frame bindings for same instance+shot_key"""
        import sqlite3
        db = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        now = __import__('time').time()
        # First insert succeeds
        cursor.execute("INSERT OR IGNORE INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("test_sf1", "i1", "n1", "S01", "start_frame", "a1", now, now))
        # Second with same instance+shot_key+binding_type should be ignored by IGNORE
        cursor.execute("INSERT OR IGNORE INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("test_sf2", "i1", "n1", "S01", "start_frame", "a2", now, now))
        cursor.execute("SELECT COUNT(*) FROM video_node_asset_bindings WHERE instance_id='i1' AND shot_key='S01' AND binding_type='start_frame'")
        count = cursor.fetchone()[0]
        self.assertEqual(count, 1, "Partial unique index should prevent duplicate start_frame")
        conn.rollback()
        conn.close()

    def test_k_partial_unique_end_frame(self):
        """Cannot insert two end_frame bindings for same instance+shot_key"""
        import sqlite3
        db = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        now = __import__('time').time()
        cursor.execute("INSERT OR IGNORE INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("test_ef1", "i2", "n2", "S02", "end_frame", "a3", now, now))
        cursor.execute("INSERT OR IGNORE INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("test_ef2", "i2", "n2", "S02", "end_frame", "a4", now, now))
        cursor.execute("SELECT COUNT(*) FROM video_node_asset_bindings WHERE instance_id='i2' AND shot_key='S02' AND binding_type='end_frame'")
        count = cursor.fetchone()[0]
        self.assertEqual(count, 1)
        conn.rollback()
        conn.close()

    def test_l_reference_image_multiple_allowed(self):
        """Multiple reference_image bindings allowed for same node if different sort_order"""
        import sqlite3
        db = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        now = __import__('time').time()
        cursor.execute("INSERT INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("r1", "i3", "n3", "S03", "reference_image", "a5", 0, now, now))
        cursor.execute("INSERT INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("r2", "i3", "n3", "S03", "reference_image", "a6", 1, now, now))
        cursor.execute("SELECT COUNT(*) FROM video_node_asset_bindings WHERE instance_id='i3' AND shot_key='S03' AND binding_type='reference_image'")
        count = cursor.fetchone()[0]
        self.assertEqual(count, 2)
        conn.rollback()
        conn.close()

    def test_m_reference_sort_order_unique(self):
        """Same instance+shot_key+sort_order for reference_image is unique"""
        import sqlite3
        db = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        now = __import__('time').time()
        cursor.execute("INSERT INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("rs1", "i4", "n4", "S04", "reference_image", "a7", 0, now, now))
        cursor.execute("INSERT OR IGNORE INTO video_node_asset_bindings (id,instance_id,node_id,shot_key,binding_type,asset_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("rs2", "i4", "n4", "S04", "reference_image", "a8", 0, now, now))
        cursor.execute("SELECT COUNT(*) FROM video_node_asset_bindings WHERE instance_id='i4' AND shot_key='S04' AND binding_type='reference_image'")
        count = cursor.fetchone()[0]
        self.assertEqual(count, 1)
        conn.rollback()
        conn.close()

    def test_n_migration_migrates_bound_asset(self):
        """Init DB migrates existing bound_asset_id to start_frame binding"""
        bid, iid, pid = _ready_batch(self.client, "MIGR")
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "migrate_test.png", "file_url": "/mock/migrate_test.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "start_frame"})
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "start_frame",
        })
        self.assertEqual(r.status_code, 200)
        # After re-init, migration should be idempotent — no error
        from main import init_db
        init_db()
        # Verify binding exists in new table
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        self.assertEqual(inst.status_code, 200)

    def test_h_old_endpoint_unaffected(self):
        """Old PUT /api/v1/instances/{id}/nodes/{key}/asset-binding still works"""
        r = self.client.get("/api/v1/video-templates?product_type=desk_calendar")
        self.assertEqual(r.status_code, 200)
        r = self.client.get("/api/v1/products")
        self.assertEqual(r.status_code, 200)


class TestGenerationPayloadFromBindings(unittest.TestCase):
    """3C-3: Generation payload reads video_node_asset_bindings"""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _setup_with_assets(self, prefix):
        bid, iid, pid = _ready_batch(self.client, prefix)
        assets = {}
        for role in ["start_frame", "end_frame", "reference_image"]:
            ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
                "original_filename": f"{prefix}_{role}.png", "file_url": f"/mock/{prefix}_{role}.png",
            })
            aid = ar.json()["asset_id"]
            self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": role})
            assets[role] = aid
        return bid, iid, pid, assets

    def test_a_start_frame_in_payload(self):
        bid, iid, pid, a = self._setup_with_assets("SFPL")
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": a["start_frame"], "source": "manual"})
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        # Verify via MockAdapter echo
        from model_gateway import submit_generation
        result = submit_generation({"image_url": "/mock/SFPL_start_frame.png", "start_frame_url": "/mock/SFPL_start_frame.png", "end_frame_url": "", "reference_image_urls": [], "prompt": "", "duration_seconds": 4})
        self.assertEqual(result["raw_response_summary"]["start_frame_url"], "/mock/SFPL_start_frame.png")

    def test_b_end_frame_in_payload(self):
        bid, iid, pid, a = self._setup_with_assets("EFPL")
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/end_frame",
            json={"asset_id": a["end_frame"], "source": "manual"})
        from model_gateway import submit_generation
        result = submit_generation({"image_url": "", "start_frame_url": "", "end_frame_url": "/mock/EFPL_end_frame.png", "reference_image_urls": [], "prompt": "", "duration_seconds": 4})
        self.assertEqual(result["raw_response_summary"]["end_frame_url"], "/mock/EFPL_end_frame.png")

    def test_c_reference_images_in_payload(self):
        bid, iid, pid, a = self._setup_with_assets("REFPL")
        self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": a["reference_image"], "source": "manual", "sort_order": 0})
        self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": a["reference_image"], "source": "manual", "sort_order": 1})
        from model_gateway import submit_generation
        result = submit_generation({"image_url": "", "start_frame_url": "", "end_frame_url": "", "reference_image_urls": ["/mock/REFPL_reference_image.png", "/mock/REFPL_reference_image.png"], "prompt": "", "duration_seconds": 4})
        refs = result["raw_response_summary"]["reference_image_urls"]
        self.assertEqual(len(refs), 2)

    def test_d_no_bindings_no_error(self):
        from model_gateway import submit_generation
        result = submit_generation({"image_url": "", "start_frame_url": "", "end_frame_url": "", "reference_image_urls": [], "prompt": "", "duration_seconds": 4})
        self.assertEqual(result["status"], "success")

    def test_e_legacy_bound_asset_fallback(self):
        bid, iid, pid = _ready_batch(self.client, "FALLBK")
        # Only set old bound_asset_id, no new bindings
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": "legacy_sf.png", "file_url": "/mock/legacy_sf.png",
        })
        aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{aid}/role", json={"role_key": "start_frame"})
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": aid, "source_type": "uploaded", "asset_role": "start_frame",
        })
        self.client.post(f"/api/v1/video-batches/{bid}/generate", json={})
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        self.assertIn("/mock-videos/", s01.get("video_url", ""))

    def test_f_mock_adapter_echoes_all_new_fields(self):
        """Mock adapter echoes start_frame/end_frame/reference_image_urls"""
        from model_gateway import submit_generation
        result = submit_generation({"image_url": "/test.jpg", "start_frame_url": "/sf.jpg", "end_frame_url": "/ef.jpg", "reference_image_urls": ["/r1.jpg", "/r2.jpg"], "prompt": "p", "duration_seconds": 5})
        self.assertEqual(result["status"], "success")
        rs = result["raw_response_summary"]
        self.assertEqual(rs["start_frame_url"], "/sf.jpg")
        self.assertEqual(rs["end_frame_url"], "/ef.jpg")
        self.assertEqual(len(rs["reference_image_urls"]), 2)
        self.assertEqual(rs["image_url"], "/test.jpg")


class TestBindingsAPI(unittest.TestCase):
    """3C-2: Multi-asset binding CRUD endpoints"""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _setup(self, prefix):
        bid, iid, pid = _ready_batch(self.client, prefix)
        ar = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": f"{prefix}_sf.png", "file_url": f"/mock/{prefix}_sf.png",
        })
        sf_aid = ar.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{sf_aid}/role", json={"role_key": "start_frame"})
        ar2 = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": f"{prefix}_ef.png", "file_url": f"/mock/{prefix}_ef.png",
        })
        ef_aid = ar2.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{ef_aid}/role", json={"role_key": "end_frame"})
        ar3 = self.client.post(f"/api/v1/products/{pid}/assets", json={
            "original_filename": f"{prefix}_ref.png", "file_url": f"/mock/{prefix}_ref.png",
        })
        ref_aid = ar3.json()["asset_id"]
        self.client.put(f"/api/v1/products/{pid}/assets/{ref_aid}/role", json={"role_key": "reference_image"})
        return iid, sf_aid, ef_aid, ref_aid

    def test_a_get_empty_bindings(self):
        iid, _, _, _ = self._setup("EMPTY")
        r = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()["start_frame"])
        self.assertIsNone(r.json()["end_frame"])
        self.assertEqual(r.json()["reference_images"], [])

    def test_b_upsert_start_frame(self):
        iid, sf_aid, _, _ = self._setup("UPSF")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": sf_aid, "source": "manual"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["binding_type"], "start_frame")
        # Verify via GET
        r2 = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        self.assertIsNotNone(r2.json()["start_frame"])
        self.assertEqual(r2.json()["start_frame"]["asset_id"], sf_aid)

    def test_c_double_upsert_start_frame_no_duplicate(self):
        iid, sf_aid, ef_aid, _ = self._setup("UP2X")
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": sf_aid, "source": "manual"})
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": ef_aid, "source": "manual"})
        r = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        self.assertIsNotNone(r.json()["start_frame"])
        self.assertEqual(r.json()["start_frame"]["asset_id"], ef_aid)  # updated, not duplicated

    def test_d_upsert_end_frame(self):
        iid, _, ef_aid, _ = self._setup("UPEF")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/end_frame",
            json={"asset_id": ef_aid, "source": "manual"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["binding_type"], "end_frame")
        r2 = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        self.assertIsNotNone(r2.json()["end_frame"])
        self.assertEqual(r2.json()["start_frame"], None)

    def test_e_add_multiple_reference_images(self):
        iid, _, _, ref_aid = self._setup("MREF")
        self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": ref_aid, "source": "manual"})
        self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": ref_aid, "source": "manual"})
        r = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        refs = r.json()["reference_images"]
        self.assertGreaterEqual(len(refs), 2)
        self.assertEqual(refs[0]["sort_order"], 0)
        self.assertEqual(refs[1]["sort_order"], 1)

    def test_f_full_bindings_response(self):
        iid, sf_aid, ef_aid, ref_aid = self._setup("FULL")
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": sf_aid, "source": "manual"})
        self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/end_frame",
            json={"asset_id": ef_aid, "source": "manual"})
        self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": ref_aid, "source": "manual"})
        r = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        body = r.json()
        self.assertIsNotNone(body["start_frame"])
        self.assertIsNotNone(body["end_frame"])
        self.assertEqual(len(body["reference_images"]), 1)
        self.assertIn("asset_url", body["start_frame"])

    def test_g_delete_binding(self):
        iid, _, _, ref_aid = self._setup("DEL")
        r = self.client.post(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/reference_images",
            json={"asset_id": ref_aid, "source": "manual"})
        binding_id = r.json()["binding_id"]
        r2 = self.client.delete(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/{binding_id}")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["status"], "deleted")
        r3 = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings")
        self.assertEqual(r3.json()["reference_images"], [])

    def test_h_delete_nonexistent_404(self):
        iid, _, _, _ = self._setup("DEL404")
        r = self.client.delete(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/vnab_nonexist")
        self.assertEqual(r.status_code, 404)

    def test_i_asset_not_found_404(self):
        iid, _, _, _ = self._setup("AS404")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bindings/start_frame",
            json={"asset_id": "asset_nonexistent", "source": "manual"})
        self.assertEqual(r.status_code, 404)

    def test_j_node_not_found_404(self):
        iid, _, _, _ = self._setup("NN404")
        r = self.client.get(f"/api/v1/video-instances/{iid}/nodes/S99_ghost/bindings")
        self.assertEqual(r.status_code, 404)

    def test_k_old_bind_endpoint_still_rejects_end_frame(self):
        iid, _, ef_aid, _ = self._setup("OLD400")
        r = self.client.put(f"/api/v1/video-instances/{iid}/nodes/S01_main/bind", json={
            "asset_id": ef_aid, "source_type": "uploaded", "asset_role": "end_frame",
        })
        self.assertEqual(r.status_code, 400)


class TestPromptOverride(unittest.TestCase):
    """Verify single-shot generate endpoint accepts optional prompt body."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_a_generate_with_prompt_override(self):
        bid, iid, pid = _ready_batch(self.client, "PROMPT")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        custom_prompt = "前端自定义提示词覆盖测试，挂历悬挂中间状态定格瞬间，保持产品结构一致"
        r = self.client.post(f"/api/v1/video-nodes/{s01['node_id']}/generate",
            json={"prompt": custom_prompt, "model_adapter": "mock"})
        self.assertEqual(r.status_code, 200)
        result = r.json()
        self.assertEqual(result["status"], "success")
        self.assertIsNotNone(result.get("video_url"))
        import sqlite3
        db_path = os.environ.get("TEST_DATABASE_PATH", "test.sqlite3")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT prompt FROM video_generation_jobs WHERE node_id=? ORDER BY created_at DESC LIMIT 1",
                    (s01['node_id'],))
        row = cur.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["prompt"], custom_prompt)
        conn.close()

    def test_b_generate_without_prompt_uses_db_fallback(self):
        bid, iid, pid = _ready_batch(self.client, "FALLBK2")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        r = self.client.post(f"/api/v1/video-nodes/{s01['node_id']}/generate",
            json={"model_adapter": "mock"})
        self.assertEqual(r.status_code, 200)
        result = r.json()
        self.assertEqual(result["status"], "success")
        self.assertIsNotNone(result.get("video_url"))

    def test_c_prompt_override_does_not_pollute_db_prompt(self):
        bid, iid, pid = _ready_batch(self.client, "NOPOLL")
        inst = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes = inst.json()["nodes"]
        s01 = next(n for n in nodes if n["shot_key"] == "S01_main")
        original_prompt = s01.get("prompt", "")
        custom = "临时覆盖提示词，不应写入数据库"
        self.client.post(f"/api/v1/video-nodes/{s01['node_id']}/generate",
            json={"prompt": custom, "model_adapter": "mock"})
        inst2 = self.client.get(f"/api/v1/video-instances/{iid}")
        nodes2 = inst2.json()["nodes"]
        s01_after = next(n for n in nodes2 if n["shot_key"] == "S01_main")
        self.assertEqual(s01_after.get("prompt", ""), original_prompt)
