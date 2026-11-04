# Demo film tooling

The three-minute demo film is built from code so every number on screen can be traced to a real run. Rendered
videos and audio are not committed; they are regenerated with the steps below.

| Path | What it is |
|---|---|
| `video/` | The film: a [Remotion](https://www.remotion.dev) project, 1920x1080, 30 fps, 180 s. `src/scenes/` holds the ten scenes. |
| `video/public/photos/` | Stage images and numbers read from recorded pipeline runs (`backend/replays/`), not typed by hand. |
| `video/public/bench.json` | The 100-photo benchmark summary the film's charts draw. |
| `video/public/stills/` | Real Chennai flood photographs from Wikimedia Commons. Authors and licences: `video/public/STILLS_SOURCES.md`. |
| `capture.py` | Records the real app (replay mode) with Playwright, for the screen-capture scenes. |
| `audio2.py` | Synthesizes the score and sound cues (stereo) and mixes them under the film. |
| `ambience/SOURCES.txt` | Source of the rain and traffic recording used in the opening (CC0). |

## Rebuild

```bash
# 1. the app capture used in scene 3 (needs the app running in replay mode: REPLAY=1 on the backend)
python demo/capture.py out_folder          # then trim to demo/video/public/footage/app.mp4 with ffmpeg

# 2. render the film
cd demo/video && npm install && npx remotion render src/index.ts Film out/film.mp4

# 3. fetch the rain recording (see ambience/SOURCES.txt) to demo/ambience/rain_street.wav, then mix the audio
python demo/audio2.py full demo/video/out/film.mp4 demo/audio_out2
```

The Tamil voice scene uses a screen recording of the real app. Nothing on screen is invented: every number comes
from a recorded run or the benchmark.
