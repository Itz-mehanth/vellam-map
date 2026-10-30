"""Replay mode: a keyless way to try the app.

With REPLAY=1 the server never calls the Meta API. A photo that matches one of the bundled sample photos
streams that photo's recorded pipeline run (the real stage outputs, recorded by eval/record_replays.py); any
other photo is turned away with a clear message. Judges and reviewers can click through the whole pipeline
without a key, and nobody can spend anyone's credits.
"""

import asyncio
import io
import json
import os
from pathlib import Path

import imagehash
from PIL import Image

REPLAY_DIR = Path(__file__).resolve().parent.parent / "replays"
MAX_DISTANCE = 6  # perceptual-hash bits; survives the browser re-encoding a photo
SPEED = 0.2  # replay at a fifth of the recorded duration, capped per stage, so a run takes a few seconds


def enabled() -> bool:
    return os.getenv("REPLAY") == "1"


def _recordings() -> list[tuple[imagehash.ImageHash, list[dict]]]:
    out = []
    for path in sorted(REPLAY_DIR.glob("*.ndjson")):
        events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        intake = next((e for e in events if e["stage"] == "intake"), None)
        if intake and intake["data"].get("phash"):
            out.append((imagehash.hex_to_hash(intake["data"]["phash"]), events))
    return out


_cache: list | None = None


def find(image: bytes) -> list[dict] | None:
    """The recorded run for this photo, or None when it is not one of the samples."""
    global _cache
    if _cache is None:
        _cache = _recordings()
    h = imagehash.phash(Image.open(io.BytesIO(image)))
    best = min(((h - ph, ev) for ph, ev in _cache), key=lambda t: t[0], default=None)
    return best[1] if best and best[0] <= MAX_DISTANCE else None


async def play(events: list[dict]):
    for ev in events:
        await asyncio.sleep(min(ev.get("ms", 0) / 1000 * SPEED, 1.5))
        if ev["stage"] == "result":  # a replay saves nothing, so there is no report to link to
            ev = {**ev, "data": {**ev["data"], "id": None, "replay": True}}
        yield ev
