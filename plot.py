"""Build data files for the Anemoi Contributors dashboard.

The dashboard itself lives as static source files under ``docs/``
(``index.html``, ``assets/styles.css``, ``assets/app.js`` and the per-section
modules in ``assets/*_module.js``). This script only manages the *data* the
front-end fetches at runtime:

1. Copies ``results.json`` → ``docs/data/latest.json``.
2. Copies each ``history/results-<date>.json`` → ``docs/data/history/<date>.json``.
3. Writes ``docs/data/manifest.json`` so the SPA knows which dates exist.

Running this script will not touch the HTML/CSS/JS — edit those files directly.
"""

import glob
import json
import os
import re
import shutil
from datetime import datetime, timezone

DOCS_DIR = "docs"
DATA_DIR = os.path.join(DOCS_DIR, "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")


def _latest_date_from(results_path: str) -> str:
    """Use the ``generated_at`` from the results blob (YYYY-MM-DD) if possible."""
    try:
        with open(results_path) as f:
            blob = json.load(f)
        return blob.get("generated_at", "")[:10] or datetime.now(timezone.utc).strftime(
            "%Y-%m-%d"
        )
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def prepare_data_files():
    os.makedirs(HISTORY_DIR, exist_ok=True)

    # 1. Latest snapshot
    if not os.path.exists("results.json"):
        raise FileNotFoundError(
            "results.json not found in repo root — run main.py first."
        )
    shutil.copyfile("results.json", os.path.join(DATA_DIR, "latest.json"))
    latest_date = _latest_date_from("results.json")
    print("✓ Copied results.json → docs/data/latest.json")

    # 2. History snapshots
    history_dates = []
    for path in sorted(glob.glob("history/results-*.json")):
        m = re.search(r"results-(\d{4}-\d{2}-\d{2})\.json$", path)
        if not m:
            continue
        date = m.group(1)
        shutil.copyfile(path, os.path.join(HISTORY_DIR, f"{date}.json"))
        history_dates.append(date)
    history_dates.sort(reverse=True)  # newest first
    print(f"✓ Copied {len(history_dates)} history snapshot(s) → docs/data/history/")

    # Ensure the latest date is in the history list (the SPA expects it).
    if latest_date and latest_date not in history_dates:
        history_dates.insert(0, latest_date)

    # 3. Manifest
    manifest = {
        "latest": latest_date,
        "history": history_dates,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z",
    }
    with open(os.path.join(DATA_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("✓ Wrote docs/data/manifest.json")

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
    print("Building Anemoi Contributors Dashboard data…\n")
    latest_date, history_dates = prepare_data_files()
    verify_static_assets()
    print("\n" + "=" * 60)
    print("✓ Build complete")
    print(f"  Latest snapshot: {latest_date}")
    print(f"  History entries: {len(history_dates)}")
    print("=" * 60)
