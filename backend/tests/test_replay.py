import asyncio
import io
import json

import imagehash
from PIL import Image

from services import replay


def photo(seed: int) -> bytes:
    img = Image.effect_noise((64, 64), seed * 40 + 10).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def recording(image: bytes) -> list[dict]:
    h = str(imagehash.phash(Image.open(io.BytesIO(image))))
    return [
        {"stage": "intake", "ms": 0, "data": {"phash": h}},
        {"stage": "result", "ms": 0, "data": {"id": 5, "status": "verified"}},
    ]


def test_a_sample_photo_finds_its_recording_and_others_do_not(monkeypatch):
    img = photo(1)
    rec = recording(img)
    monkeypatch.setattr(replay, "_cache", [(imagehash.hex_to_hash(rec[0]["data"]["phash"]), rec)])
    assert replay.find(img) == rec
    assert replay.find(_plain()) is None


def _plain() -> bytes:
    buf = io.BytesIO()
    Image.linear_gradient("L").convert("RGB").save(buf, "JPEG")
    return buf.getvalue()


def test_replay_saves_nothing_so_the_result_has_no_report_id():
    events = recording(photo(2))

    async def collect():
        return [e async for e in replay.play(events)]

    out = asyncio.run(collect())
    assert out[-1]["data"]["id"] is None and out[-1]["data"]["replay"] is True
    json.dumps(out)
