"""Benchmark the pipeline on a public dataset of real flooded-car photos with ground-truth depth *levels*.

Dataset: "STURM-FloodDepth Flooded Cars" (Zenodo 10.5281/zenodo.14833532, CC BY 4.0), 3,367 real
street-level photos of submerged cars in five levels by water height against the car's own features.
Only the dataset's `test.txt` split is used, as its authors intended.

    # one-off: download and unzip into eval/datasets/flooded_cars/ (see eval/README.md)
    python -u eval/benchmark_flooded_cars.py --per-level 10        # 50 photos, about 450 API calls
    python -u eval/benchmark_flooded_cars.py --per-level 20        # 100 photos
    python eval/benchmark_flooded_cars.py --self-test              # metrics only, no API

Besides the CSV in eval/results/, a run writes a bundle the app's Benchmark tab reads, to
frontend/public/benchmark/ (change with --out): per-photo recorded pipeline stages, the intermediate images
(water mask, wheel masks) and the statistics. Faces and licence plates are blurred before any image is saved;
if that detection fails for a photo, no image is saved for it.

What this can and cannot show
- The labels are ordered levels, not centimetres, so this measures **ordering** (rank correlation) and
  **level agreement**, not centimetre error. For centimetre error you need measured depths (accuracy.py).
- Turning a depth into a level needs thresholds from car geometry. LEVEL_EDGES_CM below is our assumption
  (tyre about 60 cm, chassis about 35 cm, windows about 70 to 110 cm); change it and re-run to test sensitivity.
- The images are cropped around the car and upscaled, so the wheel-and-waterline geometry sees less of the
  scene than a phone photo would. Treat coverage figures as a lower bound.
"""

import argparse
import asyncio
import base64
import contextlib
import csv
import io
import json
import random
import shutil
import statistics
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

DATA = ROOT / "datasets" / "flooded_cars"
RESULTS = ROOT / "results"
DEFAULT_OUT = ROOT.parent / "frontend" / "public" / "benchmark"
LEVELS = 5
# Depth in cm at which each level begins: L0 below 10, L1 10-35, L2 35-70, L3 70-110, L4 above 110.
LEVEL_EDGES_CM = [10, 35, 70, 110]
CHENNAI = (13.0418, 80.2341)
METHODS = {
    "geometry": lambda r: r["geometry_cm"],
    "visual": lambda r: r["visual_mid"],
    "combined": lambda r: r["geometry_cm"] if r["geometry_cm"] is not None else r["visual_mid"],
}


# ----------------------------------------------------------------------------- metrics (no API)
def depth_to_level(depth_cm: float, edges=LEVEL_EDGES_CM) -> int:
    return sum(depth_cm >= e for e in edges)


def rank(values) -> np.ndarray:
    """Ranks starting at 1, ties given their average rank."""
    v = np.asarray(values, dtype=float)
    order = np.argsort(v, kind="stable")
    ranks = np.empty(len(v))
    ranks[order] = np.arange(1, len(v) + 1)
    for val in np.unique(v):
        mask = v == val
        if mask.sum() > 1:
            ranks[mask] = ranks[mask].mean()
    return ranks


def spearman(x, y) -> float | None:
    """Spearman rank correlation; None if it is undefined (fewer than 3 points or no spread)."""
    if len(x) < 3:
        return None
    rx, ry = rank(x), rank(y)
    if rx.std() == 0 or ry.std() == 0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])


