from fastapi.testclient import TestClient

import main
from services import store

client = TestClient(main.app)
JPEG = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


def make(status="verified", evidence=True, media=True):
    rid = store.add_report(
        13.0, 80.2, "0" * 16, 34.0, 3.0, status, {"reason": "ok"}, place="Test Road",
        evidence={"width": 100, "height": 80, "wheels": [], "water": {"coverage_pct": 12.5, "prompt": "water"}} if evidence else None,
    )
    if media:
        store.save_media(rid, "photo", JPEG)
        store.save_media(rid, "overlay", JPEG)
    return rid


def test_evidence_and_images_are_served_for_published_reports():
    rid = make()
    r = client.get(f"/api/reports/{rid}/evidence")
    assert r.status_code == 200
    body = r.json()
    assert body["has_photo"] and body["has_overlay"] and body["evidence"]["width"] == 100
    img = client.get(f"/api/reports/{rid}/photo.jpg")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg" and img.content == JPEG


def test_rejected_reports_expose_neither_data_nor_images():
    rid = make(status="rejected_not_flood")
    assert client.get(f"/api/reports/{rid}/evidence").status_code == 404
    assert client.get(f"/api/reports/{rid}/photo.jpg").status_code == 404


def test_unknown_report_or_image_kind_is_404():
    rid = make()
    assert client.get("/api/reports/987654/evidence").status_code == 404
    assert client.get(f"/api/reports/{rid}/secrets.jpg").status_code == 404


def test_report_without_media_says_so():
    rid = make(evidence=False, media=False)
    body = client.get(f"/api/reports/{rid}/evidence").json()
    assert not body["has_photo"] and body["evidence"] is None


def test_map_flags_which_reports_have_evidence():
    with_ev, without = make(), make(evidence=False, media=False)
    feats = {f["properties"]["id"]: f["properties"] for f in client.get("/api/map").json()["features"]}
    assert feats[with_ev]["has_evidence"] is True and feats[without]["has_evidence"] is False


def test_deleting_a_report_removes_its_images(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    rid = make()
    assert client.delete(f"/api/reports/{rid}", headers={"X-Admin-Token": "wrong"}).status_code == 403
    assert client.delete(f"/api/reports/{rid}", headers={"X-Admin-Token": "secret"}).status_code == 200
    assert store.media_path(rid, "photo") is None and store.media_path(rid, "overlay") is None
