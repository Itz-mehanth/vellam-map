# Benchmark on real photos with ground-truth depth levels

The first evidence about how well Vellam estimates depth on real photos it was not built around. It is a
modest run and it is reported as it came out, including the parts that do not flatter the project.

## Setup

- **Data:** the test split of [STURM-FloodDepth Flooded Cars](https://zenodo.org/records/14833532)
  (CC BY 4.0): real street-level photos of submerged cars, each labelled with one of five depth *levels* by
  water height against the car's own features. Level 0 has the car out of the water, Level 3 is water up to the
  windows, Level 4 is nearly submerged.
- **Sample:** 20 photos per level, 100 in total, fixed random seed 7. An earlier 50-photo run (10 per level, same
  seed) gave nearly identical headline numbers, which is some reassurance the results are stable.
- **Pipeline:** the real one, through `analyse()`, with the place lookup skipped (`benchmark=True`). Reproduce
  with `python -u eval/benchmark_flooded_cars.py --per-level 20`.
- **Metrics:** the labels are ordered levels, not centimetres, so we report rank correlation (Spearman) of
  predicted depth against the true level, and how often the predicted level is the true one or within one
  level. Depth is turned into a level with thresholds we chose from car geometry (10, 35, 70, 110 cm). Rank
  correlation does not depend on those thresholds; the "same level" percentages do.
- **In the app:** the **Benchmark** tab shows these results as charts and lets you open any photo and replay its
  recorded pipeline, intermediate images included, with no API call.

## Results (100 photos)

| | Muse Spark by-eye estimate | Wheel geometry |
|---|---|---|
| Photos with a reading | 69 of 100 (65 of the 80 flooded ones) | 12 of 100 |
| Spearman rank correlation | **0.89** | 0.54 (over those 12) |
| Same level as truth | 54% | 25% |
| Within one level of truth | **99%** | 83% |
| Median depth rises with level | yes | yes, but only L0 to L2 have readings |

Median by-eye depth by true level: L0 7 cm, L1 18 cm, L2 23 cm, L3 75 cm, L4 105 cm.
Median geometry reading: L0 3 cm, L1 6 cm, L2 14 cm (none at L3 or L4).
Combining them (geometry where it exists, else by-eye): rank correlation 0.87, within one level 96%.

Of the 7 photos where both methods produced a reading, 6 were within one level of each other.

### The verification gate (found a problem, then fixed it)

In the 100-photo run the original gate (a strict yes/no "is this a flood?") correctly rejected 19 of 20 Level 0
cars, but it also **wrongly rejected 16 of 80 genuinely flooded photos (20%)**. A wrongly rejected flood is a
lost report. The recorded reasons showed what was going on: 7 were "too blurry, dark or cropped to confirm"
(including cars nearly submerged) and 9 were "just a splash or shallow water" (Level 1 and 2 floods are shallow
by definition). My first guess, that the "looks staged or stock" check was to blame, was wrong: it caused 1 of 16.

**The fix:** the gate now grades its evidence, as `clear`, `possible` or `none`. Only `none` is rejected;
`possible` is published but flagged **unconfirmed**. Uncertainty is no longer treated as a "no".

**How it was tested, so the result is not just fitted to the photos it was tuned on:**
- *Level 0 is not a fair "should reject" class.* Those photos are mostly wet roads, muddy shallow water and
  spray, not dry scenes, so a model calling them "possible" is arguably right. Using them as negatives would have
  tuned the gate on noise. The negatives are 21 real non-flood photos from Wikimedia Commons instead (wet roads
  and rain, car washes, pools, a wet garage floor, dry streets and car parks), listed with licences in
  `eval/negatives_manifest.json` and fetched by `eval/fetch_negatives.py`.
- *Two disjoint sets.* The prompt was tuned on the 100 development photos plus 11 of the negatives, then
  measured once on 70 new flooded photos and the other 10 negatives that it had never seen.
- *One call per photo, no SAM,* so each run is cheap (`eval/gate_benchmark.py`).

| Held-out photos | Original gate | New gate |
|---|---|---|
| Real floods rejected (lost reports) | 23 of 70 (**33%**) | **1 of 70 (1%)** |
| Real floods published but flagged unconfirmed | 0 | 24 of 70 (34%) |
| Non-floods accepted outright | 0 of 10 | 0 of 10 |
| Non-floods shown as unconfirmed | 0 | 1 of 10 |
| Non-floods rejected | 10 of 10 | 9 of 10 |
| By-eye depth ranking on real floods | 0.85 (51 photos) | **0.90** (45 photos) |

The development set told the same story (22% rejected before, 1% after). The one non-flood shown as
unconfirmed is a wheel throwing spray on a wet road, which is genuinely ambiguous.

**Costs of the change, stated plainly:**
- About a third of real floods now appear as *unconfirmed* instead of confirmed: the model would not commit to
  clear flooding from a blurry or shallow-water photo.
- A photo marked "possible" gets **no by-eye depth** (every "clear" photo kept its depth: 50 of 55). That is a
  deliberate rule, since we do not invent a depth when the flooding itself is uncertain, but it means fewer
  depth readings overall (45 against 51 held-out photos).
- The negative set is small (21 photos), so the false-alarm rates are rough: 0 of 10 accepted outright could
  be a real rate anywhere from 0% to about 30%.

## What it shows

1. **Muse Spark's by-eye estimate ranks depth well** on real photos: rank correlation 0.89, and 99 of every 100
   predictions within one level. Over two runs of different size the figures were almost the same, so they are
   stable. It is the dependable estimate on this data.
2. **Wheel geometry is not reliable on this data.** It read only 12 of 100 photos. Its readings are
   systematically **low**: all 8 readings on Levels 1 and 2 (3.7 to 21 cm) are below the range those levels
   imply. We have not established why. A likely factor is that a wheel is only measurable while the water is
   *below the top of the tyre*, and the waterline we measure may sit lower than the water around the car.
3. **By-eye estimates also lean a level low under our thresholds.** The confusion matrix puts 10 of 15 Level 2
   predictions at Level 1, and 7 of 17 Level 3 at Level 2. Either the model under-reads depth or our thresholds
   are too high; rank correlation is unaffected, so ordering is trustworthy while absolute centimetres are not
   yet.
4. **The benchmark found real bugs.** Before a fix, a badly fitted circle produced readings of 203, 402 and
   614 cm from a wheel about 60 cm tall; a reading can no longer exceed the wheel's own height (three tests
   guard it). SQLite connections were never closed, which crashed the first run on a Windows file lock and
   would leak handles in a long-running server (fixed).

