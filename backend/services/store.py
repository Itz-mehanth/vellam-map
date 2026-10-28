"""SQLite storage for reports."""

import json
import os
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(os.getenv("DB_PATH") or Path(__file__).resolve().parents[1] / "vellam.db")

# Statuses that appear on the map and feed alerts and answers.
PUBLISHED = ("verified", "flood_unmeasured", "flood_visual_estimate", "flood_review")


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
    for column, ddl in [("place", "TEXT"), ("is_demo", "INTEGER NOT NULL DEFAULT 0")]:
        if column not in existing:
            conn.execute(f"ALTER TABLE reports ADD COLUMN {column} {ddl}")
    return conn


def add_report(lat, lng, phash, depth_cm, uncertainty_cm, status, verdict: dict,
               place: str | None = None, is_demo: bool = False, created_at: float | None = None) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO reports (created_at, lat, lng, phash, depth_cm, uncertainty_cm, status, verdict, place, is_demo)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (created_at or time.time(), lat, lng, phash, depth_cm, uncertainty_cm, status,
             json.dumps(verdict), place, int(is_demo)),
        )
        return cur.lastrowid


def all_reports() -> list[sqlite3.Row]:
    with _conn() as c:
        return c.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()


def published_reports(max_age_hours: float | None = None) -> list[sqlite3.Row]:
    cutoff = time.time() - max_age_hours * 3600 if max_age_hours else 0
    marks = ",".join("?" * len(PUBLISHED))
    with _conn() as c:
        return c.execute(
            f"SELECT * FROM reports WHERE status IN ({marks}) AND created_at >= ? ORDER BY created_at DESC",
            (*PUBLISHED, cutoff),
        ).fetchall()


def delete_report(report_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM reports WHERE id = ?", (report_id,)).rowcount > 0


def clear_demo() -> int:
    with _conn() as c:
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
