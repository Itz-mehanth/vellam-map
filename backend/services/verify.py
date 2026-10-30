"""Report verification: duplicate photos (perceptual hash) + Muse Spark judgement."""

import io
import json
import re

import imagehash
from PIL import Image

from .meta_client import ask_muse_spark
from .store import all_reports

DUPLICATE_DISTANCE = 6  # max Hamming distance between 64-bit pHashes

# Graded evidence instead of a yes/no. Found on a public benchmark: a strict yes/no wrongly rejected 20% to 30% of
# real floods, mostly blurry or tightly cropped photos and shallow water, because "can't tell" became "no".
# Now uncertainty is its own answer ("possible"), shown on the map as unconfirmed rather than thrown away.
PROMPT = """You check crowdsourced photos for a flood-warning map. Judge only what is visible.
"flood_evidence" is one of:
- "clear": floodwater is visibly standing or flowing on a street or ground area beyond a small puddle, OR a vehicle or person is visibly standing in water that rises above the bottom of its tyres or above the person's feet, even if the photo is tightly cropped or blurry.
- "possible": the ground around the subject looks wet or there may be shallow water, but you cannot see water rising above where the tyres or feet meet the ground, because of blur, darkness, tight cropping or splash.
- "none": no water on the ground around the subject; or only a small isolated puddle; rain on a dry road; a swimming pool, fountain or river inside its banks; or an indoor scene.
If you are unsure between "possible" and "none", answer "possible". Do not call a scene "none" merely because the image is poor, and do not call it "clear" without seeing water above ground contact.
Also estimate the water depth in centimetres from objects of known size (wheel ~60 cm, kerb ~15 cm, adult knee ~50 cm, adult waist ~100 cm). Give a low and high bound, or null if you cannot tell.
Reply with ONLY a JSON object:
{"flood_evidence": "clear|possible|none", "looks_staged_or_stock": bool, "depth_cm_low": number|null, "depth_cm_high": number|null, "depth_reference": "<object used, or null>", "reason": "<one sentence>"}"""


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
        verdict = json.loads(match.group(0)) if match else {"error": "unparseable", "raw": text}
    except json.JSONDecodeError:
        return {"error": "unparseable", "raw": text}
    if verdict.get("flood_evidence") in ("clear", "possible", "none"):
        verdict["is_flood"] = verdict["flood_evidence"] != "none"  # kept for readers that want a plain yes/no
    return verdict
