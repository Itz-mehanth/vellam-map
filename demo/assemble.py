"""Assemble the silent demo cut: explainer cards + slowed app scenes + burned-in captions + an .srt.

    python demo/assemble.py <capture-folder> <output-folder>

The capture folder comes from capture.py (raw.webm + scenes.json). Cards marked [ INSERT ... ] are placeholders for
footage only the team can shoot. Captions are the voiceover script; re-time them after recording the voice.
"""
import json
import subprocess
import sys
from pathlib import Path

CAP = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
sc = {s["scene"]: s["t"] for s in json.loads((CAP / "scenes.json").read_text())}
RAW = CAP / "raw.webm"
FONT = "C\\:/Windows/Fonts/segoeui.ttf"
FONTB = "C\\:/Windows/Fonts/segoeuib.ttf"
MUTED, WHITE, ACCENT = "0xa2aab1", "white", "0x6fb1ff"

H1, H2, BODY = 52, 30, 28


def card(*lines):
    """lines: (text, size, color, bold)."""
    return list(lines)


# kind, name, duration or (start, end, slow factor), card lines, captions [(offset, length, text)]
PLAN = [
    ("card", "intro", 10, card(("Chennai floods", H1, WHITE, True), ("How deep is this street?", H2, MUTED, False),
                               ("[ INSERT your real Chennai flood footage here ]", 24, ACCENT, False)),
     [(0.5, 9, "In Chennai, everyone shares flood photos. Nobody can tell how deep the water is.")]),
    ("card", "problem", 14, card(("The problem", H2, ACCENT, True),
                                 ("1.81 billion people face serious flood risk", H1 - 8, WHITE, True),
                                 ("About 290 died in Chennai's 2015 floods, many from electrocution and wall collapse.", BODY, MUTED, False),
                                 ("A photo is not data: nobody can tell if it shows 10 cm or 1 m.", BODY, MUTED, False)),
     [(0.5, 13, "People post photos during a flood, but a photo can't tell a driver or a rescue team how deep the water is. Vellam turns the photo into a number.")]),
    ("clip", "live", (1.0, sc["report-tab"], 1.0), None,
     [(0.5, 10.5, "A live map of reports (these are labelled demo data), with area alerts built from clusters of nearby reports.")]),
    ("card", "pipeline", 18, card(("How a report is checked", H2, ACCENT, True),
                                  ("SAM 3.1 outlines the water and every wheel", BODY + 2, WHITE, True),
                                  ("Geometry turns the waterline on a wheel into centimetres, with an error range", BODY, MUTED, False),
                                  ("Muse Spark judges whether it is a real flood and estimates depth on its own", BODY + 2, WHITE, True),
                                  ("A big disagreement sends the report to review, not the map", BODY, MUTED, False),
                                  ("Duplicates, stale photos and wrong locations are caught. Faces and plates are blurred.", BODY, MUTED, False)),
     [(0.5, 19, "Four jobs, checked against each other. A measurement from geometry, an independent judgement from Muse Spark, and trust checks around both.")]),
    ("clip", "verified", (sc["run-verified"], sc["after-verified"], 1.4), None,
     [(1, 12, "Every stage is shown: the water SAM found, the wheels, the geometry, then Muse Spark's check."),
      (13.5, 12, "Both readings appear with their uncertainty, so you can see why it said what it said.")]),
    ("clip", "review", (sc["run-review"], sc["after-review"], 1.5), None,
     [(1, 16, "When geometry and Muse Spark disagree, the report goes to review. A wrong depth is worse than none.")]),
    ("clip", "rejected", (sc["run-rejected"], sc["after-rejected"], 1.5), None,
     [(1, 7, "Not a flood? Rejected, with the reason.")]),
    ("card", "ask", 12, card(("Ask in Tamil or English", H1, WHITE, True), ("Muse Voice Transcribe  +  Muse Spark, answering from the live map", H2, MUTED, False),
                             ("[ RECORD with a live API key: Tamil voice question and spoken answer ]", 24, ACCENT, False)),
     [(0.5, 13, "Ask by voice, in Tamil: is this road flooded? Muse Voice Transcribe listens and Muse Spark answers from the live reports.")]),
    ("clip", "benchmark", (sc["benchmark"], sc["end"], 1.3), None,
     [(0.5, 9, "We tested the real pipeline on 100 public photos of flooded cars with known depth levels."),
      (10, 10, "Muse Spark's depth ranks with the true level: rank correlation 0.89, and 99% within one level.")]),
    ("card", "found", 18, card(("What the test found", H2, ACCENT, True),
                               ("Wheel geometry reads only 12 of 100 photos, and reads low", BODY + 2, WHITE, True),
                               ("So we show it as one input, not as the answer", BODY, MUTED, False),
                               ("The strict flood check rejected 33% of real floods", BODY + 2, WHITE, True),
                               ("We graded its evidence instead: 33% down to 1% on photos it had never seen", BODY, MUTED, False),
                               ("The catch: about a third of floods now show as unconfirmed", BODY, MUTED, False)),
     [(0.5, 19, "The test found real problems. Geometry is weak on tight crops, and our flood check was losing real reports. We fixed the check, and we say what it costs.")]),
    ("card", "field", 14, card(("Field test", H1, WHITE, True), ("Tape measure against Vellam, in Chennai", H2, MUTED, False),
                               ("[ INSERT: tape-measure photos and the measured error from eval/accuracy.py ]", 24, ACCENT, False)),
     [(0.5, 13, "And in the real world: we measured waterlogged streets in Chennai with a tape and compared.")]),
    ("card", "end", 10, card(("Vellam Map", H1, WHITE, True), ("github.com/Itz-mehanth/vellam-map", H2, ACCENT, False),
                             ("Open source (MIT)  .  SAM 3.1  .  Muse Spark  .  Muse Voice Transcribe", 24, MUTED, False)),
     [(0.5, 9, "Open source. Built for the people who have to drive through it.")]),
]


