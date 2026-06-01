"""Generate the manifest for the Anemoi Contributors dashboard.

Data files (``latest.json`` and ``history/*.json``) are written directly
by ``main.py`` into ``docs/data/``.  This script scans what is present
and writes ``docs/data/manifest.json`` so the SPA knows which snapshots
are available.

Running this script will not touch the HTML/CSS/JS -- edit those files
directly.
"""

import glob
import json
import os
import re
from datetime import datetime, timezone

DATA_DIR = os.path.join("docs", "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
LATEST_PATH = os.path.join(DATA_DIR, "latest.json")


def _date_from_latest() -> str:
    """Extract the snapshot date (YYYY-MM-DD) from ``latest.json``."""
    try:
        with open(LATEST_PATH) as f:
            blob = json.load(f)
        return blob.get("generated_at", "")[:10] or datetime.now(timezone.utc).strftime(
            "%Y-%m-%d"
        )
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def build_manifest():
    """Scan ``docs/data/`` and write ``manifest.json``."""
    if not os.path.exists(LATEST_PATH):
        raise FileNotFoundError(f"{LATEST_PATH} not found -- run main.py first.")

    latest_date = _date_from_latest()

    # Collect history dates from docs/data/history/<date>.json
    history_dates = []
    for path in sorted(glob.glob(os.path.join(HISTORY_DIR, "*.json"))):
        m = re.search(r"(\d{4}-\d{2}-\d{2})\.json$", path)
        if m:
            history_dates.append(m.group(1))
    history_dates.sort(reverse=True)  # newest first

    # Ensure latest date appears in the history list (the SPA expects it).
    if latest_date and latest_date not in history_dates:
        history_dates.insert(0, latest_date)

    manifest = {
        "latest": latest_date,
        "history": history_dates,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z",
    }
    with open(os.path.join(DATA_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"✓ Wrote {DATA_DIR}/manifest.json")

    return latest_date, history_dates


def verify_static_assets():
    required = [
        "docs/index.html",
        "docs/assets/styles.css",
        "docs/assets/app.js",
        "docs/assets/trends_module.js",
        "docs/assets/counts_module.js",
        "docs/assets/types_module.js",
    ]
    missing = [p for p in required if not os.path.exists(p)]
    if missing:
        print(
            "⚠ Missing static assets (edit these files directly, they are not generated):"
        )
        for p in missing:
            print(f"    - {p}")
    else:
        print("✓ All static assets present")


if __name__ == "__main__":
    print("Building Anemoi Contributors Dashboard manifest…\n")
    latest_date, history_dates = build_manifest()
    verify_static_assets()
    print("\n" + "=" * 60)
    print("✓ Build complete")
    print(f"  Latest snapshot: {latest_date}")
    print(f"  History entries: {len(history_dates)}")
    print("=" * 60)
