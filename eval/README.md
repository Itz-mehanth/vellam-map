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
| `overlay.py` | Draws SAM masks on a photo for visual checking. |

Put your own photos in `eval/photos/` (git-ignored). The 19 sample photos used by the app live in
`frontend/public/samples/` with their licences in `samples.json`.

Accuracy has **not** been measured yet: it needs photos with independently known water depths.
