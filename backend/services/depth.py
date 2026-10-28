"""Water depth from reference objects of known size.

The core idea: a wheel is a circle of known diameter. SAM 3.1 gives us the
visible (above-water) part of the wheel and the water surface. Fitting a circle
to the visible rim recovers the full wheel — including the hidden part — so the
distance from the wheel's bottom (the road) up to the waterline is the depth.
"""

from dataclasses import dataclass

import numpy as np


@dataclass
class DepthEstimate:
    object_type: str
    depth_cm: float
    uncertainty_cm: float


def fit_circle(points: np.ndarray) -> tuple[float, float, float]:
    """Least-squares circle fit (Kasa method). points: (N, 2) array of x, y pixels.

    Returns (cx, cy, r) in pixels.
    """
    x, y = points[:, 0], points[:, 1]
    a = np.column_stack([x, y, np.ones_like(x)])
    b = x**2 + y**2
    (c0, c1, c2), *_ = np.linalg.lstsq(a, b, rcond=None)
    cx, cy = c0 / 2, c1 / 2
    r = np.sqrt(c2 + cx**2 + cy**2)
    return cx, cy, r


def depth_from_wheel(
    rim_points: np.ndarray,
    waterline_y: float,
    diameter_cm: float,
    diameter_range_cm: tuple[float, float],
) -> DepthEstimate | None:
    """Depth from a partly submerged wheel.

    rim_points: visible rim pixels (image y grows downward).
    waterline_y: y pixel of the water surface where it meets the wheel.
    """
    if len(rim_points) < 10:
        return None
    _, cy, r = fit_circle(rim_points)
    wheel_bottom_y = cy + r
    submerged_px = wheel_bottom_y - waterline_y
    if submerged_px <= 0:
        return None  # wheel not in water
    cm_per_px = diameter_cm / (2 * r)
    depth = submerged_px * cm_per_px
    # Uncertainty from the real spread of wheel sizes for this vehicle class.
    lo, hi = diameter_range_cm
    spread = submerged_px * (hi - lo) / (2 * r) / 2
    return DepthEstimate("wheel", float(depth), float(spread))


def fuse(estimates: list[DepthEstimate]) -> DepthEstimate | None:
    """Inverse-variance weighted average of several object estimates."""
    estimates = [e for e in estimates if e.uncertainty_cm > 0]
    if not estimates:
        return None
    w = np.array([1 / e.uncertainty_cm**2 for e in estimates])
    d = np.array([e.depth_cm for e in estimates])
    depth = float((w * d).sum() / w.sum())
    return DepthEstimate("fused", depth, float(np.sqrt(1 / w.sum())))
