"""Test the verification gate (the Muse Spark flood check) on its own, cheaply and on held-out photos.

The gate decides whether a photo is a real flood. Positives are the benchmark photos at Levels 1 to 4 (see
benchmark_flooded_cars.py). Level 0 is NOT used as a negative: those photos are mostly wet roads and shallow
water, so "should be rejected" is not a fair label for them. Negatives are real non-flood photos from Wikimedia
Commons (wet roads, rain, car washes, pools, a wet garage floor, dry streets and car parks), kept in
eval/datasets/negatives/. We count two errors: real floods wrongly rejected, and non-floods wrongly accepted.

    python -u eval/gate_benchmark.py --prompt v1 --seed 7  --per-level 20   # the development photos
    python -u eval/gate_benchmark.py --prompt v2 --seed 7  --per-level 20
    python -u eval/gate_benchmark.py --prompt v2 --seed 21 --per-level 20 --holdout   # 100 NEW photos

Each run makes one Muse Spark call per photo (no SAM), so it is far cheaper than the full benchmark. Use
`--holdout` to skip photos in the development set, so a prompt tuned on one set is judged on another.

shipped is the production prompt (services/verify.py). v1 is the original yes/no prompt it replaced. v2 and v3
are the intermediate drafts: v2 grades the evidence instead of forcing a yes or no; v3 adds that water above a
vehicle's ground contact counts as clear (and became the production prompt, plus the depth fields).
"""

import argparse
import asyncio
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))

DATA = ROOT / "datasets" / "flooded_cars"
RESULTS = ROOT / "results"
DEV_INDEX = ROOT.parent / "frontend" / "public" / "benchmark" / "index.json"
NEGATIVES = ROOT / "datasets" / "negatives"  # real non-flood photos from Wikimedia Commons (see eval/README.md)
LEVELS = 5

def _shipped_prompt() -> str:
    from services import verify  # imported late so the file can be read without an API key

    return verify.PROMPT


PROMPTS = {
    "shipped": None,  # services.verify.PROMPT as it is now
    # The production prompt before the benchmark changed it (kept so the comparison stays reproducible).
    "v1": """You verify crowdsourced flood photos for a flood-warning map. Be strict.
"is_flood" is true ONLY if floodwater clearly covers a street or ground area well beyond a puddle: it should reach vehicle wheels, kerbs, doors or people's legs, or spread across the whole road.
It is false for puddles, splashes from a car driving through shallow water, rain, wet roads, rivers or lakes inside their banks, pools, fountains, and indoor scenes.
Also estimate the water depth in centimetres from objects of known size (wheel ~60 cm, kerb ~15 cm, adult knee ~50 cm, adult waist ~100 cm). Give a low and high bound, or null if you cannot tell.
Reply with ONLY a JSON object:
{"is_flood": bool, "is_puddle_or_splash": bool, "is_outdoor_street": bool, "looks_staged_or_stock": bool, "water_depth_hint": "ankle|knee|thigh|waist|deeper|unknown", "depth_cm_low": number|null, "depth_cm_high": number|null, "depth_reference": "<object used, or null>", "reason": "<one sentence>"}""",
    # Graded evidence: uncertainty is a middle answer, not a rejection.
    "v2": """You check crowdsourced photos for a flood-warning map. Judge only what is visible.
"flood_evidence" is one of:
- "clear": floodwater is visibly standing or flowing on a street or ground area, around vehicles, buildings or people, beyond a small puddle.
- "possible": water appears to be on the ground around the subject, but the photo cannot confirm how far it spreads, because it is blurry, dark, tightly cropped, or the water is shallow or partly hidden by splash. A vehicle driving or standing in water on a road belongs here at least.
- "none": no water on the ground around the subject; or only a small isolated puddle; rain on a dry road; a swimming pool, fountain or river inside its banks; or an indoor scene.
If you are unsure between "possible" and "none", answer "possible". Poor image quality alone is never a reason for "none".
Reply with ONLY a JSON object:
{"flood_evidence": "clear|possible|none", "looks_staged_or_stock": bool, "reason": "<one sentence>"}""",
    # v2 plus: water visibly above a vehicle's or person's ground contact is clear, even in a tight crop.
    "v3": """You check crowdsourced photos for a flood-warning map. Judge only what is visible.
"flood_evidence" is one of:
- "clear": floodwater is visibly standing or flowing on a street or ground area beyond a small puddle, OR a vehicle or person is visibly standing in water that rises above the bottom of its tyres or above the person's feet, even if the photo is tightly cropped or blurry.
- "possible": the ground around the subject looks wet or there may be shallow water, but you cannot see water rising above where the tyres or feet meet the ground, because of blur, darkness, tight cropping or splash.
- "none": no water on the ground around the subject; or only a small isolated puddle; rain on a dry road; a swimming pool, fountain or river inside its banks; or an indoor scene.
If you are unsure between "possible" and "none", answer "possible". Do not call a scene "none" merely because the image is poor, and do not call it "clear" without seeing water above ground contact.
Reply with ONLY a JSON object:
{"flood_evidence": "clear|possible|none", "looks_staged_or_stock": bool, "reason": "<one sentence>"}""",
}