def method_stats(ok: list[dict], pick) -> dict:
    """Statistics for one way of predicting depth, over the photos where it produced a number."""
    pairs = [(r["level"], pick(r)) for r in ok if pick(r) is not None]
    s = {"n": len(pairs), "of": len(ok), "spearman": None, "exact": None, "within1": None, "monotonic": None,
         "median_by_level": [None] * LEVELS, "confusion": [[0] * LEVELS for _ in range(LEVELS)]}
    for lv, d in pairs:
        s["confusion"][lv][depth_to_level(d)] += 1
    s["median_by_level"] = [
        statistics.median([d for lvl, d in pairs if lvl == k]) if any(lvl == k for lvl, _ in pairs) else None
        for k in range(LEVELS)
    ]
    if len(pairs) >= 3:
        lv, dp = zip(*pairs, strict=True)
        pred = [depth_to_level(d) for d in dp]
        s["spearman"] = spearman(lv, dp)
        s["exact"] = float(np.mean([a == b for a, b in zip(lv, pred, strict=True)]))
        s["within1"] = float(np.mean([abs(a - b) <= 1 for a, b in zip(lv, pred, strict=True)]))
        present = [m for m in s["median_by_level"] if m is not None]
        s["monotonic"] = all(a <= b for a, b in zip(present, present[1:], strict=False))
    return s


def compute_metrics(rows: list[dict]) -> dict:
    """Everything the report and the app's Benchmark tab show, as plain data."""
    ok = [r for r in rows if not r.get("error")]
    per_level = []
    for lv in range(LEVELS):
        g = [r for r in ok if r["level"] == lv]
        per_level.append({
            "level": lv, "n": len(g),
            "geometry_n": sum(r["geometry_cm"] is not None for r in g),
            "visual_n": sum(r["visual_mid"] is not None for r in g),
        })
    return {"n": len(ok), "errors": len(rows) - len(ok), "per_level": per_level,
            "methods": {name: method_stats(ok, pick) for name, pick in METHODS.items()}}


def summarise(rows: list[dict]) -> str:
    """The text report: per-level coverage and medians, rank correlation, level agreement."""
    m = compute_metrics(rows)
    out = [f"\n{len(rows)} photos benchmarked ({m['errors']} errors)\n"]
    out.append(f"{'level':<7}{'n':>4}  {'geometry':>10}  {'median cm':>10}  {'visual':>8}  {'median cm':>10}")
    fmt = lambda v: "-" if v is None else f"{v:.0f}"  # noqa: E731
    for pl in m["per_level"]:
        lv = pl["level"]
        out.append(f"L{lv:<6}{pl['n']:>4}  {pl['geometry_n']:>4}/{pl['n']:<5}  {fmt(m['methods']['geometry']['median_by_level'][lv]):>10}"
                   f"  {pl['visual_n']:>3}/{pl['n']:<4}  {fmt(m['methods']['visual']['median_by_level'][lv]):>10}")
    titles = {"geometry": "WHEEL GEOMETRY (only photos where a wheel could be measured)",
              "visual": "MUSE SPARK BY-EYE ESTIMATE",
              "combined": "COMBINED (geometry where available, else by-eye)"}
    for name, s in m["methods"].items():
        out.append(f"\n{titles[name]}  (n={s['n']} of {s['of']})")
        if s["spearman"] is None and s["exact"] is None:
            out.append("  too few predictions for statistics")
            continue
        out.append(f"  Spearman rank correlation with true level : {s['spearman']:.2f}" if s["spearman"] is not None else "  Spearman: undefined")
        out.append(f"  same level as ground truth                : {s['exact']:.0%}")
        out.append(f"  within one level                          : {s['within1']:.0%}")
        out.append(f"  median depth rises with level             : {'yes' if s['monotonic'] else 'no'}")
    return "\n".join(out)


