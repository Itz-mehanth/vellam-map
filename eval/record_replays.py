"""Run the real pipeline on every sample photo, record each stage's output, and summarise coverage.

    python -u eval/record_replays.py [photo ...]      # default: all frontend/public/samples/s*.jpg

For each photo this writes `eval/replays/<name>.ndjson` (one JSON stage event per line, exactly what
the live endpoint streams) and prints one summary line. A final table says how many photos yielded a
geometric depth, a visual-only estimate, a review, or a rejection. Needs a valid META_API_KEY.

The recordings can drive a keyless "replay" demo, and the table is the honest answer to
"on what share of photos does the wheel geometry work?".
"""

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

from services import store  # noqa: E402
from services.pipeline import analyse  # noqa: E402

CHENNAI = (13.0418, 80.2341)
OUT = ROOT / "replays"


async def record(photo: Path) -> dict:
    # A fresh database per photo: several samples are near-duplicates and would reject each other.
    store.DB_PATH.unlink(missing_ok=True)
    events, summary = [], {"photo": photo.name, "status": None, "geometry_cm": None, "visual": None, "wheels": 0, "usable_wheels": 0}
    async for ev in analyse(photo.read_bytes(), *CHENNAI):
        events.append(ev)
        d = ev["data"]
        if ev["stage"] == "geometry":
            summary["wheels"] = len(d["wheels"])
            summary["usable_wheels"] = sum(w["depth_cm"] is not None for w in d["wheels"])
        elif ev["stage"] == "fusion":
            summary["geometry_cm"] = d["depth_cm"]
        elif ev["stage"] == "verify":
            lo, hi = d["verdict"].get("depth_cm_low"), d["verdict"].get("depth_cm_high")
            summary["visual"] = [lo, hi] if lo is not None and hi is not None else None
            summary["cross_check"] = d["cross_check"]
        elif ev["stage"] == "result":
            summary["status"] = d["status"]
            summary["total_ms"] = d["total_ms"]
    OUT.mkdir(exist_ok=True)
    (OUT / f"{photo.stem}.ndjson").write_text("\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8")
    return summary


async def main(photos: list[Path]) -> None:
    store.DB_PATH = ROOT / "replay.db"  # keep these runs out of the real map
    results = []
    for p in photos:
        try:
            s = await record(p)
        except Exception as e:  # one bad photo must not lose the rest
            s = {"photo": p.name, "status": f"error: {type(e).__name__}"}
        results.append(s)
        geo = f"{s['geometry_cm']:.0f} cm" if s.get("geometry_cm") is not None else "-"
        print(f"{s['photo']:<8} {s['status']:<24} geometry {geo:>7}  visual {s.get('visual')}  "
              f"wheels {s.get('usable_wheels', 0)}/{s.get('wheels', 0)}", flush=True)
    store.DB_PATH.unlink(missing_ok=True)

    (OUT / "summary.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    c = Counter(r["status"] for r in results)
    measured = sum(r.get("geometry_cm") is not None for r in results)
    print(f"\n{len(results)} photos | geometric depth on {measured} | by status: {dict(c)}")


if __name__ == "__main__":
    args = [Path(a) for a in sys.argv[1:]] or sorted((ROOT.parent / "frontend" / "public" / "samples").glob("s*.jpg"))
    asyncio.run(main(args))