## Limits of this evidence

- **100 photos, one seed.** Enough for a first read, not for a published claim.
- **Ordered levels, not centimetres.** Nothing here measures centimetre error. That needs photos with
  tape-measured depths (`eval/accuracy.py`).
- **Tight, upscaled crops.** The dataset crops each photo around the car, which leaves wheel geometry less of
  the scene than a phone photo would. Its coverage here is probably a floor; we have not tested it on full
  scenes with known depth.
- **Our thresholds.** The depth-to-level cut-offs are an assumption, and the "same level" figures depend on them.
- **Visual estimates are model judgement.** Their strength here shows the model reads car-and-water scenes
  well. It does not show they are accurate to the centimetre.

## What we do with it

The product already treats the two estimates as independent checks: geometry is cross-checked against the
visual range, and a large disagreement sends the report to review instead of publishing it. The benchmark
supports keeping that design and labelling by-eye estimates plainly as estimates. It also argues against
presenting wheel geometry as the proven part of the system, and led to the gate change above.

Raw per-photo results are in [`eval/results/`](../eval/results/).

## Tried and not shipped: the car body as a ruler

Wheel geometry reads nothing on deep floods (Levels 3 and 4), because the wheels are under water. We tested whether
the visible part of the car could stand in: SAM 3.1 outlines the largest car, and the feature is the car's visible
height divided by its width (`eval/vehicle_probe.py`, results in `eval/results/vehicle_probe.json`).

- The car outline was found on 93 of the 100 photos.
- The median ratio does fall as the level rises (0.72, 0.66, 0.57, 0.48, 0.39 for Levels 0 to 4).
- But the signal is weak and noisy: Spearman -0.40 against the true level, and between neighbouring levels the
  deeper photo has the smaller ratio in only 57% to 61% of pairs (50% is chance). At Levels 3 against 4 it is 59%.
- It is also confounded by the angle the car is photographed from (a car seen side-on is more than twice as wide as
  one seen from the front), so it could not become a centimetre estimate even with a better feature.

So it is not used. Muse Spark's by-eye depth (rank correlation 0.89) remains the dependable estimate for deep water.
A better version would need the viewing angle or a known-size marker such as the number plate, and photos with
measured depths to test it on.
