"""SQLite storage for reports."""

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "vellam.db"


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
    return conn


def add_report(lat, lng, phash, depth_cm, uncertainty_cm, status, verdict: dict) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO reports (created_at, lat, lng, phash, depth_cm, uncertainty_cm, status, verdict)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (time.time(), lat, lng, phash, depth_cm, uncertainty_cm, status, json.dumps(verdict)),
        )
        return cur.lastrowid


def all_reports() -> list[sqlite3.Row]:
    with _conn() as c:
        return c.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
