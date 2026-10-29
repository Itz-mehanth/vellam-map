"""Reverse geocoding (OpenStreetMap Nominatim) and distance helpers."""

import math

import httpx

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
# Nominatim's usage policy requires an identifying User-Agent.
HEADERS = {"User-Agent": "VellamMap/0.1 (+https://github.com/Itz-mehanth/vellam-map)"}


async def place_name(lat: float, lng: float) -> str | None:
    """Short street/area label like 'Velachery Main Road, Velachery', or None if unavailable."""
    a = None
    for _ in range(2):  # the public Nominatim server is slow now and then, so try twice
        try:
            async with httpx.AsyncClient(timeout=8) as http:
                r = await http.get(
                    NOMINATIM,
                    params={"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 17, "accept-language": "en"},
                    headers=HEADERS,
                )
                r.raise_for_status()
                a = r.json().get("address", {})
            break
        except Exception:
            continue
    if a is None:
        return None
    road = a.get("road") or a.get("pedestrian") or a.get("neighbourhood")
    area = a.get("suburb") or a.get("neighbourhood") or a.get("city_district") or a.get("city") or a.get("town")
    parts = [p for p in (road, area) if p]
    return ", ".join(dict.fromkeys(parts)) or None


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))
