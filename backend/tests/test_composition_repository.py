"""Test repository layer for composition tables."""

import unittest, sqlite3, time, tempfile, os, json

from app.repositories.composition_repository import (
    get_composition_state, create_composition_state, update_composition_state,
    create_composition_job, get_composition_job, get_current_composition_job,
    update_composition_job_status,
    create_final_video_asset, list_final_video_assets, get_final_video_asset,
    set_current_final_video,
)


def _fresh_conn(path):
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def _create_deps(cur):
    """Create minimal tables that composition tables depend on."""
    now = time.time()
    cur.execute("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, product_type TEXT, sku TEXT, title TEXT, created_at REAL)")
    cur.execute("CREATE TABLE IF NOT EXISTS video_instances (id TEXT PRIMARY KEY, batch_id TEXT, product_id TEXT, template_id TEXT, product_type TEXT, sku TEXT, status TEXT, created_at REAL, updated_at REAL)")
    cur.execute("INSERT INTO products (id, product_type, sku, title, created_at) VALUES ('p1','desk_calendar','sku','test',?)", (now,))
    cur.execute("INSERT INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_1','b1','p1','t1','desk_calendar','sku','pending',?,?)", (now, now))
    cur.execute("INSERT INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_2','b2','p1','t1','desk_calendar','sku2','pending',?,?)", (now, now))