def self_test() -> None:
    assert [depth_to_level(d) for d in (0, 9.9, 10, 34, 35, 69, 70, 109, 110, 300)] == [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]
    assert list(rank([10, 20, 20, 30])) == [1.0, 2.5, 2.5, 4.0]
    assert abs(spearman([0, 1, 2, 3, 4], [5, 20, 40, 90, 150]) - 1.0) < 1e-9
    assert abs(spearman([0, 1, 2, 3, 4], [150, 90, 40, 20, 5]) + 1.0) < 1e-9
    assert spearman([1, 2], [1, 2]) is None and spearman([1, 2, 3], [5, 5, 5]) is None
    perfect = [{"level": lv, "geometry_cm": None, "visual_mid": [5, 20, 50, 90, 130][lv]} for lv in range(LEVELS) for _ in range(3)]
    s = compute_metrics(perfect)["methods"]["visual"]
    assert s["exact"] == 1.0 and s["monotonic"] is True and [s["confusion"][i][i] for i in range(LEVELS)] == [3] * LEVELS
    assert compute_metrics(perfect)["methods"]["geometry"]["n"] == 0
    rng = random.Random(1)
    fake = [{"level": lv, "geometry_cm": None if rng.random() < 0.6 else [5, 20, 50, 90, 130][lv] + rng.uniform(-8, 8),
             "visual_mid": [5, 20, 50, 90, 130][lv] + rng.uniform(-15, 15)} for lv in range(LEVELS) for _ in range(30)]
    report = summarise(fake)
    assert "Spearman rank correlation" in report and "COMBINED" in report
    bar = "=" * 70
    print(f"{bar}\nSELF-TEST ONLY. The table below is made-up data that exercises the\n"
          f"metrics. It is NOT a result about Vellam Map.\n{bar}")
    print(report)
    print(f"\n{bar}\nself-test passed (metrics code works; no photos were analysed)\n{bar}")


# ----------------------------------------------------------------------------- the benchmark run
def sample(per_level: int, seed: int) -> list[tuple[int, Path]]:
    lines = [ln.strip().replace("\\", "/") for ln in (DATA / "test.txt").read_text().splitlines() if ln.strip()]
    by_level: dict[int, list[Path]] = {k: [] for k in range(LEVELS)}
    for ln in lines:
        level = int(ln.split("/")[0].removeprefix("Level"))
        by_level[level].append(DATA / "data" / "upscaled_images" / ln)
    rng = random.Random(seed)
    return [(lv, p) for lv, files in by_level.items() for p in rng.sample(files, min(per_level, len(files)))]


def save_jpeg(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=84)


async def run_one(level: int, path: Path, sem: asyncio.Semaphore, out: Path) -> dict:
    # imported late so --self-test needs no API key
    from services.pipeline import analyse, private_regions, redact

    pid = path.stem
    row = {"id": pid, "file": path.name, "level": level, "geometry_cm": None, "geometry_unc": None, "usable_wheels": 0,
           "wheels": 0, "visual_lo": None, "visual_hi": None, "visual_mid": None, "is_flood": None, "water": None,
           "status": None, "images": False}
    image = path.read_bytes()
    pil = Image.open(io.BytesIO(image))
    width, height = pil.size
    async with sem:
        try:
            privacy = asyncio.create_task(private_regions(image, (height, width)))  # faces and plates
            events = []
            async for ev in analyse(image, *CHENNAI, benchmark=True):
                events.append(ev)
                d = ev["data"]
                if ev["stage"] == "water":
                    row["water"] = d["found"]
                elif ev["stage"] == "geometry":
                    row["wheels"] = len(d["wheels"])
                    row["usable_wheels"] = sum(w["depth_cm"] is not None for w in d["wheels"])
                elif ev["stage"] == "fusion":
                    row["geometry_cm"], row["geometry_unc"] = d["depth_cm"], d["uncertainty_cm"]
                elif ev["stage"] == "verify":
                    v = d["verdict"]
                    row["is_flood"] = v.get("is_flood")
                    if v.get("depth_cm_low") is not None and v.get("depth_cm_high") is not None:
                        row["visual_lo"], row["visual_hi"] = v["depth_cm_low"], v["depth_cm_high"]
                        row["visual_mid"] = (v["depth_cm_low"] + v["depth_cm_high"]) / 2
                elif ev["stage"] == "result":
                    row["status"] = d["status"]
                    d["id"] = 0  # a recorded run has no report number
            try:
                hide = await privacy
            except Exception:
                hide = None  # fail closed: without face and plate detection no image is saved
            if hide is not None:
                save_jpeg(redact(pil.convert("RGB"), hide), out / "img" / f"{pid}.jpg")
                for ev in events:
                    if ev["stage"] in ("water", "objects"):
                        raw = Image.open(io.BytesIO(base64.b64decode(ev["data"]["overlay"].split(",", 1)[1])))
                        save_jpeg(redact(raw.convert("RGB"), hide), out / "img" / f"{pid}-{ev['stage']}.jpg")
                        ev["data"]["overlay"] = f"/benchmark/img/{pid}-{ev['stage']}.jpg"
                    elif ev["stage"] == "intake":
                        ev["data"].update(lat=None, lng=None)  # the fake coordinates mean nothing for these photos
                (out / "photos").mkdir(parents=True, exist_ok=True)
                (out / "photos" / f"{pid}.json").write_text(
                    json.dumps({"width": width, "height": height, "events": events}), encoding="utf-8")
                row["images"] = True
        except Exception as e:  # one failed photo must not lose the run
            row["error"] = f"{type(e).__name__}: {e}"[:120]
    row["width"], row["height"] = width, height
    return row


