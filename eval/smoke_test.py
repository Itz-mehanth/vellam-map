"""API smoke test: one Muse Spark call and SAM 3.1 calls on a flood photo.

Checks that your Meta API key and the model IDs work. From the repo root, with the backend
virtualenv active:
    python eval/smoke_test.py frontend/public/samples/s05.jpg
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.meta_client import ask_muse_spark, segment  # noqa: E402

CONCEPTS = ["water", "car wheel", "car"]


async def main(photo: Path) -> None:
    image = photo.read_bytes()

    print("Muse Spark ...")
    print(await ask_muse_spark("Reply with exactly: Vellam Map online."))

    for concept in CONCEPTS:
        objects = await segment(image, concept)
        print(f"\nSAM 3.1 '{concept}': {len(objects)} object(s)")
        for o in objects:
            left, top, right, bottom = o.box
            conf = f"{o.confidence:.2f}" if o.confidence is not None else "-"
            print(
                f"  id={o.object_id} box=({left:.0f},{top:.0f})-({right:.0f},{bottom:.0f}) "
                f"mask={o.mask.shape[1]}x{o.mask.shape[0]} px={int(o.mask.sum())} conf={conf}"
            )


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1])))
