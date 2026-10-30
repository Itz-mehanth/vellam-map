"""Draw SAM 3.1 masks over a photo for visual checking.

    python eval/overlay.py PHOTO OUT.png "water" "car wheel"
"""

import asyncio
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.meta_client import segment  # noqa: E402

COLOURS = [(0, 120, 255), (255, 60, 0), (0, 200, 80), (255, 200, 0)]


async def main(photo: Path, out: Path, concepts: list[str]) -> None:
    image = photo.read_bytes()
    canvas = np.asarray(Image.open(photo).convert("RGB")).astype(float)
    for colour, concept in zip(COLOURS, concepts, strict=False):
        for o in await segment(image, concept):
            left, top = int(o.box[0]), int(o.box[1])
            h, w = o.mask.shape
            region = canvas[top : top + h, left : left + w]
            m = o.mask[: region.shape[0], : region.shape[1]]
            region[m] = region[m] * 0.45 + np.array(colour) * 0.55
    Image.fromarray(canvas.astype(np.uint8)).save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]))
