# Benchmark on real photos with ground-truth depth levels

This is the first evidence about how well Vellam estimates depth on real photos it was not built around.
It is a small run and it is reported as it came out, including the parts that do not flatter the project.

## Setup

- **Data:** the test split of [STURM-FloodDepth Flooded Cars](https://zenodo.org/records/14833532)
  (CC BY 4.0): real street-level photos of submerged cars, each labelled with one of five depth *levels* by
  water height against the car's own features. Level 0 has the wheels clear of the water, Level 3 is water up
  to the windows, Level 4 is nearly submerged.
- **Sample:** 10 photos per level (50 total), fixed random seed 7. The same 50 photos were run twice, before
  and after a bug fix.
- **Pipeline:** the real one, through `analyse()`, with the face/plate step and place lookup skipped
  (`benchmark=True`). Reproduce with `python -u eval/benchmark_flooded_cars.py --per-level 10`.
- **Metrics:** the labels are ordered levels, not centimetres, so we report rank correlation (Spearman) of
  predicted depth against the true level, and how often the predicted level is the true one or within one
  level. Depth is turned into a level with thresholds we chose from car geometry (10, 35, 70, 110 cm). The
  rank correlation does not depend on those thresholds; the "same level" percentages do.

## Results

| | Muse Spark by-eye estimate | Wheel geometry |
|---|---|---|
| Photos with a reading | 36 of 50 | 6 of 50 (was 9 before the fix) |
| Spearman rank correlation | **0.88** | 0.34 (over those 6) |
| Same level as truth | 56% | 33% |
| Within one level | **100%** | 83% |
| Median depth rises with level | yes | no |

Median by-eye depth by true level (second run): L0 4 cm, L1 12 cm, L2 32 cm, L3 75 cm, L4 118 cm.
The by-eye figures were reproduced almost exactly across the two runs (same coverage, same rank correlation,
same agreement), so they are stable, not a lucky draw.

Seven of the 14 photos without a by-eye estimate are Level 0, where the model rightly gave no depth because
the car is not in water.

## What it shows

1. **Muse Spark's by-eye estimate ranks depth well** on real photos: it never missed by more than one level.
   It is the more dependable of the two estimates on this data.
2. **Wheel geometry is not reliable on this data.** It produced a reading on only 6 of 50 photos, and of those
   only the Level 0 readings (1.4 and 2.0 cm) are clearly right; the others are off by tens of centimetres
   (for example 2.8 cm at Level 2, where the water is at the chassis).
3. **It found a real bug.** Before the fix, a badly fitted circle produced readings of 203, 402 and 614 cm
   from a wheel about 60 cm tall. A reading can no longer exceed the wheel's own height. Combined rank
   correlation recovered from 0.71 to 0.86 as a result. Three tests now guard this.
4. **It found a resource leak.** SQLite connections were never closed, which crashed the first run on a
   Windows file lock and would leak handles in a long-running server. Fixed.

## Limits of this evidence

- **50 photos, one seed.** Enough for a first read, not for a published claim. A larger run
  (`--per-level 30`) would tighten it.
- **Ordered levels, not centimetres.** This says nothing about centimetre error. That needs photos with
  tape-measured depths (`eval/accuracy.py`).
- **Tight, upscaled crops.** The dataset crops each photo around the car and upscales it, which leaves wheel
  geometry less of the scene than a phone photo would. The 6-of-50 coverage is therefore probably a floor, and
  the geometry's real-world performance could be better or worse. We have not tested it on full scenes with
  known depth.
- **Our thresholds.** The depth-to-level cut-offs are an assumption.
- **Visual estimates are model judgement.** Their strength here shows the model reads car-and-water scenes
  well. It does not show they are accurate to the centimetre.

## What we changed because of it

The product already treats the two estimates as independent checks: geometry is cross-checked against the
visual range, and a large disagreement sends the report to review instead of publishing it. The benchmark
supports keeping that design and labelling by-eye estimates plainly as estimates. It also argues for not
presenting wheel geometry as the proven part of the system until it has been measured on full-scene photos
with known depth.

Raw results: [`eval/results/`](../eval/results/).
