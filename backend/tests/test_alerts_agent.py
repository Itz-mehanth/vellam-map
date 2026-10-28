import time

from services import agent, alerts, store

NOW = time.time()


def add(lat, lng, depth, minutes_ago=5, status="verified", verdict=None, place=None):
    return store.add_report(lat, lng, "0" * 16, depth, 4 if depth else None, status, verdict or {},
                            place=place, created_at=NOW - minutes_ago * 60)


def test_nearby_reports_form_one_alert_and_far_ones_another():
    add(13.0000, 80.2000, 60, place="Road A")
    add(13.0010, 80.2005, 80)  # about 130 m away: same cluster
    add(13.1000, 80.3000, 15, place="Road B")
    result = alerts.build_alerts(NOW)
    by_place = {a["place"]: a for a in result}
    assert len(result) >= 2
    a = by_place["Road A"]
    assert a["reports"] == 2 and a["corroborated"] and a["level"] == "high" and a["max_depth_cm"] == 80
    assert result[0]["level"] in ("danger", "high")  # most severe first


def test_visual_estimate_counts_towards_alert_level():
    add(12.5, 80.0, None, status="flood_visual_estimate", verdict={"depth_cm_low": 90, "depth_cm_high": 110}, place="Visual")
    a = next(x for x in alerts.build_alerts(NOW) if x["place"] == "Visual")
    assert a["level"] == "danger"


def test_old_reports_drop_out_of_alerts():
    add(12.0, 79.0, 70, minutes_ago=60 * 10, place="Ancient")
    assert all(a["place"] != "Ancient" for a in alerts.build_alerts(NOW))


def test_rejected_reports_never_reach_alerts_or_answers():
    add(11.0, 78.0, 70, status="rejected_duplicate", place="Rejected Place")
    assert all(a["place"] != "Rejected Place" for a in alerts.build_alerts(NOW))
    context, _ = agent.build_context(NOW)
    assert "Rejected Place" not in context


def test_agent_context_labels_depth_source():
    add(10.0, 77.0, 42, place="Measured St")
    add(10.5, 77.5, None, status="flood_visual_estimate", verdict={"depth_cm_low": 20, "depth_cm_high": 30}, place="Visual St")
    context, index = agent.build_context(NOW)
    assert "source measured" in context and "source visual" in context
    assert any(v["place"] == "Visual St" and v["depth_cm"] == 25 for v in index.values())
