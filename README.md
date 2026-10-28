# 🌊 Vellam Map

**Photograph a flooded street. Know how deep the water is. Warn everyone nearby, in their own language.**

Built for the **Meta Global AI Developer Hackathon** (Indie Developer track, theme: *Build for Your World*) with **SAM 3.1**, **Muse Spark** and **Muse Voice Transcribe** via the Meta Model API.

Project plan and status: [PLAN.md](PLAN.md)

---

## 1. The Problem

- **1.81 billion people** (23% of the world) are directly exposed to serious flood risk; 89% live in low- and middle-income countries ([World Bank](https://blogs.worldbank.org/en/climatechange/flood-risk-already-affects-181-billion-people-climate-change-and-unplanned)).
- Chennai: about 290 dead in the 2015 floods; 17 dead in Cyclone Michaung (2023), mostly from electrocution and wall collapse in waterlogged streets.
- During a flood, nobody knows **how deep the water is on which street**. People post photos on WhatsApp and X, but photos aren't data: rescuers, drivers and residents can't tell whether a road is 10 cm or 1 m under water.
- Research shows depth *can* be read from photos using objects of known size (e.g. FloodVision, 2025), but **no public tool does this**. It lives in papers.

## 2. What it does

1. **Report**: anyone photographs a flooded street; location is attached.
2. **Measure**: **SAM 3.1** segments the water and the wheels of vehicles. Geometry code recovers each wheel's hidden lower part and converts the waterline to **centimetres** (see §4).
3. **Verify**: **Muse Spark** checks every report (real flood, not a puddle or splash, original photo) and gives an independent by-eye depth range. The geometric depth is cross-checked against it; a big disagreement sends the report to review instead of publishing it. Duplicate photos are caught by perceptual hash, and photo metadata is checked: a photo taken more than 3 days ago is rejected, and one geotagged far from the reported location goes to review (missing metadata counts as unknown, never as a failure).
4. **Map and alerts**: reports appear on a live map colour-coded by depth, and nearby reports are grouped into **area alerts**.
5. **Ask by voice**: residents ask in **Tamil or English** (**Muse Voice Transcribe**), for example *"Is Velachery main road passable by bike?"*, and the agent answers from the live reports, in the same language, citing the reports it used.

The Analyse tab shows the whole pipeline live, stage by stage, with the real intermediate results: masks, the fitted wheel circle and waterline, the fusion of estimates, and the verification checks.

## 3. Features

| Priority | Feature | Status |
|---|---|---|
| P0 | Photo upload with GPS | Done |
| P0 | SAM 3.1 water and wheel segmentation with overlay | Done |
| P0 | Depth in cm with uncertainty (circle fit and inverse-variance fusion) | Done |
| P0 | Live map of reports | Done |
| P0 | Verification: real flood, duplicate, original photo, geometry vs visual cross-check | Done |
| P1 | Voice Q&A in Tamil and English, grounded in the map | Done |
| P1 | Area alerts from report clusters | Done |
| P1 | Place names for reports (OpenStreetMap Nominatim) | Done |
| P2 | Safer-route suggestion | Cut. The agent mentions nearby shallower reports instead |
| P2 | Video report (rising waterline) | Cut |
| P2 | Open-weights path | Cut |

## 4. How depth is measured

A wheel is a circle of known size. SAM 3.1 gives the **visible** rim above water and the water surface. We **fit a circle** to the visible rim to recover the whole wheel, including the submerged part:

```
depth_cm = (wheel_bottom_y − waterline_y) × (wheel_diameter_cm / wheel_diameter_px)
```

- Reference sizes live in `data/reference_objects.json`, with min/max ranges.
- Each wheel gives an estimate **with uncertainty** (wheel-size spread plus about 3 px of waterline error); estimates are fused by inverse-variance weighting.
- A wheel is skipped when the water doesn't touch it, too little rim is visible, or the circle fit is implausible. The UI says why.
- When no wheel can be measured, the report falls back to Muse Spark's by-eye range, clearly labelled "visual guess, low confidence".

### Known limits

- **Geometry needs a wheel that is partly under water**, with the waterline crossing the tyre. Many flood photos have wheels fully hidden, so they get only a visual guess.
- **Spray and reflections can fool the waterline.** The cross-check against the visual range catches large disagreements; it can't catch every error.
- **Accuracy has not been measured yet.** It needs photos with independently measured depths. `eval/accuracy.py` runs the go/no-go test (bar: mean error under 15 cm) as soon as such photos exist. Until then, treat depths as unvalidated estimates.
- **Speech-to-text garbles place names**; the agent matches them phonetically to known places and says which one it assumed.
- Faces and number plates are not blurred. Photos are not stored: only a perceptual hash, the depth and the verification result are kept.

## 5. Architecture

```
 ┌──────────────────────────────┐
 │ Frontend (React + Vite)      │ Analyse (live pipeline) · Ask (voice) · Live map + alerts
 └───────────────┬──────────────┘
                 │ REST / NDJSON stream
 ┌───────────────▼──────────────┐
 │ Backend (FastAPI)            │
 │ POST /api/reports/stream     │ intake → SAM water → SAM wheels → circle fit → fusion
 │                              │   → Muse Spark verify (parallel) → decide → store
 │ GET  /api/map  /api/alerts   │ reports as GeoJSON · clustered area alerts
 │ POST /api/ask                │ Voice Transcribe → Muse Spark agent (reports as context)
 └───────────────┬──────────────┘
 ┌───────────────▼──────────────┐
 │ SQLite: reports              │
 └──────────────────────────────┘
```

## 6. Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind, Leaflet (OpenStreetMap), TanStack Query
- **Backend:** Python 3.12, FastAPI, httpx, NumPy, Pillow, imagehash, SQLite
- **Meta models:** SAM 3.1, Muse Spark, Muse Voice Transcribe (Meta Model API)

## 7. Folder structure

```
├── frontend/              React app (src/components: Stages, Ask, MapView)
├── backend/
│   ├── main.py            routes
│   ├── seed_demo.py       labelled demo reports for filming
│   ├── Dockerfile
│   └── services/
│       ├── meta_client.py SAM 3.1, Muse Spark, Voice Transcribe
│       ├── pipeline.py    streamed stages: masks → geometry → fusion → decision
│       ├── depth.py       circle fit, depth, fusion
│       ├── verify.py      duplicate hash + Muse Spark flood check
│       ├── agent.py       Q&A grounded in reports
│       ├── alerts.py      clustering into area alerts
│       ├── geo.py         reverse geocoding, distances
│       └── store.py       SQLite
├── data/reference_objects.json
├── eval/                  accuracy.py, measure.py, overlay.py, smoke_test.py
├── render.yaml            API deployment (Render)
└── PLAN.md
```

## 8. Run it locally

```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # add META_API_KEY
uvicorn main:app --reload

# frontend (new terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173, proxies /api to :8000
```

Optional: `python seed_demo.py` (from `backend/`) fills the map with demo reports around Chennai. They are flagged as demo data in the database and UI. Remove them with `python seed_demo.py --clear`. Re-run it just before filming so the reports are recent.

## 9. Deploy

**API on Render**: create a Blueprint from `render.yaml`. Set `META_API_KEY` (secret) and `CORS_ORIGINS` (your Vercel URL). The persistent disk keeps SQLite across deploys; without a paid disk, reports reset when the service restarts.

**Frontend on Vercel**: root directory `frontend`, set `VITE_API_BASE` to the Render URL (no trailing slash).

Microphone capture needs HTTPS, which both hosts provide.

## 10. Tests and quality

```bash
cd backend && python -m pytest -q     # 25 tests, no network or API key needed
```

- **Depth maths is validated on synthetic wheels** with known depth (recovered within 0.5 cm, and within a few cm under 1 px of noise).
- Also covered: fusion weighting, decision rules, EXIF checks, rate limiting, alert clustering, and that rejected reports never reach alerts or answers.
- CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend build on every push.
- Production guards: 12 MB upload limit, pixel cap, per-client rate limits on reports and questions (they cost API calls), input validation, reports expire from the map after 72 h and fade as they age, and `DELETE /api/reports/{id}` for moderation (needs `ADMIN_TOKEN`).
- The app is installable as a PWA and opens offline; live depths are never cached.

## 11. Accuracy test

```bash
# put photos in eval/photos/ and list true depths (see eval/depths.example.csv)
backend/.venv/Scripts/python -u eval/accuracy.py
```

Prints geometric and visual error per photo, the mean absolute error of each, and GO / NO-GO against 15 cm. Record the result here once measured: **not yet measured**. (The synthetic tests in §10 validate the maths; they do not validate SAM's masks on real photos.)

## 12. Demo script (3 min)

1. **Hook (15 s):** Chennai 2015 / 2023. "Everyone had photos. Nobody had depths."
2. **Report (60 s):** Analyse tab, pick a sample with a visible wheel (the Brisbane car, `s05`). Narrate the stages: water mask, wheel mask, circle fit and waterline, fusion, verification, result with uncertainty.
3. **Trust (20 s):** run the dry-road control (`s19`) and a duplicate; both are rejected.
4. **Map and alerts (30 s):** Live map with demo reports; click an alert to fly to the area.
5. **Voice (40 s):** ask in Tamil, hear and read the answer, with the reports it cites.
6. **Honesty (15 s):** the visual-guess label and the review flag; state the measured accuracy once known.
7. **Close (20 s):** "Built in Chennai. Works in any flooded city."

Say clearly in the video that demo-map reports are seeded placeholders.

## 13. Safety and responsibility

- Depths are shown **with uncertainty** and labelled as estimates; by-eye guesses and review cases are marked, not hidden.
- The app never says a road is "safe", and neither does the Q&A agent. Always follow official flood warnings.
- Photos are not stored or shared; only a perceptual hash, the depth and the verification result are kept. Face and plate blurring is not implemented.

## 14. Submission checklist

- [ ] Public GitHub repo
- [ ] Live deployed URL
- [ ] 3-minute demo video showing only work built during the hackathon
- [ ] Team members listed
- [ ] Measured accuracy added to §11
- [ ] Submitted at https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit by **Nov 4, 9:00 PM ET**

---

*Depth estimates are approximate. Always follow official flood warnings.*
