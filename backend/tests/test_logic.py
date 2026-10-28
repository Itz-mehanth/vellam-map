import io
import time

import pytest
from fastapi import HTTPException
from PIL import Image

from services import exif
from services.limits import RateLimiter
from services.pipeline import cross_check, decide

FLOOD = {"is_flood": True, "is_puddle_or_splash": False, "looks_staged_or_stock": False,
         "depth_cm_low": 20, "depth_cm_high": 35}


def test_cross_check():
    assert cross_check(34, FLOOD) == "agree"
    assert cross_check(75, FLOOD) == "disagree"
    assert cross_check(None, FLOOD) == "unavailable"
    assert cross_check(40, {}) == "unavailable"


def test_decide_order_of_rejections():
    assert decide(7, FLOOD, 30) == "rejected_duplicate"
    assert decide(None, FLOOD, 30, {"stale": True}) == "rejected_stale"
    assert decide(None, FLOOD | {"is_flood": False}, 30) == "rejected_not_flood"
    assert decide(None, FLOOD | {"is_puddle_or_splash": True}, 30) == "rejected_not_flood"
    assert decide(None, FLOOD | {"looks_staged_or_stock": True}, 30) == "rejected_not_flood"


def test_decide_publishes_according_to_evidence():
    assert decide(None, FLOOD, 30) == "verified"
    assert decide(None, FLOOD, 90) == "flood_review"  # geometry far from the visual range
    assert decide(None, FLOOD, 30, {"mismatch": True}) == "flood_review"
    assert decide(None, FLOOD, None) == "flood_visual_estimate"
    assert decide(None, {"is_flood": True}, None) == "flood_unmeasured"


def jpeg(exif_bytes=None) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40)).save(buf, "JPEG", exif=exif_bytes or b"")
    return buf.getvalue()


def test_exif_missing_is_unknown_not_a_failure():
    r = exif.inspect(jpeg(), 13.08, 80.27)
    assert not r["has_taken_at"] and not r["has_gps"] and not r["stale"] and not r["mismatch"]


def test_exif_old_timestamp_is_stale():
    e = Image.Exif()
    e.get_ifd(0x8769)[0x9003] = "2015:12:01 10:00:00"
    r = exif.inspect(jpeg(e.tobytes()), 13.08, 80.27)
    assert r["has_taken_at"] and r["stale"]


def test_exif_recent_timestamp_is_fine():
    e = Image.Exif()
    e.get_ifd(0x8769)[0x9003] = time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(time.time() - 3600))
    r = exif.inspect(jpeg(e.tobytes()), 13.08, 80.27)
    assert r["has_taken_at"] and not r["stale"]


def test_exif_gps_far_from_reported_location_is_a_mismatch():
    e = Image.Exif()
    gps = e.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = "N", (51.0, 30.0, 0.0), "W", (0.0, 7.0, 0.0)  # London
    r = exif.inspect(jpeg(e.tobytes()), 13.08, 80.27)  # reported from Chennai
    assert r["has_gps"] and r["mismatch"] and r["distance_km"] > 1000


def test_rate_limiter_blocks_then_recovers():
    rl = RateLimiter(limit=2, window_s=60)
    rl.check("a", now=0)
    rl.check("a", now=1)
    with pytest.raises(HTTPException) as e:
        rl.check("a", now=2)
    assert e.value.status_code == 429
    rl.check("b", now=2)  # other clients are unaffected
    rl.check("a", now=62)  # window has passed
