"""Accuracy check against photos with known depths (the Oct 29 go/no-go test).

1. Put photos in eval/photos/
2. List them in eval/photos/depths.csv:   file,true_depth_cm
3. Run:  backend/.venv/Scripts/python -u eval/accuracy.py

Reports, for each photo, the geometric depth (wheel circle fit) and Muse Spark's visual
midpoint, then the mean absolute error of each. The bar is a geometric error under 15 cm.
"""

import asyncio
import csv
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

from services import store  # noqa: E402
from services.pipeline import analyse  # noqa: E402

PHOTOS = ROOT / "photos"
BAR_CM = 15.0


async def run_one(path: Path) -> dict:
    out = {"geometry": None, "uncertainty": None, "visual": None, "status": None}
    async for ev in analyse(path.read_bytes(), 0.0, 0.0):
        d = ev["data"]
        if ev["stage"] == "fusion":
            out["geometry"], out["uncertainty"] = d["depth_cm"], d["uncertainty_cm"]
        elif ev["stage"] == "verify":
            lo, hi = d["verdict"].get("depth_cm_low"), d["verdict"].get("depth_cm_high")
            if lo is not None and hi is not None:
                out["visual"] = (lo + hi) / 2
        elif ev["stage"] == "result":
            out["status"] = d["status"]
    return out


def mae(pairs: list[tuple[float, float]]) -> str:
    return f"{statistics.mean(abs(a - b) for a, b in pairs):.1f} cm (n={len(pairs)})" if pairs else "n/a (no photos)"


async def main() -> None:
    csv_path = PHOTOS / "depths.csv"
    if not csv_path.exists():
        sys.exit(f"Create {csv_path} with columns: file,true_depth_cm")
    store.DB_PATH = ROOT / "accuracy.db"  # keep eval runs out of the real map
    store.DB_PATH.unlink(missing_ok=True)

    rows, geo, vis = [], [], []
    for r in csv.DictReader(csv_path.open(encoding="utf-8")):
        truth = float(r["true_depth_cm"])
        res = await run_one(PHOTOS / r["file"])
        rows.append({"file": r["file"], "true_cm": truth, **res})
        if res["geometry"] is not None:
            geo.append((res["geometry"], truth))
        if res["visual"] is not None:
            vis.append((res["visual"], truth))
        g = "-" if res["geometry"] is None else f"{res['geometry']:.0f}"
        v = "-" if res["visual"] is None else f"{res['visual']:.0f}"
        print(f"{r['file']:<24} true {truth:>4.0f}  geometry {g:>4}  visual {v:>4}  {res['status']}", flush=True)

    with (ROOT / "accuracy_report.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    print("\nGeometry (wheel circle fit):", mae(geo), f"of {len(rows)} photos measured")
    print("Visual (Muse Spark)        :", mae(vis))
    if geo:
        err = statistics.mean(abs(a - b) for a, b in geo)
        print(f"\nGO/NO-GO (bar {BAR_CM:.0f} cm): {'GO' if err < BAR_CM else 'NO-GO'}")


if __name__ == "__main__":
    asyncio.run(main())
