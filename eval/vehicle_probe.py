"""Can the car body act as a ruler where the wheels are hidden?  A time-boxed experiment, not a shipped feature.

    python -u eval/vehicle_probe.py            # needs META_API_KEY and eval/datasets/flooded_cars

For each photo in the 100-photo benchmark bundle, SAM 3.1 outlines the largest car. The feature is how much of the car
is still visible above the water, relative to its width:  visible_height / width.  A deeper flood hides more of the car,
so the ratio should fall as the true level rises. We check that against the dataset's ordered levels (Spearman) and,
more to the point, whether it still separates the deep levels (3 and 4), where wheel geometry reads nothing.

The dataset only has ordered levels, not centimetres, so this can show a rank signal and nothing more. It cannot
produce a centimetre claim. Results go to eval/results/vehicle_probe.json.
"""

import asyncio
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

from services.meta_client import segment  # noqa: E402

DATA = ROOT / "datasets" / "flooded_cars" / "data" / "upscaled_images"
INDEX = ROOT.parent / "frontend" / "public" / "benchmark" / "index.json"
OUT = ROOT / "results" / "vehicle_probe.json"


def find(photo_id: str) -> Path | None:
    hits = list(DATA.rglob(f"{photo_id}.*"))
    return hits[0] if hits else None


async def one(p: dict, sem: asyncio.Semaphore) -> dict:
    path = find(p["id"])
    row = {"id": p["id"], "level": p["level"], "ok": False}
    if path is None:
        return row
    async with sem:
        try:
            cars = await segment(path.read_bytes(), "car")
        except Exception as e:
            row["error"] = type(e).__name__
            return row
    if not cars:
        return row
    biggest = max(cars, key=lambda o: o.mask.sum())
    left, top, right, bottom = biggest.box
    w, h = right - left, bottom - top
    row.update(ok=True, width_px=float(w), visible_h_px=float(h), ratio=float(h / w), cars=len(cars))
    return row


def spearman(x, y) -> float:
    rx = np.argsort(np.argsort(x)).astype(float)
    ry = np.argsort(np.argsort(y)).astype(float)
    return float(np.corrcoef(rx, ry)[0, 1])


def auc(pos, neg) -> float:
    """Chance that a random 'deeper' photo has a smaller ratio than a random 'shallower' one."""
    wins = sum((a < b) + 0.5 * (a == b) for a in pos for b in neg)
    return wins / (len(pos) * len(neg))


async def main() -> None:
    photos = json.loads(INDEX.read_text(encoding="utf-8"))["photos"]
    sem = asyncio.Semaphore(6)
    rows = []
    for i, fut in enumerate(asyncio.as_completed([one(p, sem) for p in photos]), 1):
        rows.append(await fut)
        if i % 10 == 0:
            print(f"  {i}/{len(photos)} done", flush=True)
    OUT.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    ok = [r for r in rows if r["ok"]]
    print(f"{len(ok)} of {len(rows)} photos gave a car outline")
    lv = [r["level"] for r in ok]
    ra = [r["ratio"] for r in ok]
    print(f"Spearman(ratio, true level) = {spearman(ra, lv):+.2f}   (negative is the expected direction)")
    for a, b in [(0, 1), (1, 2), (2, 3), (3, 4)]:
        hi = [r["ratio"] for r in ok if r["level"] == b]
        lo = [r["ratio"] for r in ok if r["level"] == a]
        if hi and lo:
            print(f"  level {b} vs {a}: ratio smaller in {auc(hi, lo):.0%} of pairs  (n={len(hi)} vs {len(lo)}, 50% is chance)")
    for k in range(5):
        v = [r["ratio"] for r in ok if r["level"] == k]
        if v:
            print(f"  level {k}: median ratio {np.median(v):.2f}  (n={len(v)})")


if __name__ == "__main__":
    asyncio.run(main())
