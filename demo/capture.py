"""Record the silent screen capture for the demo video from the real app in replay mode.

Writes raw.webm plus scenes.json (start/end seconds of each scene) to the output folder.
Run with the backend on :8000 (REPLAY=1) and the frontend on :5173.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:5173"
scenes = []
t0 = None


def mark(name):
    scenes.append({"scene": name, "t": round(time.time() - t0, 2)})
    print(f"{scenes[-1]['t']:6.1f}s  {name}", flush=True)


def run_sample(page, n, name, settle=4):
    page.locator(f'button:has(img[src="/samples/s{n:02d}.jpg"])').click()
    page.wait_for_timeout(1200)
    mark(name)
    page.get_by_role("button", name="Measure depth").click()
    page.wait_for_selector("text=Measure again", timeout=60000)
    page.wait_for_timeout(settle * 1000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 1280, "height": 720},
        record_video_dir=str(OUT),
        record_video_size={"width": 1280, "height": 720},
        geolocation={"latitude": 13.0418, "longitude": 80.2341},
        permissions=["geolocation"],
    )
    page = ctx.new_page()
    t0 = time.time()
    page.goto(BASE + "/?tab=live")
    page.wait_for_timeout(5000)
    mark("live-map")
    page.wait_for_timeout(6000)

    mark("report-tab")
    page.get_by_role("tab", name="Report").click()
    page.wait_for_timeout(2500)
    run_sample(page, 5, "run-verified", settle=5)
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(3500)
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(3500)
    mark("after-verified")
    page.goto(BASE + "/?tab=report")
    page.wait_for_timeout(1500)
    run_sample(page, 18, "run-review", settle=4)
    page.mouse.wheel(0, 700)
    page.wait_for_timeout(4000)
    mark("after-review")
    page.goto(BASE + "/?tab=report")
    page.wait_for_timeout(1500)
    run_sample(page, 19, "run-rejected", settle=4)
    mark("after-rejected")

    mark("benchmark")
    page.get_by_role("tab", name="Benchmark").click()
    page.wait_for_timeout(5000)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(4500)
    page.mouse.wheel(0, 700)
    page.wait_for_timeout(4500)
    mark("end")
    (OUT / "scenes.json").write_text(json.dumps(scenes, indent=1))
    video = page.video.path()
    ctx.close()
    browser.close()
    Path(video).rename(OUT / "raw.webm")
print("done")
