"""Photo metadata checks: is the photo recent, and was it taken where it was reported?

Many apps (WhatsApp, screenshots) strip EXIF, so missing metadata is "unknown",
never a failure. Only metadata that is present and contradicts the report counts.
"""

import io
import time
from datetime import datetime

from PIL import Image

from .geo import distance_m

STALE_HOURS = 72
MISMATCH_KM = 3.0

_EXIF_IFD, _GPS_IFD = 0x8769, 0x8825
_DATETIME_ORIGINAL, _DATETIME = 0x9003, 0x0132


def _degrees(value, ref) -> float | None:
    try:
        d, m, s = (float(x) for x in value)
    except (TypeError, ValueError):
        return None
    deg = d + m / 60 + s / 3600
    return -deg if ref in ("S", "W") else deg


def inspect(image: bytes, lat: float, lng: float, now: float | None = None) -> dict:
    now = now or time.time()
    out = {"has_taken_at": False, "age_hours": None, "stale": False,
           "has_gps": False, "distance_km": None, "mismatch": False}
    try:
        exif = Image.open(io.BytesIO(image)).getexif()
        sub, gps = exif.get_ifd(_EXIF_IFD), exif.get_ifd(_GPS_IFD)
    except Exception:
        return out

    stamp = sub.get(_DATETIME_ORIGINAL) or exif.get(_DATETIME)
    if stamp:
        try:
            taken = datetime.strptime(str(stamp), "%Y:%m:%d %H:%M:%S").timestamp()  # camera local time
            out["has_taken_at"] = True
            out["age_hours"] = round((now - taken) / 3600, 1)
            out["stale"] = out["age_hours"] > STALE_HOURS
        except ValueError:
            pass

    if gps.get(2) and gps.get(4):
        photo_lat, photo_lng = _degrees(gps[2], gps.get(1)), _degrees(gps[4], gps.get(3))
        if photo_lat is not None and photo_lng is not None:
            out["has_gps"] = True
            out["distance_km"] = round(distance_m(lat, lng, photo_lat, photo_lng) / 1000, 1)
            out["mismatch"] = out["distance_km"] > MISMATCH_KM
    return out
