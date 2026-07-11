"""
Minimal migration system for Sprint 11A-1.

Each migration has a unique integer version, a name, and a function
that runs inside a transaction.  Once applied, the version is recorded
in `schema_migrations` and never applied again.
"""

import time
import sqlite3
from typing import Callable

MIGRATIONS: list[tuple[int, str, Callable[[sqlite3.Cursor], None]]] = []


def register(version: int, name: str):
    """Decorator to register a migration function."""
    def wrapper(fn: Callable[[sqlite3.Cursor], None]):
        MIGRATIONS.append((version, name, fn))
        MIGRATIONS.sort(key=lambda m: m[0])
        return fn
    return wrapper


def ensure_schema_migrations_table(cursor: sqlite3.Cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name    TEXT NOT NULL,
            applied_at REAL NOT NULL
        )
    """)


def run_migrations(cursor: sqlite3.Cursor) -> list[str]:
    """Run all registered migrations that haven't been applied yet.

    Each migration runs in its own transaction.  Returns names of newly
    applied migrations.
    """
    ensure_schema_migrations_table(cursor)
    applied: set[int] = set()
    for row in cursor.execute("SELECT version FROM schema_migrations"):
        applied.add(row[0])

    new: list[str] = []
    for version, name, fn in MIGRATIONS:
        if version in applied:
            continue
        # Run this single migration inside a savepoint so a failure
        # doesn't leave partial state.
        cursor.execute("SAVEPOINT migration")
        try:
            fn(cursor)
            cursor.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (version, name, time.time()),
            )
            cursor.execute("RELEASE migration")
            new.append(name)
        except Exception:
            cursor.execute("ROLLBACK TO migration")
            raise
    return new