class TestCompositionState(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.path = self.tmp.name
        self.tmp.close()
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        # Ensure tables exist
        from app.db import sprint_11a  # noqa
        from app.db.migrations import run_migrations
        run_migrations(cur)
        _create_deps(cur)
        conn.commit()
        conn.close()

    def tearDown(self):
        try:
            os.unlink(self.path)
        except PermissionError:
            pass  # Windows may hold file lock briefly

    def _cur(self):
        c = _fresh_conn(self.path)
        return c, c.cursor()

    def test_01_create_state(self):
        conn, cur = self._cur()
        s = create_composition_state(cur, "ins_1", ["S01_main"], {"S01_main": 5.0})
        conn.commit()
        self.assertEqual(s["composition_order"], ["S01_main"])
        self.assertEqual(s["timeline_durations"]["S01_main"], 5.0)
        self.assertEqual(s["version"], 1)

    def test_02_duplicate_instance_rejected(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            create_composition_state(cur, "ins_1")
            conn.commit()

    def test_03_json_roundtrip(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1", ["S01","S02"], {"S01": 3.0, "S02": 7.5})
        conn.commit()
        s = get_composition_state(cur, "ins_1")
        self.assertIsInstance(s["composition_order"], list)
        self.assertIsInstance(s["timeline_durations"], dict)

    def test_04_successful_update(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1", ["S01"], {})
        conn.commit()
        s, err = update_composition_state(cur, "ins_1", ["S01","S02"], {"S01": 2.0}, expected_version=1)
        conn.commit()
        self.assertIsNone(err)
        self.assertEqual(s["version"], 2)
        self.assertEqual(s["composition_order"], ["S01","S02"])

    def test_05_version_conflict(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        # First update succeeds
        update_composition_state(cur, "ins_1", ["S01"], {}, 1)
        conn.commit()
        # Second update with stale version fails
        _, err = update_composition_state(cur, "ins_1", ["S02"], {}, 1)
        self.assertIsNotNone(err)
        self.assertIn("version conflict", err)

    def test_06_conflict_preserves_old_data(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1", ["S01"], {"S01": 5.0})
        conn.commit()
        update_composition_state(cur, "ins_1", ["S01","S02"], {}, 1)
        conn.commit()
        # Stale update
        update_composition_state(cur, "ins_1", ["S03"], {}, 1)
        conn.commit()
        s = get_composition_state(cur, "ins_1")
        self.assertEqual(s["composition_order"], ["S01","S02"])

    def test_07_nonexistent_instance_update(self):
        conn, cur = self._cur()
        _, err = update_composition_state(cur, "nonexistent", ["S01"], {}, 1)
        self.assertIsNotNone(err)


class TestCompositionJob(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.path = self.tmp.name
        self.tmp.close()
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        from app.db import sprint_11a  # noqa
        from app.db.migrations import run_migrations
        run_migrations(cur)
        _create_deps(cur)
        conn.commit()
        conn.close()

    def tearDown(self):
        try:
            os.unlink(self.path)
        except PermissionError:
            pass  # Windows may hold file lock briefly

    def _cur(self):
        c = _fresh_conn(self.path)
        return c, c.cursor()

    def test_08_create_job_snapshot(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        j = create_composition_job(cur, "ins_1", ["S01"], {"S01": 3.0}, {"shots": []}, source_state_version=1)
        conn.commit()
        self.assertEqual(j["status"], "queued")
        self.assertEqual(j["composition_order_snapshot"], ["S01"])

    def test_09_snapshot_immutable_after_update(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        j = create_composition_job(cur, "ins_1", ["S01"], {}, {"shots": []}, 1)
        conn.commit()
        update_composition_job_status(cur, j["id"], "processing")
        conn.commit()
        j2 = get_composition_job(cur, j["id"])
        self.assertEqual(j2["composition_order_snapshot"], ["S01"])
        self.assertEqual(j2["status"], "processing")

    def test_10_current_job_only_returns_active(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        j1 = create_composition_job(cur, "ins_1", ["S01"], {}, {"s": []}, 1)
        conn.commit()
        update_composition_job_status(cur, j1["id"], "completed")
        conn.commit()
        j2 = create_composition_job(cur, "ins_1", ["S02"], {}, {"s": []}, 1)
        conn.commit()
        active = get_current_composition_job(cur, "ins_1")
        self.assertIsNotNone(active)
        self.assertEqual(active["status"], "queued")
        self.assertEqual(active["id"], j2["id"])

    def test_11_completed_job_not_current(self):
        conn, cur = self._cur()
        create_composition_state(cur, "ins_1")
        conn.commit()
        j = create_composition_job(cur, "ins_1", ["S01"], {}, {"s": []}, 1)
        conn.commit()
        update_composition_job_status(cur, j["id"], "completed")
        conn.commit()
        self.assertIsNone(get_current_composition_job(cur, "ins_1"))


class TestFinalVideoAsset(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.path = self.tmp.name
        self.tmp.close()
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        from app.db import sprint_11a  # noqa
        from app.db.migrations import run_migrations
        run_migrations(cur)
        _create_deps(cur)
        conn.commit()
        conn.close()

    def tearDown(self):
        try:
            os.unlink(self.path)
        except PermissionError:
            pass  # Windows may hold file lock briefly

    def _cur(self):
        c = _fresh_conn(self.path)
        return c, c.cursor()

    def test_12_first_asset_gets_v1(self):
        conn, cur = self._cur()
        a = create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        self.assertEqual(a["version_number"], 1)
        self.assertEqual(a["version_label"], "v1")

    def test_13_second_asset_gets_v2(self):
        conn, cur = self._cur()
        create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        a2 = create_final_video_asset(cur, "ins_1", "/v2.mp4")
        conn.commit()
        self.assertEqual(a2["version_number"], 2)
        self.assertEqual(a2["version_label"], "v2")

    def test_14_one_current_per_instance(self):
        conn, cur = self._cur()
        a1 = create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        a2 = create_final_video_asset(cur, "ins_1", "/v2.mp4")
        conn.commit()
        # Set a2 as current
        set_current_final_video(cur, "ins_1", a2["id"])
        conn.commit()
        # a1 should NOT be current
        a1check = get_final_video_asset(cur, "ins_1", a1["id"])
        a2check = get_final_video_asset(cur, "ins_1", a2["id"])
        self.assertFalse(a1check["is_current"])
        self.assertTrue(a2check["is_current"])

    def test_15_switch_current(self):
        conn, cur = self._cur()
        a1 = create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        a2 = create_final_video_asset(cur, "ins_1", "/v2.mp4")
        conn.commit()
        set_current_final_video(cur, "ins_1", a1["id"])
        conn.commit()
        set_current_final_video(cur, "ins_1", a2["id"])
        conn.commit()
        self.assertFalse(get_final_video_asset(cur, "ins_1", a1["id"])["is_current"])
        self.assertTrue(get_final_video_asset(cur, "ins_1", a2["id"])["is_current"])

    def test_16_switch_to_wrong_instance_rejected(self):
        conn, cur = self._cur()
        a1 = create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        a2 = create_final_video_asset(cur, "ins_2", "/v2.mp4")
        conn.commit()
        # Try to set ins_2's asset as current for ins_1
        _, err = set_current_final_video(cur, "ins_1", a2["id"])
        self.assertIsNotNone(err)

    def test_17_list_returns_descending(self):
        conn, cur = self._cur()
        create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        create_final_video_asset(cur, "ins_1", "/v2.mp4")
        conn.commit()
        assets = list_final_video_assets(cur, "ins_1")
        self.assertEqual(len(assets), 2)
        self.assertEqual(assets[0]["version_number"], 2)

    def test_18_cascade_delete_cleans_assets(self):
        conn, cur = self._cur()
        create_final_video_asset(cur, "ins_1", "/v1.mp4")
        conn.commit()
        cur.execute("DELETE FROM video_instances WHERE id='ins_1'")
        conn.commit()
        self.assertEqual(len(list_final_video_assets(cur, "ins_1")), 0)


if __name__ == "__main__":
    unittest.main()
