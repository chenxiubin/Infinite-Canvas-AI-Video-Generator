"""
Job Runner — dispatches composition jobs synchronously.
"""

import sqlite3
from app.workers.composition_worker import run_composition_job


def run_job(db_path: str, job_id: str, simulate_failure: bool = False) -> dict:
    """Run a single composition job with its own connection.

    Returns final job state dict or None on error.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    try:
        result = run_composition_job(cur, job_id, simulate_failure=simulate_failure)
        conn.commit()
        return result
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
