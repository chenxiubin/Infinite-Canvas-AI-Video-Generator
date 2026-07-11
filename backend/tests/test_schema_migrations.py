"""Test the migration system and Sprint 11A-1 table creation."""

import unittest, sqlite3, time, tempfile, os

from app.db.migrations import run_migrations, ensure_schema_migrations_table


def _fresh_conn(path):
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


class TestMigrations(unittest.TestCase):
    """Verify migration system mechanics."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.path = self.tmp.name
        self.tmp.close()
        # Import here so migration registration happens once
        from app.db import sprint_11a  # noqa: F401

    def tearDown(self):
        try:
            os.unlink(self.path)
        except PermissionError:
            pass

    def test_01_empty_db_creates_schema_migrations(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        ensure_schema_migrations_table(cur)
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        self.assertIsNotNone(cur.fetchone())

    def test_02_first_run_applies_migrations(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        # Need foreign keys for table creation dependencies
        names = run_migrations(cur)
        conn.commit()
        self.assertIn("sprint_11a_composition_tables", names)

    def test_03_second_run_is_idempotent(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        names1 = run_migrations(cur)
        conn.commit()
        names2 = run_migrations(cur)
        self.assertEqual(len(names2), 0)

    def test_04_migration_record_written_once(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        run_migrations(cur)
        conn.commit()
        cur.execute("SELECT COUNT(*) as c FROM schema_migrations WHERE name='sprint_11a_composition_tables'")
        self.assertEqual(cur.fetchone()["c"], 1)

    def test_05_tables_exist_after_migration(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        run_migrations(cur)
        conn.commit()
        for tbl in ("composition_states", "composition_jobs", "final_video_assets"):
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tbl,))
            self.assertIsNotNone(cur.fetchone(), f"Table {tbl} not found")

    def test_06_foreign_keys_enforced(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        # Need video_instances parent table for FK to work
        cur.execute("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, product_type TEXT, sku TEXT, title TEXT, created_at REAL)")
        cur.execute("CREATE TABLE IF NOT EXISTS video_instances (id TEXT PRIMARY KEY, batch_id TEXT, product_id TEXT, template_id TEXT, product_type TEXT, sku TEXT, status TEXT, created_at REAL, updated_at REAL)")
        run_migrations(cur)
        conn.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            cur.execute("INSERT INTO composition_states (instance_id, created_at, updated_at) VALUES (?,?,?)",
                        ("nonexistent_ins", time.time(), time.time()))

    def test_07_indexes_exist(self):
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        run_migrations(cur)
        conn.commit()
        indexes = {"idx_final_video_version_number", "idx_final_video_version_label", "idx_final_video_one_current"}
        cur.execute("SELECT name FROM sqlite_master WHERE type='index'")
        found = {r["name"] for r in cur.fetchall()}
        for idx in indexes:
            self.assertIn(idx, found, f"Index {idx} not found")

    def test_08_cascade_delete_cleans_composition_state(self):
        # Need a real video_instance first
        conn = _fresh_conn(self.path)
        cur = conn.cursor()
        # Create minimal dependencies
        cur.execute("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, product_type TEXT, sku TEXT, title TEXT, created_at REAL)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS video_instances (
                id TEXT PRIMARY KEY, batch_id TEXT, product_id TEXT, template_id TEXT,
                product_type TEXT, sku TEXT, status TEXT, created_at REAL, updated_at REAL)
        """)
        run_migrations(cur)
        conn.commit()
        # Insert a real instance
        now = time.time()
        cur.execute("INSERT INTO products (id, product_type, sku, title, created_at) VALUES ('p1','desk_calendar','sku1','test',?)", (now,))
        cur.execute("INSERT INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES ('ins_t1','b1','p1','t1','desk_calendar','sku1','pending',?,?)", (now, now))
        conn.commit()
        # Create composition state
        cur.execute("INSERT INTO composition_states (instance_id, created_at, updated_at) VALUES ('ins_t1',?,?)", (now, now))
        conn.commit()
        cur.execute("SELECT COUNT(*) as c FROM composition_states WHERE instance_id='ins_t1'")
        self.assertEqual(cur.fetchone()["c"], 1)
        # Delete instance
        cur.execute("DELETE FROM video_instances WHERE id='ins_t1'")
        conn.commit()
        cur.execute("SELECT COUNT(*) as c FROM composition_states WHERE instance_id='ins_t1'")
        self.assertEqual(cur.fetchone()["c"], 0)
        conn.close()


if __name__ == "__main__":
    unittest.main()