def run(*a, cwd=None):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True, cwd=cwd)


def esc(t):
    return t.replace("'", "’").replace(":", "\\:").replace("%", "\\%")


def ts(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


parts, srt, cursor = [], [], 0.0
for n, (kind, name, span, lines, caps) in enumerate(PLAN):
    f = OUT / f"{n:02d}_{name}.mp4"
    if kind == "card":
        dur = span
        y = 150 if len(lines) > 3 else 230
        chain = []
        for text, size, color, bold in lines:
            chain.append(f"drawtext=fontfile='{FONTB if bold else FONT}':text='{esc(text)}':fontcolor={color}:fontsize={size}:expansion=none:x=(w-text_w)/2:y={y}")
            y += int(size * 1.9)
        run("-f", "lavfi", "-i", f"color=c=0x0d1b26:s=1280x720:r=30:d={dur}", "-vf", ",".join(chain), "-pix_fmt", "yuv420p", str(f))
    else:
        a, b, slow = span
        dur = (b - a) * slow
        run("-ss", str(a), "-t", str(b - a), "-i", str(RAW), "-vf", f"fps=30,scale=1280:720,setpts={slow}*PTS", "-pix_fmt", "yuv420p", "-an", str(f))
    for off, length, text in caps:
        end = min(off + length, dur - 0.2)
        if end > off:
            srt.append((cursor + off, cursor + end, text))
    parts.append(f)
    cursor += dur

(OUT / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in parts))
run("-f", "concat", "-safe", "0", "-i", str(OUT / "list.txt"), "-c", "copy", str(OUT / "joined.mp4"))
(OUT / "captions.srt").write_text("".join(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n\n" for i, (s, e, t) in enumerate(srt, 1)), encoding="utf-8")
style = "FontName=Segoe UI Semibold,FontSize=17,PrimaryColour=&HFFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=26,Alignment=2"
run("-i", "joined.mp4", "-vf", f"subtitles=captions.srt:force_style='{style}'", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "demo_silent.mp4", cwd=OUT)
print(f"total {cursor:.0f}s ({int(cursor // 60)}:{int(cursor % 60):02d}), {len(srt)} captions -> {OUT / 'demo_silent.mp4'}")
