"""Shrink the recordings from record_replays.py into backend/replays/, which replay mode serves.

    python eval/pack_replays.py

The overlay images are the bulk of each recording. They are re-encoded smaller (longest side 900 px, JPEG 72)
so the repository stays light; every number and verdict is copied unchanged.
"""

import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC, DST = ROOT / "replays", ROOT.parent / "backend" / "replays"


def shrink(data_url: str) -> str:
    img = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))).convert("RGB")
    img.thumbnail((900, 900))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=72, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    DST.mkdir(exist_ok=True)
    total = 0
    for path in sorted(SRC.glob("*.ndjson")):
        out = []
        for line in path.read_text(encoding="utf-8").splitlines():
            ev = json.loads(line)
            ov = ev["data"].get("overlay")
            if isinstance(ov, str) and ov.startswith("data:image"):
                ev["data"]["overlay"] = shrink(ov)
            out.append(json.dumps(ev, separators=(",", ":")))
        text = "\n".join(out) + "\n"
        (DST / path.name).write_text(text, encoding="utf-8")
        total += len(text)
    print(f"{len(list(DST.glob('*.ndjson')))} recordings, {total / 1e6:.1f} MB in {DST}")


if __name__ == "__main__":
    main()