async def main(per_level: int, seed: int, concurrency: int, out: Path) -> None:
    from services import store

    if not (DATA / "test.txt").exists() or not (DATA / "data").exists():
        sys.exit(f"Dataset not found in {DATA}. See eval/README.md for the download step.")
    store.DB_PATH = ROOT / "benchmark.db"  # scratch database: keeps runs out of the real map
    store.DB_PATH.unlink(missing_ok=True)
    staging = out.with_name(out.name + ".building")  # swapped in only when the whole run has finished
    shutil.rmtree(staging, ignore_errors=True)

    items = sample(per_level, seed)
    print(f"{len(items)} photos ({per_level} per level, seed {seed}), {concurrency} at a time", flush=True)
    sem = asyncio.Semaphore(concurrency)
    tasks = [asyncio.create_task(run_one(lv, p, sem, staging)) for lv, p in items]
    rows = []
    for i, t in enumerate(asyncio.as_completed(tasks), 1):
        r = await t
        rows.append(r)
        g = f"{r['geometry_cm']:.0f} cm" if r["geometry_cm"] is not None else "-"
        print(f"[{i:>3}/{len(items)}] L{r['level']} {r['file']:<26} geometry {g:>7}  by-eye {r['visual_mid']}  {r.get('error', '')}", flush=True)

    rows.sort(key=lambda r: (r["level"], r["file"]))
    RESULTS.mkdir(exist_ok=True)
    csv_path = RESULTS / f"flooded_cars_{per_level}pl_seed{seed}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r}))
        w.writeheader()
        w.writerows(rows)

    staging.mkdir(parents=True, exist_ok=True)
    bundle = {
        "meta": {
            "dataset": "STURM-FloodDepth Flooded Cars (test split)",
            "dataset_url": "https://zenodo.org/records/14833532",
            "dataset_license": "CC BY 4.0",
            "dataset_author": "Nicla Notarangelo (images derived from a public flooded-vehicle dataset)",
            "per_level": per_level, "seed": seed, "n": len(rows),
            "level_edges_cm": LEVEL_EDGES_CM,
            "generated_at": time.strftime("%Y-%m-%d"),
        },
        "metrics": compute_metrics(rows),
        "photos": rows,
    }
    (staging / "index.json").write_text(json.dumps(bundle), encoding="utf-8")
    shutil.rmtree(out, ignore_errors=True)  # the previous bundle goes only now that the new one is complete
    shutil.move(str(staging), str(out))
    print(summarise(rows))
    print(f"\nper-photo results: {csv_path}\napp bundle       : {out}")
    with contextlib.suppress(OSError):  # a scratch file; never worth losing a finished run over
        store.DB_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-level", type=int, default=10)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="where the app's benchmark bundle is written")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    self_test() if a.self_test else asyncio.run(main(a.per_level, a.seed, a.concurrency, a.out))
