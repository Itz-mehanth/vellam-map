"""Report verification: duplicate photos (perceptual hash) + Muse Spark judgement."""

import io
import json
import re

import imagehash
from PIL import Image

from .meta_client import ask_muse_spark
from .store import all_reports

DUPLICATE_DISTANCE = 6  # max Hamming distance between 64-bit pHashes

PROMPT = """You verify crowdsourced flood photos. Look at the image and reply with ONLY a JSON object:
{"is_flood": bool, "is_outdoor_street": bool, "looks_staged_or_stock": bool, "water_depth_hint": "ankle|knee|thigh|waist|deeper|unknown", "reason": "<one sentence>"}"""


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
