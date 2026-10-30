"""Guards against physically impossible wheel readings (found by the public-dataset benchmark)."""

import numpy as np

from services import pipeline
from services.depth import DepthEstimate

CAR_WHEEL = {"diameter_cm": 60, "range_cm": [55, 66]}


def half_submerged_wheel():
    """A wheel (centre 60,60, radius 25 px) with everything below y=70 under water."""
    yy, xx = np.mgrid[0:120, 0:120]
    wheel = ((xx - 60) ** 2 + (yy - 60) ** 2 <= 25**2) & (yy < 70)
    water = np.zeros((120, 120), dtype=bool)
    water[70:, :] = True
    return wheel, water


def test_a_normal_partly_submerged_wheel_is_measured():
    wheel, water = half_submerged_wheel()
    rec = pipeline.analyse_wheel(wheel, water, "car_wheel", CAR_WHEEL)
    assert rec["reason"] == "ok" and 5 < rec["depth_cm"] < 40


def test_a_reading_deeper_than_the_wheel_is_rejected(monkeypatch):
    wheel, water = half_submerged_wheel()
    monkeypatch.setattr(pipeline, "depth_from_wheel", lambda *a, **k: DepthEstimate("wheel", 400.0, 5.0))
    rec = pipeline.analyse_wheel(wheel, water, "car_wheel", CAR_WHEEL)
    assert rec["depth_cm"] is None and "exceeds the wheel" in rec["reason"]


def test_a_reading_just_inside_the_wheel_height_is_kept(monkeypatch):
    wheel, water = half_submerged_wheel()
    monkeypatch.setattr(pipeline, "depth_from_wheel", lambda *a, **k: DepthEstimate("wheel", 66.0, 5.0))
    assert pipeline.analyse_wheel(wheel, water, "car_wheel", CAR_WHEEL)["depth_cm"] == 66.0
