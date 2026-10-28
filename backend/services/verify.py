"""Report verification: duplicate photos (perceptual hash) + Muse Spark judgement."""

import io
import json
import re

import imagehash
from PIL import Image

from .meta_client import ask_muse_spark
from .store import all_reports

DUPLICATE_DISTANCE = 6  # max Hamming distance between 64-bit pHashes

PROMPT = """You verify crowdsourced flood photos for a flood-warning map. Be strict.
"is_flood" is true ONLY if floodwater clearly covers a street or ground area well beyond a puddle: it should reach vehicle wheels, kerbs, doors or people's legs, or spread across the whole road.
It is false for puddles, splashes from a car driving through shallow water, rain, wet roads, rivers or lakes inside their banks, pools, fountains, and indoor scenes.
Also estimate the water depth in centimetres from objects of known size (wheel ~60 cm, kerb ~15 cm, adult knee ~50 cm, adult waist ~100 cm). Give a low and high bound, or null if you cannot tell.
Reply with ONLY a JSON object:
{"is_flood": bool, "is_puddle_or_splash": bool, "is_outdoor_street": bool, "looks_staged_or_stock": bool, "water_depth_hint": "ankle|knee|thigh|waist|deeper|unknown", "depth_cm_low": number|null, "depth_cm_high": number|null, "depth_reference": "<object used, or null>", "reason": "<one sentence>"}"""


def photo_hash(image: bytes) -> imagehash.ImageHash:
    return imagehash.phash(Image.open(io.BytesIO(image)))


def find_duplicate(phash: imagehash.ImageHash) -> int | None:
    for row in all_reports():
        if phash - imagehash.hex_to_hash(row["phash"]) <= DUPLICATE_DISTANCE:
            return row["id"]
    return None


async def judge(image: bytes) -> dict:
    text = await ask_muse_spark(PROMPT, image)
    match = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(match.group(0)) if match else {"error": "unparseable", "raw": text}
    except json.JSONDecodeError:
        return {"error": "unparseable", "raw": text}
