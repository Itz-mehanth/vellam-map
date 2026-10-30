import asyncio

from services import verify


def judged(monkeypatch, reply: str) -> dict:
    async def fake(prompt, image=None, mime="image/jpeg"):
        return reply

    monkeypatch.setattr(verify, "ask_muse_spark", fake)
    return asyncio.run(verify.judge(b"x"))


def test_evidence_none_means_not_a_flood(monkeypatch):
    v = judged(monkeypatch, 'Sure: {"flood_evidence": "none", "looks_staged_or_stock": false}')
    assert v["is_flood"] is False


def test_clear_and_possible_both_count_as_a_flood_for_readers_of_is_flood(monkeypatch):
    assert judged(monkeypatch, '{"flood_evidence": "clear"}')["is_flood"] is True
    assert judged(monkeypatch, '{"flood_evidence": "possible"}')["is_flood"] is True


def test_unparseable_replies_are_reported_not_guessed(monkeypatch):
    assert judged(monkeypatch, "no json here")["error"] == "unparseable"
    assert judged(monkeypatch, "{not valid json}")["error"] == "unparseable"
    assert "is_flood" not in judged(monkeypatch, '{"flood_evidence": "maybe"}')  # an unknown value decides nothing
