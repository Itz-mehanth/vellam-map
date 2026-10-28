"""The depth maths, validated on synthetic wheels whose true depth is known by construction."""

import numpy as np
import pytest

from services.depth import DepthEstimate, depth_from_wheel, fit_circle, fuse


def visible_rim(cx, cy, r, waterline_y, n=120, noise_px=0.0, seed=0):
    """Rim points of a wheel above the waterline (image y grows downward)."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    pts = np.column_stack([cx + r * np.cos(t), cy + r * np.sin(t)])
    pts = pts[pts[:, 1] < waterline_y]
    return pts + rng.normal(0, noise_px, pts.shape)


def test_fit_circle_recovers_centre_and_radius():
    t = np.linspace(0.2, 2.5, 60)  # only an arc, as when part of the wheel is hidden
    pts = np.column_stack([300 + 80 * np.cos(t), 200 + 80 * np.sin(t)])
    cx, cy, r = fit_circle(pts)
    assert (cx, cy, r) == pytest.approx((300, 200, 80), abs=1e-6)


@pytest.mark.parametrize("submerged_cm", [5, 15, 25, 35, 45])
def test_depth_matches_known_depth(submerged_cm):
    diameter_cm, r_px = 60.0, 50.0
    px_per_cm = 2 * r_px / diameter_cm
    cx, cy = 400.0, 300.0
    bottom = cy + r_px
    waterline = bottom - submerged_cm * px_per_cm
    est = depth_from_wheel(visible_rim(cx, cy, r_px, waterline), waterline, diameter_cm, (55, 66))
    assert est is not None
    assert est.depth_cm == pytest.approx(submerged_cm, abs=0.5)


def test_depth_is_robust_to_pixel_noise():
    diameter_cm, r_px, truth = 60.0, 60.0, 30.0
    waterline = 300 + r_px - truth * (2 * r_px / diameter_cm)
    errors = [
        depth_from_wheel(
            visible_rim(400, 300, r_px, waterline, noise_px=1.0, seed=s), waterline, diameter_cm, (55, 66)
        ).depth_cm
        - truth
        for s in range(30)
    ]
    assert abs(np.mean(errors)) < 1.5 and max(abs(e) for e in errors) < 5


def test_wheel_not_in_water_gives_no_estimate():
    # Waterline below the road contact point: the wheel is dry.
    pts = visible_rim(400, 300, 50, 400)
    assert depth_from_wheel(pts, 400, 60, (55, 66)) is None


def test_too_few_points_gives_no_estimate():
    assert depth_from_wheel(np.array([[0.0, 0.0], [1.0, 1.0]]), 10, 60, (55, 66)) is None


def test_uncertainty_grows_with_wheel_size_spread():
    pts = visible_rim(400, 300, 50, 330)
    narrow = depth_from_wheel(pts, 330, 60, (59, 61))
    wide = depth_from_wheel(pts, 330, 60, (50, 70))
    assert wide.uncertainty_cm > narrow.uncertainty_cm > 0


def test_fusion_weights_the_more_certain_estimate_more():
    fused = fuse([DepthEstimate("a", 20, 2), DepthEstimate("b", 40, 20)])
    assert 20 < fused.depth_cm < 25
    assert fused.uncertainty_cm < 2


def test_fusion_of_nothing_is_none():
    assert fuse([]) is None
