# Vellam Map: plan and status

Hackathon deadline: **Nov 4, 2026, 9 PM ET**.

## Status

| Area | What | Status |
|---|---|---|
| Measure | Photo upload with GPS, SAM 3.1 water and wheel segmentation | Done |
| Measure | Circle-fit depth with uncertainty, inverse-variance fusion | Done |
| Measure | Visual-estimate fallback when no wheel is usable | Done |
| Verify | Muse Spark flood check, perceptual-hash duplicates, EXIF age and location | Done |
| Verify | Geometry vs visual cross-check, review status on disagreement | Done |
| Evidence | Stored photo and SAM overlay per report, shown beside the reading | Done |
| Privacy | Faces and number plates blurred by SAM 3.1 before storage, fail-closed | Done |
| Map | Depth-number pins, area alerts with share, situation summary | Done |
| Map | Base maps (streets, satellite, terrain), overlays (rain radar, traffic with a key, alert zones) | Done |
| Voice | Tamil and English questions, grounded answers with sources, location-aware | Done |
| Product | Live streamed pipeline UI, 19 licensed sample photos, installable PWA, mobile layout | Done |
| Quality | 42 tests including synthetic-wheel depth validation, ruff, oxlint, CI | Done |
| Hosting | Docker, Render and Vercel configuration (optional; see DEPLOY.md) | Ready, not deployed |
| Accuracy | Benchmark on 100 public real photos with depth levels, with a Benchmark tab and replay (docs/BENCHMARK.md) | Done: by-eye estimate strong, wheel geometry weak, gate fixed: rejected 33%, now 1% of real floods on held-out photos |



## Demo script (3 minutes)

1. **Hook (15 s):** Chennai 2015 and 2023. "Everyone had photos. Nobody had depths."
2. **Measure (60 s):** Report tab, pick `Car stuck, Brisbane`. Narrate the survey log: water mask, wheel masks,
   circle fit and waterline, fusion, verification, the reading on the staff gauge with its uncertainty.
3. **Trust (25 s):** run the dry-road control (`Control: dry road, Chennai`); it is rejected. Mention the review
   status when geometry and the visual check disagree.
4. **Evidence and map (30 s):** open a report from the map: the photo beside the analysis, the wheel tiles.
   Switch to satellite, turn on rain radar. Click an alert.
5. **Voice (40 s):** ask in Tamil; show the answer and the sources it cites.
6. **Honesty (15 s):** the "visual guess" label and the review flag; state the measured accuracy if available.
7. **Close (15 s):** "Built in Chennai. Works in any flooded city."

Say clearly that the demo-map reports are seeded placeholders (they are labelled "demo" in the app).
Re-run `python seed_demo.py` just before filming so the reports read as recent.

## Submission checklist

- [ ] Public GitHub repository
- [ ] Demo video, showing only work built during the hackathon
- [ ] Team members listed
- [ ] Measured accuracy added to the README, if available
- [ ] Anything the official rules require (live URL, form fields): the submission page did not list these when
      checked, and the full rules were to be published separately, so read them
- [ ] Submitted at https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit before the deadline

## Ideas not built

- **Offline report queue:** store photos in IndexedDB without signal and send when it returns. Floods break connectivity.
- **WhatsApp or SMS bot:** most flood photos already circulate on WhatsApp; a bot would meet people there.
- **Authority view:** a read-only dashboard with CSV and GeoJSON export for control rooms and rescue teams.
- **Rainfall and gauge data** fused with depth reports to predict which streets flood next.
- **Calibration set:** photos with a person of known height, to learn the real error per object type.
- **Video reports:** track the waterline rising over time.
- **Tamil UI strings**, not only Tamil voice.
- **Safer-route suggestions** on OSM routing. For now the agent mentions nearby shallower reports.
- **Open-weights path** with a smaller model on Modal.
