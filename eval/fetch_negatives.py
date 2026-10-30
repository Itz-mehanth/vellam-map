"""Download the non-flood test photos used by gate_benchmark.py.

    python eval/fetch_negatives.py

The 21 photos are real non-floods from Wikimedia Commons, chosen to be the hard cases a flood checker should
handle: wet roads and rain, car washes, swimming pools, a wet garage floor, dry streets and car parks. Their
authors and licences are in negatives_manifest.json (public domain, CC0, CC BY or CC BY-SA). They are saved
to eval/datasets/negatives/, which is git-ignored.

Chosen by looking at the images, not by search rank: an earlier automatic pick mixed in fields, mountains,
race cars and large puddles on roads that could be shallow floods, which would have corrupted the test.
"""

import json
import shutil
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "datasets" / "negatives"
UA = {"User-Agent": "VellamMap/0.1 (+https://github.com/Itz-mehanth/vellam-map)"}


def main() -> None:
    manifest = json.loads((ROOT / "negatives_manifest.json").read_text(encoding="utf-8"))
    (OUT / "img").mkdir(parents=True, exist_ok=True)
    got = 0
    for o in manifest:
        target = OUT / "img" / o["file"]
        if target.exists():
            got += 1
            continue
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(o["url"], headers=UA), timeout=60).read()
                target.write_bytes(data)
                got += 1
                break
            except OSError:
                time.sleep(3 * (attempt + 1))
        time.sleep(1.2)  # be polite to Wikimedia
    shutil.copy(ROOT / "negatives_manifest.json", OUT / "manifest.json")
    print(f"{got} of {len(manifest)} photos in {OUT}")


if __name__ == "__main__":
    main()
