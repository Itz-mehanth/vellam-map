"""Photo -> fused depth estimate, as a stream of stage events.

Each stage yields {"stage", "title", "ms", "data"} when it finishes, so the UI
can show the real pipeline filling in rather than a fake progress bar.
"""

import asyncio
import base64
import io
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from . import exif, geo, store, verify
from .depth import DepthEstimate, depth_from_wheel, fit_circle, fuse
from .meta_client import SegmentedObject, segment

REFERENCE = json.loads(
    (Path(__file__).resolve().parents[2] / "data" / "reference_objects.json").read_text()
)["objects"]
WHEELS = {k: v for k, v in REFERENCE.items() if v["shape"] == "circle"}

WATER_RGB, WHEEL_RGB = (37, 99, 235), (249, 115, 22)
MAX_RIM_POINTS_SENT = 80
WATER_PROMPTS = ["water", "flood water", "flooded road"]


def full_mask(obj: SegmentedObject, shape: tuple[int, int]) -> np.ndarray:
    """Place a box-local mask into a full-image boolean array of (height, width)."""
    out = np.zeros(shape, dtype=bool)
    left, top = int(round(obj.box[0])), int(round(obj.box[1]))
    h, w = obj.mask.shape
    h, w = min(h, shape[0] - top), min(w, shape[1] - left)
    out[top : top + h, left : left + w] = obj.mask[:h, :w]
    return out


def rim_points(wheel: np.ndarray, water: np.ndarray) -> np.ndarray:
    """Boundary pixels of the wheel mask that are not touching water (the true visible rim)."""
    padded = np.pad(wheel, 1)
    interior = padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:]
    edge = wheel & ~interior
    near_water = water.copy()
    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0), (0, -2), (0, 2)]:
        near_water |= np.roll(np.roll(water, dy, axis=0), dx, axis=1)
    ys, xs = np.nonzero(edge & ~near_water)
    return np.column_stack([xs, ys]).astype(float)


def waterline_y(wheel: np.ndarray, water: np.ndarray) -> float | None:
    """Median top of the water surface across the wheel's columns."""
    cols = np.nonzero(wheel.any(axis=0))[0]
    tops = [np.argmax(water[:, c]) for c in cols if water[:, c].any()]
    return float(np.median(tops)) if tops else None


PRIVATE_PROMPTS = ["face", "license plate"]


