import io
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image

from services import agent, alerts, limits, replay, store, verify
from services.meta_client import transcribe
from services.pipeline import analyse

MAP_MAX_AGE_HOURS = float(os.getenv("MAP_MAX_AGE_HOURS", "72"))

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Hashing pulls in heavy imports on first use; pay that at boot, not on the first report."""
    verify.photo_hash(_tiny_jpeg())
    # Free hosts have no persistent disk, so the map would open empty after every restart.
    # SEED_DEMO=1 fills an empty database with the labelled demo reports (never over real ones).
    if os.getenv("SEED_DEMO") and not store.all_reports():
        import seed_demo

        seed_demo.seed()
    yield


app = FastAPI(title="Vellam Map API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, "JPEG")
    return buf.getvalue()


@app.get("/api/health")
def health():
    try:
        store.published_reports(1)
        db = True
    except Exception:
        db = False
    return {"ok": db, "db": db, "meta_key_set": bool(os.getenv("META_API_KEY")), "replay": replay.enabled()}


async def _read_image(photo: UploadFile) -> bytes:
    image = await photo.read()
    limits.check_size(image, "photo")
    try:
        img = Image.open(io.BytesIO(image))
        img.verify()
        if img.width * img.height > limits.MAX_PIXELS:
            raise HTTPException(413, "That photo has too many pixels. Please use a smaller one.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "not a valid image") from None
    return image


@app.post("/api/reports/stream")
async def create_report_stream(
    request: Request, photo: UploadFile = File(...), lat: float = Form(...), lng: float = Form(...)
):
    """Photo + location -> newline-delimited JSON, one event per pipeline stage."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(400, "invalid location")
    limits.report_limiter.check(limits.client_id(request))
    image = await _read_image(photo)

    if replay.enabled():
        recorded = replay.find(image)
        if recorded is None:
            raise HTTPException(422, "Replay mode: this server has no API key, so it can only replay the sample photos. Pick one of the samples.")

        async def replayed():
            async for ev in replay.play(recorded):
                yield json.dumps(ev) + "\n"

        return StreamingResponse(replayed(), media_type="application/x-ndjson")

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
                "place": r["place"],
                "demo": bool(r["is_demo"]),
                "has_evidence": r["evidence"] is not None,
            },
        }
        for r in store.published_reports(MAP_MAX_AGE_HOURS)
    ]
    return {"type": "FeatureCollection", "features": features}


@app.get("/api/reports/{report_id}/evidence")
def report_evidence(report_id: int):
    """The result with the data behind it: wheel geometry, fusion inputs, checks, and image links."""
    r = store.get_report(report_id)
    if r is None or r["status"] not in store.PUBLISHED:
        raise HTTPException(404, "No such report")
    ev = json.loads(r["evidence"]) if r["evidence"] else None
    return {
        "id": r["id"], "created_at": r["created_at"], "status": r["status"], "place": r["place"],
        "lat": r["lat"], "lng": r["lng"], "depth_cm": r["depth_cm"], "uncertainty_cm": r["uncertainty_cm"],
        "verdict": json.loads(r["verdict"]), "demo": bool(r["is_demo"]), "evidence": ev,
        "has_photo": store.media_path(report_id, "photo") is not None,
        "has_overlay": store.media_path(report_id, "overlay") is not None,
    }


@app.get("/api/reports/{report_id}/{kind}.jpg")
def report_image(report_id: int, kind: str):
    """Evidence image for a published report: the submitted photo, or the photo with the masks drawn on."""
    r = store.get_report(report_id)
    path = store.media_path(report_id, kind) if kind in ("photo", "overlay") else None
    if r is None or r["status"] not in store.PUBLISHED or path is None:
        raise HTTPException(404, "No such image")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/alerts")
def get_alerts():
    """One warning per area, from clusters of recent reports."""
    return {"alerts": alerts.build_alerts()}


@app.post("/api/ask")
async def ask(
    request: Request,
    audio: UploadFile | None = File(None),
    question: str | None = Form(None),
    language: str | None = Form(None),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
):
    """A flood question, spoken (WAV) or typed -> answer grounded in the live map."""
    limits.ask_limiter.check(limits.client_id(request))
    if replay.enabled():
        raise HTTPException(503, "Replay mode: questions need a Meta API key, so they are switched off here.")
    transcript = None
    if audio is not None:
        data = await audio.read()
        limits.check_size(data, "recording")
        try:
            transcript = await transcribe(data, language)
        except Exception as e:
            raise HTTPException(502, f"Transcription failed: {e}") from e
        question = transcript
    if not question or not question.strip():
        raise HTTPException(400, "No question heard. Try again or type it.")
    if len(question) > 500:
        raise HTTPException(400, "Question is too long (500 characters max).")
    near = (lat, lng) if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180 else None
    result = await agent.answer(question.strip(), near)
    return {"question": question.strip(), "transcribed": transcript is not None, **result}


@app.delete("/api/reports/{report_id}")
def delete_report(report_id: int, x_admin_token: str | None = Header(None)):
    """Moderation: remove a report. Disabled unless ADMIN_TOKEN is set."""
    token = os.getenv("ADMIN_TOKEN")
    if not token or x_admin_token != token:
        raise HTTPException(403, "Not allowed")
    if not store.delete_report(report_id):
        raise HTTPException(404, "No such report")
    return {"deleted": report_id}
