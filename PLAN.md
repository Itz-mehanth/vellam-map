# Vellam Map — Project Plan

Deadline: **Nov 4, 2026, 9 PM ET**. Status as of Oct 28.

## Status

| # | Work item | Priority | Status |
|---|---|---|---|
| 1 | Photo upload with GPS | P0 | Done |
| 2 | SAM 3.1 water and wheel segmentation | P0 | Done |
| 3 | Circle-fit depth, uncertainty, inverse-variance fusion | P0 | Done |
| 4 | Report verification (Muse Spark, pHash duplicates) | P0 | Done |
| 5 | Geometry vs visual cross-check, visual-estimate fallback | P0 | Done |
| 6 | Live pipeline UI (streamed stages) and map | P0 | Done |
| 7 | Sample photos (Wikimedia Commons, licensed) | P0 | Done |
| 8 | Voice Q&A in Tamil and English (Voice Transcribe + Muse Spark) | P1 | Done |
| 9 | Area alerts from report clusters | P1 | Done |
| 10 | Place names for reports (reverse geocoding) | P1 | Done |
| 11 | Mobile layout and polish | P1 | Done |
| 12 | Demo seed data (clearly labelled as demo) | P1 | Done |
| 13 | Deployment config (Docker, Render, Vercel) | P0 | Config done, **deploy needs your accounts** |
| 14 | Accuracy evaluation script | P0 | Script done, **needs real photos with known depths** |
| 15 | README final, demo script | P0 | Done, **video is yours to record** |
| 16 | Safer-route suggestion (OSM routing) | P2 | Cut: the Q&A agent suggests nearby lower-depth reports instead |
| 17 | Video report (rising waterline) | P2 | Cut |
| 18 | Open-weights path | P2 | Cut |
| 19 | Face and plate blurring | Safety | Not built. Photos are not stored, only hashes and results |

## Remaining for you

1. **Accuracy check** once you have photos with real depths: put them in `eval/photos/`, fill `eval/photos/depths.csv`, run `backend/.venv/Scripts/python eval/accuracy.py`. The go/no-go bar is a mean error under 15 cm.
2. **Deploy**: backend on Render (`render.yaml`), frontend on Vercel (`frontend/vercel.json`, set `VITE_API_BASE`). Add `META_API_KEY` as a secret on Render.
3. **Seed the demo map** on the deployed backend just before recording: `python seed_demo.py`.
4. **Record the 3-minute demo video** following the script in the README, and submit.

## Cut rule

If time runs short, never cut the deployment, the accuracy number or the demo video.
