import io
import json

from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from services import store, verify
from services.pipeline import measure

app = FastAPI(title="Vellam Map API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/reports")
async def create_report(
    photo: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
):
    """Photo + location -> verified depth estimate added to the map."""
    image = await photo.read()
    try:
        w, h = Image.open(io.BytesIO(image)).size
    except Exception:
        raise HTTPException(400, "not a valid image")

    phash = verify.photo_hash(image)
    duplicate_of = verify.find_duplicate(phash)
    verdict = await verify.judge(image)
    result = await measure(image, (h, w))

    if duplicate_of is not None:
        status = "rejected_duplicate"
    elif verdict.get("is_flood") is False or verdict.get("looks_staged_or_stock"):
        status = "rejected_not_flood"
    elif result["depth_cm"] is None:
        status = "flood_unmeasured"  # real flood, but no usable reference object
    else:
        status = "verified"

    report_id = store.add_report(
        lat, lng, str(phash), result["depth_cm"], result["uncertainty_cm"], status, verdict
    )
    return {"id": report_id, "status": status, "duplicate_of": duplicate_of,
            "verdict": verdict, "measurement": result}


@app.get("/api/map")
def flood_map():
    """All reports worth showing, as GeoJSON for the live map."""
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": {
                "id": r["id"],
                "created_at": r["created_at"],
                "status": r["status"],
                "depth_cm": r["depth_cm"],
                "uncertainty_cm": r["uncertainty_cm"],
                "verdict": json.loads(r["verdict"]),
            },
        }
        for r in store.all_reports()
        if r["status"] in ("verified", "flood_unmeasured")
    ]
    return {"type": "FeatureCollection", "features": features}


@app.post("/api/ask")
async def ask(audio: UploadFile = File(...)):
    """Voice question in Tamil/English -> agent answer grounded in the map."""
    return {"status": "not_implemented"}
