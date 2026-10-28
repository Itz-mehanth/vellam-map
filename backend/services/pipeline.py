"""Photo -> fused depth estimate: SAM 3.1 masks fed through depth.py."""

import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .depth import DepthEstimate, depth_from_wheel, fit_circle, fuse
from .meta_client import SegmentedObject, segment

REFERENCE = json.loads(
    (Path(__file__).resolve().parents[2] / "data" / "reference_objects.json").read_text()
)["objects"]
WHEELS = {k: v for k, v in REFERENCE.items() if v["shape"] == "circle"}


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


def _wheel_estimate(wheel: np.ndarray, water: np.ndarray, ref: dict) -> tuple[DepthEstimate | None, str]:
    ys, xs = np.nonzero(wheel)
    if len(ys) == 0:
        return None, "empty mask"
    wl = waterline_y(wheel, water)
    if wl is None:
        return None, "no water under wheel"
    pts = rim_points(wheel, water)
    est = depth_from_wheel(pts, wl, ref["diameter_cm"], tuple(ref["range_cm"]))
    if est is None:
        return None, "no circle fit / wheel not in water"
    _, _, r = fit_circle(pts)
    h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    if wl - ys.max() > 0.35 * r:
        return None, "water does not touch wheel"
    if not (0.45 * h <= r <= 1.6 * max(h, w)):
        return None, "implausible circle fit"
    return est, "ok"


def overlay_data_url(image: bytes, water: np.ndarray, wheels: list[np.ndarray]) -> str:
    """Photo with water (blue) and wheel (orange) masks tinted on, as a JPEG data URL."""
    canvas = np.asarray(Image.open(io.BytesIO(image)).convert("RGB")).astype(float)
    for mask, colour in [(water, (37, 99, 235))] + [(w, (249, 115, 22)) for w in wheels]:
        canvas[mask] = canvas[mask] * 0.5 + np.array(colour) * 0.5
    buf = io.BytesIO()
    Image.fromarray(canvas.astype(np.uint8)).save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


async def measure(image: bytes, shape: tuple[int, int]) -> dict:
    """Run SAM 3.1 on one photo. shape = (height, width) of the decoded image."""
    water_objs = await segment(image, "water")
    water = np.zeros(shape, dtype=bool)
    for o in water_objs:
        water |= full_mask(o, shape)

    estimates: list[DepthEstimate] = []
    objects = []
    wheel_masks: list[np.ndarray] = []
    if water.any():
        for name, ref in WHEELS.items():
            for o in await segment(image, ref["prompt"]):
                wheel = full_mask(o, shape)
                wheel_masks.append(wheel)
                est, reason = _wheel_estimate(wheel, water, ref)
                objects.append(
                    {"type": name, "box": o.box, "confidence": o.confidence,
                     "depth_cm": est.depth_cm if est else None, "reason": reason}
                )
                if est:
                    estimates.append(est)

    fused = fuse(estimates)
    return {
        "overlay": overlay_data_url(image, water, wheel_masks),
        "image_size": [shape[1], shape[0]],
        "water_found": bool(water.any()),
        "objects": objects,
        "depth_cm": fused.depth_cm if fused else None,
        "uncertainty_cm": fused.uncertainty_cm if fused else None,
    }
