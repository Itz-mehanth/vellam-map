"""Run the full pipeline on photos and print each stage.

    python -u eval/measure.py frontend/public/samples/*.jpg
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services import store  # noqa: E402
from services.pipeline import analyse  # noqa: E402


async def main(photos: list[Path]) -> None:
    store.DB_PATH = Path(__file__).resolve().parent / "eval.db"  # keep eval runs out of the real map
    store.DB_PATH.unlink(missing_ok=True)
    for p in photos:
        print(p.name)
        async for ev in analyse(p.read_bytes(), 0.0, 0.0):
            d = ev["data"]
            if ev["stage"] == "geometry":
                for w in d["wheels"]:
                    depth = f"{w['depth_cm']:.1f} cm" if w["depth_cm"] is not None else "-"
                    print(f"   wheel {w['type']}: {depth} ({w['reason']})")
            elif ev["stage"] == "fusion" and d["depth_cm"] is not None:
                print(f"   FUSED {d['depth_cm']:.1f} ± {d['uncertainty_cm']:.1f} cm")
            elif ev["stage"] == "verify":
                v = d["verdict"]
                print(f"   visual {v.get('depth_cm_low')}-{v.get('depth_cm_high')} cm, flood={v.get('is_flood')}, cross-check={d['cross_check']}")
            elif ev["stage"] == "result":
                print(f"   -> {d['status']} in {d['total_ms']} ms")


if __name__ == "__main__":
    asyncio.run(main([Path(a) for a in sys.argv[1:]]))
