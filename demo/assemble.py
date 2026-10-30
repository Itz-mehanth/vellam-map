"""Assemble the silent demo cut: title cards + captured scenes + burned-in captions + an .srt for the voiceover."""
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

# (kind, name, seconds or (start, end) in raw, [(offset, length, caption)])
PLAN = [
    ("card", "intro", 10, "Chennai floods: how deep is this street?", "[ INSERT your real Chennai flood footage here ]",
     [(0.5, 9, "In Chennai, everyone shares flood photos. Nobody can tell how deep the water is.")]),
    ("clip", "live", (1.0, sc["report-tab"]), None, None,
     [(0.5, 11, "Vellam is a flood early-warning system. Reports become a live map and area alerts for the people nearby.")]),
    ("clip", "verified", (sc["run-verified"], sc["after-verified"]), None, None,
     [(1, 8, "Upload a photo. SAM 3.1 outlines the water and the wheels, and geometry turns the waterline into centimetres."),
      (9.5, 9.5, "Muse Spark independently checks it is a real flood and estimates depth. Both readings are shown, with their uncertainty.")]),
    ("clip", "review", (sc["run-review"], sc["after-review"]), None, None,
     [(1, 14, "When the two methods disagree, the report goes to review instead of the map. Wrong depths are worse than none.")]),
    ("clip", "rejected", (sc["run-rejected"], sc["after-rejected"]), None, None,
     [(1, 9, "Not a flood? It is rejected, with the reason. Duplicates, stale photos and wrong locations are caught too.")]),
    ("card", "ask", 14, "Ask in Tamil or English", "[ RECORD with a live API key: Tamil voice question and spoken answer ]",
     [(0.5, 13, "Ask by voice. Muse Voice Transcribe and Muse Spark answer from the live map: is this road flooded?")]),
    ("clip", "benchmark", (sc["benchmark"], sc["end"]), None, None,
     [(0.5, 7, "We tested on 100 real public photos. Muse Spark ranks depth well: rank correlation 0.89."),
      (7.5, 7, "The strict check was losing real floods, so we fixed it: 33% rejected down to 1% on photos it had never seen. Wheel geometry is weaker, and we show that.")]),
    ("card", "field", 14, "Field test", "[ INSERT: tape-measure photos and the measured error from eval/accuracy.py ]",
     [(0.5, 13, "And we measured it in the real world, in Chennai, with a tape measure.")]),
    ("card", "end", 8, "Vellam Map", "github.com/Itz-mehanth/vellam-map   .   open source (MIT)",
     [(0.5, 7, "Open source. Built with SAM 3.1, Muse Spark and Muse Voice Transcribe.")]),
]


def run(*a, cwd=None):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True, cwd=cwd)


def esc(t):
    return t.replace("'", "’").replace(":", "\\:")


parts, srt, cursor = [], [], 0.0


def ts(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


n = 0
for kind, name, span, title, sub, caps in PLAN:
    f = OUT / f"{n:02d}_{name}.mp4"
    if kind == "card":
        dur = span
        vf = (f"drawtext=fontfile='{FONTB}':text='{esc(title)}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2-40,"
              f"drawtext=fontfile='{FONT}':text='{esc(sub)}':fontcolor=0xa2aab1:fontsize=26:x=(w-text_w)/2:y=(h/2)+30")
        run("-f", "lavfi", "-i", f"color=c=0x0d1b26:s=1280x720:r=30:d={dur}", "-vf", vf, "-pix_fmt", "yuv420p", str(f))
    else:
        a, b = span
        dur = b - a
        run("-ss", str(a), "-t", str(dur), "-i", str(RAW), "-vf", "fps=30,scale=1280:720", "-pix_fmt", "yuv420p", "-an", str(f))
    for off, length, text in caps:
        srt.append((cursor + off, cursor + min(off + length, dur - 0.2), text))
    parts.append(f)
    cursor += dur
    n += 1

lst = OUT / "list.txt"
lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
run("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(OUT / "joined.mp4"))
srt_text = "".join(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n\n" for i, (s, e, t) in enumerate(srt, 1))
(OUT / "captions.srt").write_text(srt_text, encoding="utf-8")
style = "FontName=Segoe UI Semibold,FontSize=17,PrimaryColour=&HFFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=26,Alignment=2"
run("-i", "joined.mp4", "-vf", f"subtitles=captions.srt:force_style='{style}'", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "demo_silent.mp4", cwd=OUT)
print(f"total {cursor:.0f}s, {len(srt)} captions -> {OUT / 'demo_silent.mp4'}")
