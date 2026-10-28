# 🌊 Vellam Map

**Photograph a flooded street. Know how deep the water is. Warn everyone nearby — in their own language.**

Built for the **Meta Global AI Developer Hackathon** (Indie Developer track, theme: *Build for Your World*) with **SAM 3.1**, **Muse Spark** and **Muse Voice Transcribe** via the Meta Model API.

---

## 1. The Problem

- **1.81 billion people** (23% of the world) are directly exposed to serious flood risk; 89% live in low- and middle-income countries ([World Bank](https://blogs.worldbank.org/en/climatechange/flood-risk-already-affects-181-billion-people-climate-change-and-unplanned)).
- Chennai: ~290 dead in the 2015 floods; 17 dead in Cyclone Michaung (2023), mostly from electrocution and wall collapse in waterlogged streets. Close to 500 mm of rain fell in a day.
- During a flood, nobody knows **how deep the water is on which street**. People post photos on WhatsApp and X, but photos aren't data: rescuers, drivers and residents can't tell whether a road is 10 cm or 1 m under water.
- Research shows depth *can* be read from photos using objects of known size (e.g. FloodVision, 2025: ~8 cm mean error on crowdsourced images) — but **no public tool does this**. It lives in papers.

## 2. The Solution

1. **Report** — anyone photographs a flooded street; location is attached.
2. **Measure** — **SAM 3.1** segments the water surface and partly-submerged reference objects (car / auto / bike / bus wheels, kerbs, people). Our geometry code recovers each object's hidden part and converts the waterline to **centimetres** (see §4).
3. **Verify** — a **Muse Spark** agent checks every report: is this a real flood, is it a reused / old / duplicate photo, does it agree with nearby reports?
4. **Map** — verified depths appear on a live street map, colour-coded by danger.
5. **Warn & answer** — residents ask by voice in **Tamil or English** (**Muse Voice Transcribe**): *"Is Velachery main road passable by bike?"* — the agent answers from the live map and suggests a safer route.

## 3. Features (MVP → Stretch)

| Priority | Feature | Meta tool |
|---|---|---|
| **P0** | Upload / capture photo with GPS | — |
| **P0** | Segment water + reference objects, show mask overlay | SAM 3.1 |
| **P0** | Depth estimate in cm with uncertainty (wheel-circle geometry + fusion) | SAM 3.1 + our code |
| **P0** | Live map of verified reports | — |
| **P0** | Report verification (real flood? duplicate? stale?) | Muse Spark |
| **P1** | Voice Q&A in Tamil / English grounded in the map | Voice Transcribe + Muse Spark |
| **P1** | Area alerts ("water rising on X road") from report clusters | Muse Spark agent |
| **P2** | Safer-route suggestion avoiding deep segments | Muse Spark + OSM |
| **P2** | Video report: track the waterline rising over time | SAM 3.1 (video) |
| **P2** | Open-weights path (Muse Glimmer / Spark Open on Modal) | Bonus prize |

## 4. How depth is measured (the technical core)

A wheel is a circle of known size. SAM 3.1 gives us only the **visible** rim above water and the water surface. We **fit a circle** to the visible rim to recover the whole wheel, including the submerged part:

```
depth_cm = (wheel_bottom_y − waterline_y) × (wheel_diameter_cm / wheel_diameter_px)
```

- Reference sizes live in `data/reference_objects.json` (with min/max ranges per vehicle class).
- Each object gives an estimate **with uncertainty**; estimates are fused by inverse-variance weighting.
- Objects without a clean geometric fit (people, kerbs) fall back to Muse Spark's judgment with wider uncertainty.
- Implemented in `backend/services/depth.py`.

## 5. Architecture

```
 ┌──────────────────────────┐
 │ Frontend (React + Vite)  │ camera/upload, mask overlay, live map (Leaflet), voice
 └────────────┬─────────────┘
              │ REST
 ┌────────────▼─────────────┐
 │ Backend (FastAPI)        │
 │ POST /api/reports ─► SAM 3.1 masks ─► depth.py ─► Muse Spark verify ─► store
 │ GET  /api/map     ─► verified reports as GeoJSON
 │ POST /api/ask     ─► Voice Transcribe ─► Muse Spark agent (map as context)
 └────────────┬─────────────┘
 ┌────────────▼─────────────┐
 │ SQLite: reports, depths  │
 └──────────────────────────┘
```

## 6. Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind, Leaflet (OpenStreetMap tiles), TanStack Query
- **Backend:** Python 3.12 + FastAPI, httpx, NumPy, Pillow, imagehash (duplicate detection), SQLite
- **Meta models:** SAM 3.1, Muse Spark, Muse Voice Transcribe (Meta Model API)
- **Deploy:** Frontend on Vercel, backend on Render/Railway

> ⚠️ **Day 1:** confirm API endpoints, model IDs, pricing and whether SAM 3.1 accepts text prompts and video. `backend/services/meta_client.py` is a stub until then.

## 7. Folder Structure

```
├── frontend/              # React app
├── backend/
│   ├── main.py            # FastAPI routes
│   ├── services/
│   │   ├── meta_client.py # SAM 3.1, Muse Spark, Voice Transcribe
│   │   └── depth.py       # circle fit, depth, fusion
│   ├── requirements.txt
│   └── .env.example
├── data/
│   └── reference_objects.json
└── eval/                  # test photos with known depths + accuracy script
```

## 8. Build Plan (Oct 28 → Nov 4, 9 PM ET)

| Day | Goal | Done when… |
|---|---|---|
| **Oct 28** | Setup + API check | Credits active; one call each to SAM 3.1, Muse Spark, Voice Transcribe |
| **Oct 29** | **Go / no-go test** | 20 photos with known depth → mean error **< 15 cm**, else rethink |
| **Oct 30** | Report pipeline | `/api/reports` returns masks + depth; overlay shown in UI |
| **Oct 31** | Map + verification | Live map; Muse Spark rejects fake/duplicate photos |
| **Nov 1** | Voice Q&A | Tamil question → grounded answer |
| **Nov 2** | Alerts + polish | Mobile layout, loading states, area alerts |
| **Nov 3** | Deploy + field test | Live URL on phone; real/staged flood photos tested |
| **Nov 4** | Video + submit | 3-min demo video; README final; submitted before 9 PM ET |

**Rule:** if a day slips, cut P2 — never cut the eval, deployment or demo video.

## 9. Judging Criteria → Our Angle

| Criterion | Weight | Angle |
|---|---|---|
| Impact | 30% | Life-safety data during floods; 1.81 B exposed; works in any language/city |
| Meta tooling | 25% | SAM 3.1 open-vocabulary masks *measured* geometrically, Muse Spark as verifying agent, voice in Tamil |
| Technical depth | 20% | Circle-fit depth recovery, uncertainty fusion, measured accuracy on a test set |
| Demo | 25% | Photo → mask → "62 cm" → map turns red → Tamil voice warning |

## 10. Demo Script (3 min)

1. **Hook (15s):** Chennai 2015 / 2023 footage — "Everyone had photos. Nobody had depths."
2. **Report (45s):** photo of a flooded street → SAM 3.1 masks the water and wheels → "~60 cm ± 6".
3. **Map (30s):** reports across the city light up; a fake/reused photo is rejected.
4. **Voice (40s):** Tamil question about a road → spoken answer + safer route.
5. **Accuracy (25s):** our test results vs. measured depths.
6. **Close (25s):** "Built in Chennai. Works in any flooded city."

## 11. Safety & Responsibility

- Depths are shown **with uncertainty** and labelled as estimates; low-confidence reports are flagged, not hidden.
- The app never says a road is "safe" — only estimated depth and age of the latest report.
- Faces and number plates are blurred before storage; photos are not shared publicly.

## 12. Getting Started

```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # add your Meta API key
uvicorn main:app --reload

# frontend
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :8000)
```

## 13. Submission Checklist

- [ ] Public GitHub repo
- [ ] Live deployed URL
- [ ] 3-minute demo video showing only work built during the hackathon
- [ ] Team members listed
- [ ] Submitted at https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit by **Nov 4, 9:00 PM ET**

---

*Depth estimates are approximate. Always follow official flood warnings.*
