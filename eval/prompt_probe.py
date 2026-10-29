"""How many instances does each SAM prompt find per photo?

    python -u eval/prompt_probe.py frontend/public/samples/s01.jpg ...
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.meta_client import segment  # noqa: E402

PROMPTS = ["car wheel", "wheel", "tire", "car"]


async def main(photos: list[Path]) -> None:
    for p in photos:
        image = p.read_bytes()
        counts = await asyncio.gather(*(segment(image, q) for q in PROMPTS))
        print(p.name, {q: len(c) for q, c in zip(PROMPTS, counts)}, flush=True)


if __name__ == "__main__":
    asyncio.run(main([Path(a) for a in sys.argv[1:]]))
