from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

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
    """Photo + location -> verified depth estimate added to the map.

    Pipeline (Days 2–5): SAM 3.1 masks -> depth.py estimates -> fuse ->
    Muse Spark verification (real flood? duplicate? old photo?) -> store.
    """
    return {"status": "not_implemented"}


@app.get("/api/map")
def flood_map():
    """All verified reports as GeoJSON for the live map."""
    return {"type": "FeatureCollection", "features": []}


@app.post("/api/ask")
async def ask(audio: UploadFile = File(...)):
    """Voice question in Tamil/English -> agent answer grounded in the map."""
    return {"status": "not_implemented"}
