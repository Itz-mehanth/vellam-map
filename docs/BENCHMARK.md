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

### The verification gate

| | Result |
|---|---|
| Dry cars (Level 0) correctly rejected as "not a flood" | 19 of 20 |
| **Flooded cars (Levels 1 to 4) wrongly rejected as "not a flood"** | **16 of 80 (20%)** |

A wrongly rejected flood is a lost report, so this matters. The dataset's photos are upscaled news-style crops,
which may look "staged or stock" to the checker more than a phone photo would; we have not tested that
explanation. One photo was flagged as a duplicate, an artefact of running the 100 photos concurrently against
one scratch database.

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
presenting wheel geometry as the proven part of the system, and says the verification gate needs tuning so it
stops discarding real floods.

Raw per-photo results are in [`eval/results/`](../eval/results/).
