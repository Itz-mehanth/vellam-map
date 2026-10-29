"""Area alerts: nearby recent reports are clustered into one warning per area."""

import time
from dataclasses import dataclass, field

from . import store
from .geo import distance_m

CLUSTER_RADIUS_M = 600
WINDOW_HOURS = 6

LEVELS = [(90, "danger", "Very deep water"), (50, "high", "Deep water"), (20, "caution", "Water on the road")]


@dataclass
class Cluster:
    rows: list = field(default_factory=list)

    @property
    def lat(self) -> float:
        return sum(r["lat"] for r in self.rows) / len(self.rows)

    @property
    def lng(self) -> float:
        return sum(r["lng"] for r in self.rows) / len(self.rows)


def _level(depth: float | None) -> tuple[str, str]:
    if depth is None:
        return "info", "Flooding reported"
    for threshold, key, title in LEVELS:
        if depth >= threshold:
            return key, title
    return "low", "Shallow water"


def build_alerts(now: float | None = None) -> list[dict]:
    now = now or time.time()
    clusters: list[Cluster] = []
    for row in store.published_reports(WINDOW_HOURS):
        for c in clusters:
            if distance_m(row["lat"], row["lng"], c.lat, c.lng) <= CLUSTER_RADIUS_M:
                c.rows.append(row)
                break
        else:
            clusters.append(Cluster([row]))

    alerts = []
    for c in clusters:
        depths = [d for d, _ in (store.effective_depth(r) for r in c.rows) if d is not None]
        deepest = max(depths) if depths else None
        level, title = _level(deepest)
        newest = max(r["created_at"] for r in c.rows)
        place = next((r["place"] for r in c.rows if r["place"]), None)
        age_min = round((now - newest) / 60)
        n = len(c.rows)
        where = place or f"{c.lat:.3f}, {c.lng:.3f}"
        depth_text = f", up to about {round(deepest)} cm" if deepest is not None else ""
        alerts.append({
            "level": level,
            "title": title,
            "place": where,
            "lat": c.lat,
            "lng": c.lng,
            "reports": n,
            "corroborated": n >= 2,
            "max_depth_cm": deepest,
            "latest_age_min": age_min,
            "message": f"{title} near {where}{depth_text}. {n} report{'s' if n != 1 else ''}, latest {age_min} min ago. Estimate only.",
            "demo": all(r["is_demo"] for r in c.rows),
            "report_ids": [r["id"] for r in c.rows],
        })
    order = {"danger": 0, "high": 1, "caution": 2, "low": 3, "info": 4}
    return sorted(alerts, key=lambda a: (order[a["level"]], a["latest_age_min"]))
