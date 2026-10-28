import io
import json

from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from services import store, verify
from services.pipeline import analyse

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


async def _read_image(photo: UploadFile) -> bytes:
    image = await photo.read()
    try:
        Image.open(io.BytesIO(image)).verify()
    except Exception:
        raise HTTPException(400, "not a valid image")
    return image


@app.post("/api/reports/stream")
async def create_report_stream(
    photo: UploadFile = File(...), lat: float = Form(...), lng: float = Form(...)
):
    """Photo + location -> newline-delimited JSON, one event per pipeline stage."""
    image = await _read_image(photo)

    async def events():
        try:
            async for ev in analyse(image, lat, lng):
                yield json.dumps(ev) + "\n"
        except Exception as e:  # surface failures in the stream instead of a dropped connection
            yield json.dumps({"stage": "error", "title": "Pipeline failed", "ms": 0, "data": {"message": str(e)}}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")


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
        if r["status"] in ("verified", "flood_unmeasured", "flood_visual_estimate", "flood_review")
    ]
    return {"type": "FeatureCollection", "features": features}


@app.post("/api/ask")
async def ask(audio: UploadFile = File(...)):
    """Voice question in Tamil/English -> agent answer grounded in the map."""
    return {"status": "not_implemented"}
