"""Background Poller Runtime — periodic APIMart task polling."""

import os, threading, time, logging

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL = 30  # seconds
JOB_TIMEOUT = 30 * 60  # 30 minutes


class PollerRuntime:
    """Background scheduler that periodically polls external provider tasks."""

    def __init__(self, db_path: str, interval: int = DEFAULT_INTERVAL):
        self.db_path = db_path
        self.interval = interval
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self):
        if self.is_running:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="poller-runtime")
        self._thread.start()
        logger.info("PollerRuntime started (interval=%ds, timeout=%ds)", self.interval, JOB_TIMEOUT)

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("PollerRuntime stopped")

    def _run(self):
        while not self._stop.is_set():
            try:
                self._poll_once()
                self._check_timeouts()
            except Exception as e:
                logger.error("PollerRuntime error: %s", e)
            self._stop.wait(self.interval)

    def _poll_once(self):
        import sqlite3
        from app.workers.provider_poller import poll_job

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT id FROM composition_jobs WHERE status = 'processing' AND provider_name != 'mock'"
            )
            for row in cur.fetchall():
                try:
                    poll_job(cur, row["id"])
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning("Poll failed for job %s: %s", row["id"], e)
        finally:
            conn.close()

    def _check_timeouts(self):
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        now = time.time()
        try:
            cur.execute(
                """UPDATE composition_jobs
                   SET status = 'failed', error_message = 'Provider timeout',
                       updated_at = ?
                   WHERE status = 'processing'
                     AND started_at IS NOT NULL
                     AND (? - started_at) > ?""",
                (now, now, JOB_TIMEOUT),
            )
            if cur.rowcount:
                logger.warning("Timed out %d processing jobs", cur.rowcount)
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("Timeout check failed: %s", e)
        finally:
            conn.close()


# Global singleton
_runtime: PollerRuntime | None = None


def get_runtime(db_path: str | None = None) -> PollerRuntime:
    global _runtime
    if _runtime is None:
        path = db_path or os.environ.get("TEST_DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "db.sqlite3"))
        _runtime = PollerRuntime(path)
    return _runtime
