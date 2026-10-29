"""Fill the map with clearly-labelled DEMO reports around Chennai.

    python seed_demo.py          # add demo reports (replaces earlier demo rows)
    python seed_demo.py --clear  # remove them

Demo rows are flagged is_demo in the database and shown as "Demo data" in the UI.
They are placeholders for filming the demo, not real measurements.
"""

import random
import sys
import time

from services import store

# (place, lat, lng, depth_cm or None, uncertainty, visual range or None, minutes ago)
DEMO = [
    ("Velachery Main Road, Velachery", 12.9815, 80.2180, 62, 6, None, 8),
    ("Velachery Main Road, Velachery", 12.9792, 80.2207, 70, 8, None, 15),
    ("Vijayanagar Bus Stand, Velachery", 12.9756, 80.2121, 48, 5, None, 22),
    ("Medavakkam Main Road, Pallikaranai", 12.9249, 80.2145, 85, 9, None, 12),
    ("Pallikaranai Marsh Road, Pallikaranai", 12.9370, 80.2160, 95, 10, None, 30),
    ("Mudichur Road, Mudichur", 12.9040, 80.0690, 110, 12, None, 40),
    ("Tambaram Sanatorium, Tambaram", 12.9510, 80.1270, 35, 4, None, 18),
    ("Sardar Patel Road, Adyar", 13.0067, 80.2570, 28, 4, None, 25),
    ("Kotturpuram Bridge Road, Kotturpuram", 13.0150, 80.2430, None, None, (20, 35), 10),
    ("Usman Road, T. Nagar", 13.0418, 80.2341, 22, 3, None, 33),
    ("Mount Road, Saidapet", 13.0214, 80.2231, None, None, (35, 55), 20),
    ("Perungudi OMR Service Road, Perungudi", 12.9650, 80.2461, 52, 6, None, 6),
    ("Washermanpet Main Road, Washermanpet", 13.1143, 80.2870, 18, 3, None, 45),
]


def seed() -> tuple[int, int]:
    """Replace any earlier demo rows with fresh ones. Returns (removed, added)."""
    removed = store.clear_demo()
    now = time.time()
    rng = random.Random(7)
    for place, lat, lng, depth, unc, visual, minutes in DEMO:
        verdict = {"is_flood": True, "is_outdoor_street": True, "looks_staged_or_stock": False,
                   "reason": "Demo data, not a real measurement."}
        if visual:
            verdict |= {"depth_cm_low": visual[0], "depth_cm_high": visual[1]}
        status = "verified" if depth is not None else "flood_visual_estimate"
        store.add_report(lat, lng, "%016x" % rng.getrandbits(64), depth, unc, status, verdict,
                         place=place, is_demo=True, created_at=now - minutes * 60)
    return removed, len(DEMO)


def main() -> None:
    if "--clear" in sys.argv:
        print(f"removed {store.clear_demo()} demo reports")
        return
    removed, added = seed()
    print(f"seeded {added} demo reports (replaced {removed})")


if __name__ == "__main__":
    main()
