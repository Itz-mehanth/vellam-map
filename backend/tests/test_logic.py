import io
import time

import pytest
from fastapi import HTTPException
from PIL import Image

from services import exif
from services.limits import RateLimiter
from services.pipeline import cross_check, decide

FLOOD = {"flood_evidence": "clear", "is_flood": True, "looks_staged_or_stock": False,
         "depth_cm_low": 20, "depth_cm_high": 35}


def test_cross_check():
    assert cross_check(34, FLOOD) == "agree"
    assert cross_check(75, FLOOD) == "disagree"
    assert cross_check(None, FLOOD) == "unavailable"
    assert cross_check(40, {}) == "unavailable"


def test_decide_order_of_rejections():
    assert decide(7, FLOOD, 30) == "rejected_duplicate"
    assert decide(None, FLOOD, 30, {"stale": True}) == "rejected_stale"
    assert decide(None, FLOOD | {"flood_evidence": "none", "is_flood": False}, 30) == "rejected_not_flood"
    assert decide(None, FLOOD | {"looks_staged_or_stock": True}, 30) == "rejected_not_flood"


def test_uncertain_evidence_is_flagged_not_discarded():
    possible = FLOOD | {"flood_evidence": "possible"}
    assert decide(None, possible, None) == "flood_unconfirmed"
    assert decide(None, possible, 30) == "flood_unconfirmed"  # even with a measurement
    assert decide(None, possible, 90) == "flood_review"  # a geometry disagreement is the stronger flag
    assert decide(None, possible | {"is_flood": True, "looks_staged_or_stock": True}, 30) == "rejected_not_flood"
    assert decide(7, possible, 30) == "rejected_duplicate"


def test_decide_publishes_according_to_evidence():
    assert decide(None, FLOOD, 30) == "verified"
    assert decide(None, FLOOD, 90) == "flood_review"  # geometry far from the visual range
    assert decide(None, FLOOD, 30, {"mismatch": True}) == "flood_review"
    assert decide(None, FLOOD, None) == "flood_visual_estimate"
    assert decide(None, {"flood_evidence": "clear"}, None) == "flood_unmeasured"


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


def test_redaction_blurs_only_the_masked_region():
    import numpy as np

    from services.pipeline import redact

    img = Image.new("RGB", (200, 200), "white")
    for x in range(200):  # a hard black/white stripe pattern: easy to tell blurred from sharp
        for y in range(200):
            if (x // 4) % 2 == 0:
                img.putpixel((x, y), (0, 0, 0))
    mask = np.zeros((200, 200), dtype=bool)
    mask[60:120, 60:120] = True
    out = np.asarray(redact(img, mask)).astype(int)
    src = np.asarray(img).astype(int)
    assert out[80:100, 80:100].std() < src[80:100, 80:100].std() / 3  # inside: stripes smoothed away
    assert np.array_equal(out[:30, :30], src[:30, :30])  # far outside: untouched


def test_redaction_without_a_mask_is_a_no_op():
    from services.pipeline import redact

    img = Image.new("RGB", (20, 20), "red")
    assert redact(img, None) is img
