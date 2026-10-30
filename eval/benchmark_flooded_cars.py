"""Benchmark the pipeline on a public dataset of real flooded-car photos with ground-truth depth *levels*.

Dataset: "STURM-FloodDepth Flooded Cars" (Zenodo 10.5281/zenodo.14833532, CC BY 4.0), 3,367 real
street-level photos of submerged cars in five levels by water height against the car's own features.
Only the dataset's `test.txt` split is used, as its authors intended.

    # one-off: download and unzip into eval/datasets/flooded_cars/ (see eval/README.md)
    python -u eval/benchmark_flooded_cars.py --per-level 10        # 50 photos, about 300 API calls
    python -u eval/benchmark_flooded_cars.py --per-level 40        # a larger run
    python eval/benchmark_flooded_cars.py --self-test              # metrics only, no API

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
import contextlib
import csv
import random
import statistics
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

DATA = ROOT / "datasets" / "flooded_cars"
RESULTS = ROOT / "results"
LEVELS = 5
# Depth in cm at which each level begins: L0 below 10, L1 10-35, L2 35-70, L3 70-110, L4 above 110.
LEVEL_EDGES_CM = [10, 35, 70, 110]
CHENNAI = (13.0418, 80.2341)


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


def summarise(rows: list[dict]) -> str:
    """The report: per-level coverage and medians, rank correlation, level agreement."""
    out = [f"\n{len(rows)} photos benchmarked ({sum(1 for r in rows if r.get('error')) } errors)\n"]
    ok = [r for r in rows if not r.get("error")]
    out.append(f"{'level':<7}{'n':>4}  {'geometry':>10}  {'median cm':>10}  {'visual':>8}  {'median cm':>10}")
    for lv in range(LEVELS):
        g = [r for r in ok if r["level"] == lv]
        geo = [r["geometry_cm"] for r in g if r["geometry_cm"] is not None]
        vis = [r["visual_mid"] for r in g if r["visual_mid"] is not None]
        med = lambda v: f"{statistics.median(v):.0f}" if v else "-"  # noqa: E731
        out.append(f"L{lv:<6}{len(g):>4}  {len(geo):>4}/{len(g):<5}  {med(geo):>10}  {len(vis):>3}/{len(g):<4}  {med(vis):>10}")

    def block(name: str, pick) -> None:
        pairs = [(r["level"], pick(r)) for r in ok if pick(r) is not None]
        out.append(f"\n{name}  (n={len(pairs)} of {len(ok)})")
        if len(pairs) < 3:
            out.append("  too few predictions for statistics")
            return
        lv, dp = zip(*pairs, strict=True)
        rho = spearman(lv, dp)
        pred = [depth_to_level(d) for d in dp]
        exact = np.mean([a == b for a, b in zip(lv, pred, strict=True)])
        within1 = np.mean([abs(a - b) <= 1 for a, b in zip(lv, pred, strict=True)])
        medians = [statistics.median([d for lvl, d in pairs if lvl == k]) for k in range(LEVELS) if any(lvl == k for lvl, _ in pairs)]
        mono = all(a <= b for a, b in zip(medians, medians[1:], strict=False))
        out.append(f"  Spearman rank correlation with true level : {rho:.2f}" if rho is not None else "  Spearman: undefined")
        out.append(f"  same level as ground truth                : {exact:.0%}")
        out.append(f"  within one level                          : {within1:.0%}")
        out.append(f"  median depth rises with level             : {'yes' if mono else 'no'}")

    block("WHEEL GEOMETRY (only photos where a wheel could be measured)", lambda r: r["geometry_cm"])
    block("MUSE SPARK BY-EYE ESTIMATE", lambda r: r["visual_mid"])
    block("COMBINED (geometry where available, else by-eye)", lambda r: r["geometry_cm"] if r["geometry_cm"] is not None else r["visual_mid"])
    return "\n".join(out)


def self_test() -> None:
    assert [depth_to_level(d) for d in (0, 9.9, 10, 34, 35, 69, 70, 109, 110, 300)] == [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]
    assert list(rank([10, 20, 20, 30])) == [1.0, 2.5, 2.5, 4.0]
    assert abs(spearman([0, 1, 2, 3, 4], [5, 20, 40, 90, 150]) - 1.0) < 1e-9
    assert abs(spearman([0, 1, 2, 3, 4], [150, 90, 40, 20, 5]) + 1.0) < 1e-9
    assert spearman([1, 2], [1, 2]) is None and spearman([1, 2, 3], [5, 5, 5]) is None
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


async def run_one(level: int, path: Path, sem: asyncio.Semaphore) -> dict:
    from services.pipeline import analyse  # imported late so --self-test needs no API key

    row = {"file": path.name, "level": level, "geometry_cm": None, "geometry_unc": None, "usable_wheels": 0,
           "wheels": 0, "visual_lo": None, "visual_hi": None, "visual_mid": None, "is_flood": None, "water": None}
    async with sem:
        try:
            async for ev in analyse(path.read_bytes(), *CHENNAI, benchmark=True):
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
        except Exception as e:  # one failed photo must not lose the run
            row["error"] = f"{type(e).__name__}: {e}"[:120]
    return row


async def main(per_level: int, seed: int, concurrency: int) -> None:
    from services import store

    if not (DATA / "test.txt").exists() or not (DATA / "data").exists():
        sys.exit(f"Dataset not found in {DATA}. See eval/README.md for the download step.")
    store.DB_PATH = ROOT / "benchmark.db"  # scratch database: keeps runs out of the real map
    store.DB_PATH.unlink(missing_ok=True)

    items = sample(per_level, seed)
    print(f"{len(items)} photos ({per_level} per level, seed {seed}), {concurrency} at a time", flush=True)
    sem = asyncio.Semaphore(concurrency)
    tasks = [asyncio.create_task(run_one(lv, p, sem)) for lv, p in items]
    rows = []
    for i, t in enumerate(asyncio.as_completed(tasks), 1):
        r = await t
        rows.append(r)
        g = f"{r['geometry_cm']:.0f} cm" if r["geometry_cm"] is not None else "-"
        print(f"[{i:>3}/{len(items)}] L{r['level']} {r['file']:<26} geometry {g:>7}  by-eye {r['visual_mid']}  {r.get('error', '')}", flush=True)

    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"flooded_cars_{per_level}pl_seed{seed}.csv"
    rows.sort(key=lambda r: (r["level"], r["file"]))
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r}))
        w.writeheader()
        w.writerows(rows)
    print(summarise(rows))
    print(f"\nper-photo results: {out}")
    with contextlib.suppress(OSError):  # a scratch file; never worth losing a finished run over
        store.DB_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-level", type=int, default=10)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    self_test() if a.self_test else asyncio.run(main(a.per_level, a.seed, a.concurrency))
