"""SQLite storage for reports."""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("DB_PATH") or Path(__file__).resolve().parents[1] / "vellam.db")

# Statuses that appear on the map and feed alerts and answers.
PUBLISHED = ("verified", "flood_unmeasured", "flood_visual_estimate", "flood_review", "flood_unconfirmed")


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at REAL NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            phash TEXT NOT NULL,
            depth_cm REAL,
            uncertainty_cm REAL,
            status TEXT NOT NULL,
            verdict TEXT NOT NULL
        )"""
    )
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(reports)")}
    for column, ddl in [("place", "TEXT"), ("is_demo", "INTEGER NOT NULL DEFAULT 0"), ("evidence", "TEXT")]:
        if column not in existing:
            conn.execute(f"ALTER TABLE reports ADD COLUMN {column} {ddl}")
    return conn


@contextmanager
def _db():
    """A connection that commits on success and, unlike `with sqlite3.connect()`, is always closed."""
    conn = _conn()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def add_report(lat, lng, phash, depth_cm, uncertainty_cm, status, verdict: dict,
               place: str | None = None, is_demo: bool = False, created_at: float | None = None,
               evidence: dict | None = None) -> int:
    with _db() as c:
        cur = c.execute(
            "INSERT INTO reports (created_at, lat, lng, phash, depth_cm, uncertainty_cm, status, verdict, place, is_demo, evidence)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (created_at or time.time(), lat, lng, phash, depth_cm, uncertainty_cm, status,
             json.dumps(verdict), place, int(is_demo), json.dumps(evidence) if evidence else None),
        )
        return cur.lastrowid


def media_dir() -> Path:
    """Evidence images live beside the database, so one persistent disk holds both."""
    d = DB_PATH.parent / "media"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_media(report_id: int, kind: str, data: bytes) -> None:
    (media_dir() / f"{report_id}-{kind}.jpg").write_bytes(data)


def media_path(report_id: int, kind: str) -> Path | None:
    p = media_dir() / f"{report_id}-{kind}.jpg"
    return p if p.exists() else None


def get_report(report_id: int):
    with _db() as c:
        return c.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()


def all_reports() -> list[sqlite3.Row]:
    with _db() as c:
        return c.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()


def published_reports(max_age_hours: float | None = None) -> list[sqlite3.Row]:
    cutoff = time.time() - max_age_hours * 3600 if max_age_hours else 0
    marks = ",".join("?" * len(PUBLISHED))
    with _db() as c:
        return c.execute(
            f"SELECT * FROM reports WHERE status IN ({marks}) AND created_at >= ? ORDER BY created_at DESC",
            (*PUBLISHED, cutoff),
        ).fetchall()


def delete_report(report_id: int) -> bool:
    for kind in ("photo", "overlay"):
        p = media_path(report_id, kind)
        if p:
            p.unlink(missing_ok=True)
    with _db() as c:
        return c.execute("DELETE FROM reports WHERE id = ?", (report_id,)).rowcount > 0


def clear_demo() -> int:
    with _db() as c:
        return c.execute("DELETE FROM reports WHERE is_demo = 1").rowcount


def effective_depth(row) -> tuple[float | None, str]:
    """(depth in cm, source) where source is 'measured', 'visual' or 'none'."""
    if row["depth_cm"] is not None:
        return row["depth_cm"], "measured"
    v = json.loads(row["verdict"])
    lo, hi = v.get("depth_cm_low"), v.get("depth_cm_high")
    if lo is not None and hi is not None:
        return (lo + hi) / 2, "visual"
    return None, "none"
