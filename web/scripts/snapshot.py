#!/usr/bin/env python3
"""Regenerate the offline fallback.

The page's three layers are: live GitHub, then the last good answer held in
memory, then this file. Only this one survives a venue with no network, and
only for a browser that can still reach the server. Rehearse with:

    npm run dev
    open http://localhost:3000/alphaclimate?offline=1

Run this last, before you leave, then commit and redeploy:

    python3 scripts/snapshot.py
    git add src/snapshot.json && git commit -m "Refresh the offline snapshot"
"""

import json
import sys
import urllib.request
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://research.workwitharah.ai"
RUN_IDS = sys.argv[2:] or ["alphaclimate"]
OUT = Path(__file__).resolve().parent.parent / "src" / "snapshot.json"


def fetch(run_id):
    url = "{}/api/runs/{}".format(BASE.rstrip("/"), run_id)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    out = {}
    for run_id in RUN_IDS:
        d = fetch(run_id)
        if d.get("source") == "snapshot" and not d.get("experiments"):
            print("! {}: server returned an empty snapshot, refusing to save it"
                  .format(run_id))
            continue
        # Drop the provenance of this particular fetch: on reload the page
        # relabels it as a snapshot anyway, and a stale "live" would lie.
        d.pop("source", None)
        out[run_id] = d
        print("  {}: {} experiments, head {}/{}".format(
            run_id, len(d["experiments"]),
            (d.get("head") or {}).get("score"), (d.get("head") or {}).get("total")))
    if not out:
        print("nothing fetched; leaving the existing snapshot alone")
        return 1
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print("wrote {} ({:,} bytes)".format(OUT, OUT.stat().st_size))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
