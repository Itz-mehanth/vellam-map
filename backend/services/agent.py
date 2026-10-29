"""Q&A agent: answers flood questions from the live report map, in the user's language."""

import time

from . import store
from .geo import distance_m
from .meta_client import ask_muse_spark

MAX_REPORTS_IN_CONTEXT = 60

SYSTEM = """You are Vellam Map's flood assistant for residents of a flooded city.
Answer ONLY from the REPORTS below. Each has an id, place, coordinates, age, a depth and where the depth came from.
Rules:
- Reply in the same language and script as the QUESTION (Tamil question -> Tamil answer; English -> English). Keep it to 2-4 short sentences.
- Never say a road or route is "safe" or "passable". Say what the latest reports show, with depth, age and that it is an estimate.
- Depth sources: "measured" = from a photo by geometry (±uncertainty); "visual" = rough guess by eye, say so.
- Judge for the vehicle the user names (a bike stalls around 30 cm, a car around 50 cm, an auto-rickshaw around 40 cm), but still do not promise safety.
- The QUESTION may come from speech-to-text, which often misspells place names (for example "Villa Cherry" for "Velachery"). Match it phonetically to the place names in REPORTS, and say which place you took it to mean.
- USER LOCATION, when given, is where the person is now. If the question names no place (for example "water is collecting here"), answer from the reports nearest to them and say how far away each is.
- If there are no relevant reports near what was asked, say there is no recent data there, and suggest the user check official sources.
- If reports show a nearby place with shallower water, you may mention it as an option.
- At the end of your reply, on its own line, write SOURCES: followed by the report ids you used, comma-separated (or SOURCES: none)."""


def build_context(now: float | None = None, near: tuple[float, float] | None = None) -> tuple[str, dict[int, dict]]:
    now = now or time.time()
    lines, index = [], {}
    for r in store.published_reports(48)[:MAX_REPORTS_IN_CONTEXT]:
        depth, source = store.effective_depth(r)
        age = round((now - r["created_at"]) / 60)
        depth_text = "unknown" if depth is None else f"{round(depth)} cm"
        if source == "measured" and r["uncertainty_cm"] is not None:
            depth_text += f" (±{round(r['uncertainty_cm'])})"
        place = r["place"] or "unnamed location"
        away = f" | {round(distance_m(near[0], near[1], r['lat'], r['lng']))} m from the user" if near else ""
        lines.append(f"- id={r['id']} | {place} | ({r['lat']:.4f}, {r['lng']:.4f}) | {age} min ago | depth {depth_text} | source {source}{away}")
        index[r["id"]] = {"id": r["id"], "place": place, "depth_cm": depth, "source": source, "age_min": age,
                          "lat": r["lat"], "lng": r["lng"]}
    return ("\n".join(lines) or "(no reports in the last 48 hours)"), index


async def answer(question: str, near: tuple[float, float] | None = None) -> dict:
    context, index = build_context(near=near)
    where = f"USER LOCATION: {near[0]:.4f}, {near[1]:.4f}\n\n" if near else ""
    text = await ask_muse_spark(f"{SYSTEM}\n\n{where}REPORTS:\n{context}\n\nQUESTION: {question}")
    reply, _, tail = text.rpartition("SOURCES:")
    if not _:
        reply, tail = text, "none"
    ids = [int(t) for t in tail.replace(" ", "").split(",") if t.strip().isdigit()]
    return {"answer": reply.strip(), "sources": [index[i] for i in ids if i in index], "reports_considered": len(index)}
