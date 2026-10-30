"""Client for the Meta Model API (https://dev.meta.ai/docs).

Uses the OpenAI SDK against Meta's OpenAI-compatible Responses API. SAM 3.1
output is a streamed special-token grammar, decoded with Meta's official
`meta_sam_parser`.
"""

import asyncio
import base64
import os
from dataclasses import dataclass

import numpy as np
from dotenv import load_dotenv
from meta_sam_parser import (
    SegmentationBoxRecord,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    image_segmentation_format,
    parse_responses_stream,
)
from openai import AsyncOpenAI

load_dotenv()

MUSE_SPARK_MODEL = os.getenv("MUSE_SPARK_MODEL", "muse-spark-1.3")
SAM_MODEL = os.getenv("SAM_MODEL", "sam-3.1")
VOICE_TRANSCRIBE_MODEL = os.getenv("VOICE_TRANSCRIBE_MODEL", "muse-voice-transcribe-1.0")

client = AsyncOpenAI(
    base_url=os.getenv("META_API_BASE_URL", "https://api.meta.ai/v1"),
    api_key=os.getenv("META_API_KEY"),
    # Fail within a minute instead of the SDK's ten, so an unreachable API shows an error rather than a hang.
    # Calls normally take 5 to 20 s; segment() already retries transient failures itself.
    timeout=float(os.getenv("META_API_TIMEOUT_S", "60")),
    max_retries=1,
)


@dataclass
class SegmentedObject:
    object_id: str
    box: tuple[float, float, float, float]  # left, top, right, bottom (source px)
    mask: np.ndarray  # bool, box-local, shape (height, width)
    confidence: float | None


def image_data_url(image: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(image).decode()}"


async def segment(image: bytes, concept: str, mime: str = "image/jpeg") -> list[SegmentedObject]:
    """SAM 3.1: every instance of one noun phrase, retried on transient network errors."""
    for attempt in range(3):
        try:
            return await _segment_once(image, concept, mime)
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(1.5 * (attempt + 1))


async def _segment_once(image: bytes, concept: str, mime: str) -> list[SegmentedObject]:
    stream = await client.responses.create(
        model=SAM_MODEL,
        input=[
            {
                "type": "message",
                "role": "user",
                "content": [
                    {"type": "input_text", "text": concept},
                    {"type": "input_image", "image_url": image_data_url(image, mime)},
                ],
            }
        ],
        stream=True,
        metadata={"include_confidence": "true"},
    )
    result = await parse_responses_stream(stream, image_segmentation_format()).final_result()

    boxes: dict[str, SegmentationBoxRecord] = {}
    masks: dict[str, SegmentationMaskRecord] = {}
    for record in result.records:
        if isinstance(record, SegmentationBoxRecord):
            boxes[record.object_id] = record
        elif isinstance(record, SegmentationMaskRecord):
            masks[record.object_id] = record

    objects = []
    for object_id, m in masks.items():
        raster = np.frombuffer(decode_mask_to_raster(m.mask), dtype=np.uint8)
        b = boxes.get(object_id) or m.bounds
        objects.append(
            SegmentedObject(
                object_id=object_id,
                box=(b.left, b.top, b.right, b.bottom),
                mask=raster.reshape(m.mask.height, m.mask.width).astype(bool),
                confidence=m.confidence,
            )
        )
    return objects


async def ask_muse_spark(prompt: str, image: bytes | None = None, mime: str = "image/jpeg") -> str:
    """Muse Spark: vision + text reasoning (report checks, alerts, Q&A)."""
    content: list[dict] = [{"type": "input_text", "text": prompt}]
    if image is not None:
        content.append({"type": "input_image", "image_url": image_data_url(image, mime)})
    response = await client.responses.create(
        model=MUSE_SPARK_MODEL,
        input=[{"type": "message", "role": "user", "content": content}],
    )
    return response.output_text


async def transcribe(wav: bytes, language: str | None = None) -> str:
    """Muse Voice Transcribe: speech to text. wav must be mono 16-bit PCM at 16 or 24 kHz."""
    import json

    import httpx

    settings = {"mode": "PUSH_TO_TALK", "model": VOICE_TRANSCRIBE_MODEL, "audioEncoding": "WAV"}
    if language:
        settings["languageBias"] = [language]  # a hint only; omitted lets the model detect the language
    base = str(client.base_url).rstrip("/")
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.post(
            f"{base}/asr/transcribe",
            headers={"Authorization": f"Bearer {client.api_key}"},
            files={
                "request": (None, json.dumps(settings), "application/json"),
                "audio": ("question.wav", wav, "audio/wav"),
            },
        )
    r.raise_for_status()
    return r.json().get("transcript", "").strip()
