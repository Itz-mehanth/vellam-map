# eval

Scripts for checking the pipeline against real photos. They call the Meta API, so they need
`backend/.env` to hold a valid `META_API_KEY`. Run them from the repository root with the backend
virtualenv active.

| Script | What it does |
|---|---|
| `accuracy.py` | **The go/no-go test.** Reads `eval/photos/depths.csv` (`file,true_depth_cm`), runs the full pipeline on each photo and reports the mean absolute error of the geometric and the visual estimates against 15 cm. Copy `depths.example.csv` to start. |
| `measure.py` | Runs the pipeline on any photos and prints each stage: wheels found, fused depth, verification. Uses a throwaway database. |
| `smoke_test.py` | Confirms the key and model IDs work with one Muse Spark call and three SAM 3.1 calls. |
| `prompt_probe.py` | Counts how many instances each SAM prompt finds per photo. Used to choose prompts. |
| `benchmark_flooded_cars.py` | **Public-dataset benchmark.** Runs the pipeline on real flooded-car photos with ground-truth depth *levels* and reports coverage, rank correlation and level agreement. See below. |
| `record_replays.py` | Records the pipeline's real output for every sample photo and prints how many gave a geometric depth. |
| `overlay.py` | Draws SAM masks on a photo for visual checking. |

Put your own photos in `eval/photos/` (git-ignored). The 19 sample photos used by the app live in
`frontend/public/samples/` with their licences in `samples.json`.

Accuracy has **not** been measured yet: it needs photos with independently known water depths.

## Benchmarking on a public dataset

[STURM-FloodDepth Flooded Cars](https://zenodo.org/records/14833532) (CC BY 4.0) has 3,367 real street-level
photos of submerged cars in five levels by water height against the car's own features (tyres, chassis,
windows). We use only its published `test.txt` split (340 photos).

```bash
mkdir -p eval/datasets/flooded_cars && cd eval/datasets/flooded_cars
curl -L -o flooded_cars.zip "https://zenodo.org/api/records/14833532/files/flooded_cars.zip/content"
curl -L -o test.txt         "https://zenodo.org/api/records/14833532/files/test.txt/content"
python -I -c "import zipfile; zipfile.ZipFile('flooded_cars.zip').extractall('data')"
cd ../../..
python -u eval/benchmark_flooded_cars.py --per-level 10     # 50 photos; --per-level 40 for a bigger run
python eval/benchmark_flooded_cars.py --self-test            # metrics only, no API calls
```

What it can and cannot show:

- The labels are **ordered levels, not centimetres**, so it measures ordering (Spearman rank correlation) and
  level agreement, not centimetre error. Centimetre error needs measured depths: use `accuracy.py`.
- Turning a depth into a level needs thresholds from car geometry. `LEVEL_EDGES_CM` in the script is our
  assumption; change it and re-run to see how sensitive the result is.
- The images are cropped around the car and upscaled, so wheel geometry sees less of the scene than a phone
  photo would. Coverage figures are a lower bound.
- A run spends Meta API credits (about six calls per photo).