def redact(img: Image.Image, mask: np.ndarray | None) -> Image.Image:
    """Heavily blur the masked regions (faces, number plates) so they are unrecognisable."""
    if mask is None or not mask.any():
        return img
    soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(3))
    blurred = img.filter(ImageFilter.GaussianBlur(max(14, min(img.size) // 22)))
    return Image.composite(blurred, img, soft)


async def private_regions(image: bytes, shape: tuple[int, int]) -> np.ndarray:
    """Union of every face and licence plate SAM 3.1 finds. Raises if detection fails."""
    found = await asyncio.gather(*(segment(image, q) for q in PRIVATE_PROMPTS))
    mask = np.zeros(shape, dtype=bool)
    for objs in found:
        for o in objs:
            mask |= full_mask(o, shape)
    return mask


def overlay_jpeg(image: bytes, layers: list[tuple[np.ndarray, tuple[int, int, int]]], hide: np.ndarray | None = None) -> bytes:
    """Photo with each (mask, colour) layer tinted on, and private regions blurred."""
    canvas = np.asarray(redact(Image.open(io.BytesIO(image)).convert("RGB"), hide)).astype(float)
    for mask, colour in layers:
        canvas[mask] = canvas[mask] * 0.5 + np.array(colour) * 0.5
    buf = io.BytesIO()
    Image.fromarray(canvas.astype(np.uint8)).save(buf, "JPEG", quality=80)
    return buf.getvalue()


def overlay_data_url(image: bytes, layers: list[tuple[np.ndarray, tuple[int, int, int]]]) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(overlay_jpeg(image, layers)).decode()


def evidence_photo(image: bytes, hide: np.ndarray | None = None, max_side: int = 1280) -> bytes:
    """The submitted photo with faces and plates blurred, shrunk for storage. Evidence coordinates refer to the original size."""
    img = redact(Image.open(io.BytesIO(image)).convert("RGB"), hide)
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return buf.getvalue()


def analyse_wheel(wheel: np.ndarray, water: np.ndarray, name: str, ref: dict) -> dict:
    """Geometry for one wheel: circle fit, waterline, depth. Always returns a record."""
    rec: dict = {"type": name, "depth_cm": None, "uncertainty_cm": None, "reason": "ok"}
    ys, xs = np.nonzero(wheel)
    if len(ys) == 0:
        return rec | {"reason": "empty mask"}
    rec["visible_px"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    wl = waterline_y(wheel, water)
    if wl is None:
        return rec | {"reason": "no water under wheel"}
    pts = rim_points(wheel, water)
    rec["waterline_y"] = wl
    rec["rim_points"] = len(pts)
    if len(pts) < 10:
        return rec | {"reason": "too little visible rim to fit a circle"}
    step = max(1, len(pts) // MAX_RIM_POINTS_SENT)
    rec["rim_sample"] = pts[::step].astype(int).tolist()
    cx, cy, r = fit_circle(pts)
    rec["circle"] = {"cx": float(cx), "cy": float(cy), "r": float(r)}
    est = depth_from_wheel(pts, wl, ref["diameter_cm"], tuple(ref["range_cm"]))
    if est is None:
        return rec | {"reason": "wheel not in water"}
    h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    if wl - ys.max() > 0.35 * r:
        return rec | {"reason": "water does not touch wheel"}
    if not (0.45 * h <= r <= 1.6 * max(h, w)):
        return rec | {"reason": "implausible circle fit"}
    rec["cm_per_px"] = ref["diameter_cm"] / (2 * r)
    rec["depth_cm"], rec["uncertainty_cm"] = est.depth_cm, est.uncertainty_cm
    return rec


def cross_check(depth_cm: float | None, verdict: dict) -> str:
    """Does the geometric depth roughly agree with Muse Spark's visual range?

    Spray, reflections and mislabelled water can fool the waterline, so a
    measurement far outside the visual range is sent for review, not published.
    """
    lo, hi = verdict.get("depth_cm_low"), verdict.get("depth_cm_high")
    if depth_cm is None or lo is None or hi is None:
        return "unavailable"
    return "agree" if lo * 0.5 - 5 <= depth_cm <= hi * 1.6 + 10 else "disagree"


def decide(duplicate_of, verdict: dict, depth_cm, meta: dict | None = None) -> str:
    meta = meta or {}
    if duplicate_of is not None:
        return "rejected_duplicate"
    if meta.get("stale"):
        return "rejected_stale"
    if verdict.get("is_flood") is False or verdict.get("is_puddle_or_splash") or verdict.get("looks_staged_or_stock"):
        return "rejected_not_flood"
    if meta.get("mismatch"):
        return "flood_review"
    if depth_cm is not None:
        return "flood_review" if cross_check(depth_cm, verdict) == "disagree" else "verified"
    has_visual = verdict.get("depth_cm_low") is not None and verdict.get("depth_cm_high") is not None
    return "flood_visual_estimate" if has_visual else "flood_unmeasured"


async def analyse(image: bytes, lat: float, lng: float):
    """Async generator of stage events; the last one has stage == "result"."""
    t0 = time.perf_counter()
    mark = t0

    def event(stage: str, title: str, data: dict) -> dict:
        nonlocal mark
        now = time.perf_counter()
        ev = {"stage": stage, "title": title, "ms": round((now - mark) * 1000), "data": data}
        mark = now
        return ev

    # Stage 1 — intake
    pil = Image.open(io.BytesIO(image))
    w, h = pil.size
    shape = (h, w)
    phash = verify.photo_hash(image)
    duplicate_of = verify.find_duplicate(phash)
    meta = exif.inspect(image, lat, lng)
    judge_task = asyncio.create_task(verify.judge(image))  # runs alongside segmentation
    privacy_task = asyncio.create_task(private_regions(image, shape))  # faces and plates, blurred before any image is kept
    yield event("intake", "Photo received", {
        "width": w, "height": h, "kb": round(len(image) / 1024), "phash": str(phash),
        "duplicate_of": duplicate_of, "lat": lat, "lng": lng, "exif": meta,
    })

    # Stage 2 — water
    water = np.zeros(shape, dtype=bool)
    water_objs, water_prompt = [], "water"
    for water_prompt in WATER_PROMPTS:  # fall back to other phrasings if SAM finds nothing
        water_objs = await segment(image, water_prompt)
        if water_objs:
            break
    confs = [o.confidence for o in water_objs if o.confidence is not None]
    for o in water_objs:
        water |= full_mask(o, shape)
    yield event("water", "SAM 3.1 finds the water surface", {
        "found": bool(water.any()), "instances": len(water_objs), "prompt": water_prompt,
        "coverage_pct": round(100 * float(water.mean()), 1),
        "confidence": max(confs) if confs else None,
        "overlay": overlay_data_url(image, [(water, WATER_RGB)]),
    })

    # Stage 3 — reference objects (all wheel prompts at once)
    found: list[tuple[str, dict, SegmentedObject]] = []
    prompt_counts: dict[str, int] = {}
    if water.any():
        sem = asyncio.Semaphore(3)

        async def run(name: str, ref: dict):
            async with sem:
                return name, ref, await segment(image, ref["prompt"])

        for name, ref, objs in await asyncio.gather(*(run(n, r) for n, r in WHEELS.items())):
            prompt_counts[name] = len(objs)
            found += [(name, ref, o) for o in objs]
    wheel_masks = [full_mask(o, shape) for _, _, o in found]
    yield event("objects", "SAM 3.1 looks for reference objects", {
        "prompts": [{"type": n, "prompt": WHEELS[n]["prompt"], "count": c} for n, c in prompt_counts.items()],
        "objects": [
            {"type": n, "box": list(o.box), "confidence": o.confidence} for n, _, o in found
        ],
        "overlay": overlay_data_url(image, [(water, WATER_RGB)] + [(m, WHEEL_RGB) for m in wheel_masks]),
    })
    masks_layers = [(water, WATER_RGB)] + [(m, WHEEL_RGB) for m in wheel_masks]

    # Stage 4 — geometry
    records = []
    for (name, ref, o), mask in zip(found, wheel_masks):
        records.append(analyse_wheel(mask, water, name, ref) | {"box": list(o.box), "confidence": o.confidence})
    yield event("geometry", "Circle fit recovers each wheel's hidden part", {"wheels": records})

    # Stage 5 — fusion
    estimates = [DepthEstimate(r["type"], r["depth_cm"], r["uncertainty_cm"]) for r in records if r["depth_cm"] is not None]
    fused = fuse(estimates)
    weights = [1 / e.uncertainty_cm**2 for e in estimates]
    total = sum(weights)
    yield event("fusion", "Inverse-variance fusion", {
        "inputs": [
            {"type": e.object_type, "depth_cm": e.depth_cm, "uncertainty_cm": e.uncertainty_cm, "weight": wt / total}
            for e, wt in zip(estimates, weights)
        ],
        "depth_cm": fused.depth_cm if fused else None,
        "uncertainty_cm": fused.uncertainty_cm if fused else None,
    })

    # Stage 6 — verification
    verdict = await judge_task
    yield event("verify", "Muse Spark verifies the report", {
        "verdict": verdict, "duplicate_of": duplicate_of, "exif": meta,
        "cross_check": cross_check(fused.depth_cm if fused else None, verdict),
    })

    # Stage 7 — decision and storage
    depth_cm = fused.depth_cm if fused else None
    unc = fused.uncertainty_cm if fused else None
    status = decide(duplicate_of, verdict, depth_cm, meta)
    place = await geo.place_name(lat, lng) if status in store.PUBLISHED else None
    evidence = {
        "width": w, "height": h,
        "water": {"coverage_pct": round(100 * float(water.mean()), 1), "prompt": water_prompt},
        "wheels": records,
        "fusion": [{"depth_cm": e.depth_cm, "uncertainty_cm": e.uncertainty_cm, "weight": wt / total}
                   for e, wt in zip(estimates, weights)] if estimates else [],
        "cross_check": cross_check(depth_cm, verdict),
        "exif": meta,
    }
    report_id = store.add_report(lat, lng, str(phash), depth_cm, unc, status, verdict, place=place, evidence=evidence)
    try:
        hide = await privacy_task
    except Exception:
        hide = None  # fail closed: if faces and plates cannot be located, no image is kept
    if status != "rejected_duplicate" and hide is not None:
        store.save_media(report_id, "photo", evidence_photo(image, hide))
        store.save_media(report_id, "overlay", overlay_jpeg(image, masks_layers, hide))
    yield event("result", "Decision", {
        "id": report_id, "status": status, "place": place, "depth_cm": depth_cm, "uncertainty_cm": unc,
        "total_ms": round((time.perf_counter() - t0) * 1000),
    })