def decision(prompt: str, v: dict) -> str:
    """What the gate would do with this verdict: reject, unconfirmed (shown but flagged) or accept."""
    if v.get("error"):
        return "error"
    if "flood_evidence" not in v:  # the original yes/no prompt
        return "reject" if (v.get("is_flood") is False or v.get("is_puddle_or_splash") or v.get("looks_staged_or_stock")) else "accept"
    if v.get("looks_staged_or_stock") or v.get("flood_evidence") == "none":
        return "reject"
    return "unconfirmed" if v.get("flood_evidence") == "possible" else "accept"


def negatives(holdout: bool) -> list[tuple[int, Path]]:
    """Non-flood photos, level -1. Alternate photos go to development and held-out halves."""
    manifest = json.loads((NEGATIVES / "manifest.json").read_text(encoding="utf-8"))
    return [(-1, NEGATIVES / "img" / o["file"]) for i, o in enumerate(manifest) if (i % 2 == 1) == holdout]


def sample(per_level: int, seed: int, exclude: set[str]) -> list[tuple[int, Path]]:
    lines = [ln.strip().replace("\\", "/") for ln in (DATA / "test.txt").read_text().splitlines() if ln.strip()]
    by_level: dict[int, list[Path]] = {k: [] for k in range(LEVELS)}
    for ln in lines:
        p = DATA / "data" / "upscaled_images" / ln
        if p.stem not in exclude:
            by_level[int(ln.split("/")[0].removeprefix("Level"))].append(p)
    rng = random.Random(seed)
    return [(lv, p) for lv, files in by_level.items() for p in rng.sample(files, min(per_level, len(files)))]


async def judge_one(prompt_id: str, level: int, path: Path, sem: asyncio.Semaphore) -> dict:
    from services.meta_client import ask_muse_spark

    async with sem:
        try:
            text = await ask_muse_spark(PROMPTS[prompt_id] or _shipped_prompt(), path.read_bytes())
            m = re.search(r"\{.*\}", text, re.S)
            verdict = json.loads(m.group(0)) if m else {"error": "unparseable"}
        except Exception as e:  # one failed photo must not lose the run
            verdict = {"error": f"{type(e).__name__}"}
    return {"id": path.stem, "level": level, "verdict": verdict}


def report(prompt_id: str, rows: list[dict]) -> str:
    out = []
    for r in rows:
        r["decision"] = decision(prompt_id, r["verdict"])
    ok = [r for r in rows if r["decision"] != "error"]
    neg = [r for r in ok if r["level"] == -1]
    out.append(f"\nprompt {prompt_id}: {len(ok)} judged, {len(rows) - len(ok)} errors\n")
    out.append(f"{'level':<12}{'n':>4}{'accept':>9}{'unconfirmed':>13}{'reject':>9}")
    for lv in range(-1, LEVELS):
        if lv == -1 and not neg:
            continue
        c = Counter(r["decision"] for r in ok if r["level"] == lv)
        n = sum(c.values())
        name = "not floods" if lv == -1 else f"L{lv}" + (" (wet)" if lv == 0 else "")
        out.append(f"{name:<12}{n:>4}{c['accept']:>9}{c['unconfirmed']:>13}{c['reject']:>9}")
    wet = [r for r in ok if r["level"] >= 1]
    pct = lambda a, b: f"{a}/{b} ({a / b:.0%})" if b else "n/a"  # noqa: E731
    out.append("\nThe two errors that matter:")
    out.append(f"  real floods (L1-L4) rejected         : {pct(sum(r['decision'] == 'reject' for r in wet), len(wet))}   <- lost reports")
    out.append(f"  real floods shown but unconfirmed    : {pct(sum(r['decision'] == 'unconfirmed' for r in wet), len(wet))}")
    if neg:
        out.append(f"  non-floods accepted                  : {pct(sum(r['decision'] == 'accept' for r in neg), len(neg))}   <- false alarms on the map")
        out.append(f"  non-floods shown as unconfirmed      : {pct(sum(r['decision'] == 'unconfirmed' for r in neg), len(neg))}")
        out.append(f"  non-floods rejected, correctly       : {pct(sum(r['decision'] == 'reject' for r in neg), len(neg))}")
    return "\n".join(out)


async def main(prompt_id: str, per_level: int, seed: int, holdout: bool, concurrency: int) -> None:
    exclude: set[str] = set()
    if holdout:
        exclude = {p["id"] for p in json.loads(DEV_INDEX.read_text(encoding="utf-8"))["photos"]}
    items = sample(per_level, seed, exclude) + negatives(holdout)
    print(f"{len(items)} photos, prompt {prompt_id}, seed {seed}, {'held-out' if holdout else 'development'} set", flush=True)
    sem = asyncio.Semaphore(concurrency)
    rows = await asyncio.gather(*(judge_one(prompt_id, lv, p, sem) for lv, p in items))
    RESULTS.mkdir(exist_ok=True)
    tag = f"gate_{prompt_id}_seed{seed}{'_holdout' if holdout else ''}.json"
    (RESULTS / tag).write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(report(prompt_id, list(rows)))
    print(f"\nper-photo verdicts: {RESULTS / tag}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prompt", choices=sorted(PROMPTS), required=True)
    ap.add_argument("--per-level", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--holdout", action="store_true", help="skip the development photos from the benchmark bundle")
    ap.add_argument("--concurrency", type=int, default=6)
    a = ap.parse_args()
    asyncio.run(main(a.prompt, a.per_level, a.seed, a.holdout, a.concurrency))
