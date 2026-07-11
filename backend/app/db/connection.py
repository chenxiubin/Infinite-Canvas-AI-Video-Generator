"""Shared database connection helper."""
import os, sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.environ.get(
    "TEST_DATABASE_PATH",
    os.path.join(BASE_DIR, "db.sqlite3"),
)


def get_db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
