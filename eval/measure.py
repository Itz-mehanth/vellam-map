"""Run the depth pipeline on photos.

    backend/.venv/Scripts/python eval/measure.py eval/photos/*.jpg
"""

import asyncio
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.pipeline import measure  # noqa: E402


async def main(photos: list[Path]) -> None:
    for p in photos:
        w, h = Image.open(p).size
        r = await measure(p.read_bytes(), (h, w))
        print(p.name, "water" if r["water_found"] else "no water", f"objects={len(r['objects'])}")
        for o in r["objects"]:
            d = f"{o['depth_cm']:.1f} cm" if o["depth_cm"] is not None else "no fit"
            print(f"   {o['type']} conf={o['confidence']} -> {d} ({o['reason']})")
        if r["depth_cm"] is not None:
            print(f"   FUSED: {r['depth_cm']:.1f} ± {r['uncertainty_cm']:.1f} cm")


if __name__ == "__main__":
    asyncio.run(main([Path(a) for a in sys.argv[1:]]))
