#!/usr/bin/env python3
"""Install Workstream 1 library/landing assets from the extracted hand-off.

Requires: python3 scripts/extract-ttf-ws1.py --verify
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PKG = REPO / ".cache/ttf-ws1/MattaNutra_TH_Localization_Handoff_2026-07-19"
ASSETS = PKG / "assets"
AUTH = REPO / "files/ttf-ws1/AUTHORITATIVE.json"


def main() -> int:
    if not ASSETS.is_dir():
        print("missing extract; run: python3 scripts/extract-ttf-ws1.py --verify", file=sys.stderr)
        return 1

    share_dst = REPO / "public/assets/library/share"
    nong_dst = REPO / "public/assets/library/nong"
    og_dst = REPO / "public/assets/og"
    brand_dst = REPO / "public/assets/library/brand"
    for path in (share_dst, nong_dst, og_dst, brand_dst):
        path.mkdir(parents=True, exist_ok=True)

    share_count = 0
    for src in sorted(ASSETS.glob("share-*.jpg")):
        shutil.copy2(src, share_dst / src.name)
        share_count += 1

    nong_count = 0
    for src in sorted(ASSETS.glob("nong_*.webp")):
        out_name = src.name.replace("_", "-")
        shutil.copy2(src, nong_dst / out_name)
        nong_count += 1

    if (ASSETS / "mattanutra-og.png").is_file():
        shutil.copy2(ASSETS / "mattanutra-og.png", og_dst / "mattanutra-og.png")
    if (ASSETS / "mattanutra-logo.webp").is_file():
        shutil.copy2(ASSETS / "mattanutra-logo.webp", brand_dst / "mattanutra-logo.webp")
    if (ASSETS / "mattanutra_logo_web.jpg").is_file():
        shutil.copy2(ASSETS / "mattanutra_logo_web.jpg", brand_dst / "mattanutra-logo-web.jpg")

    auth = json.loads(AUTH.read_text(encoding="utf-8"))
    missing: list[str] = []
    for row in auth["articleImageMap"]:
        share = REPO / "public" / str(row["shareImage"]).lstrip("/")
        pose = str(row["nongPose"]).removeprefix("nong_").replace("_", "-")
        pose_path = nong_dst / f"nong-{pose}.webp"
        if not share.is_file():
            missing.append(f"share missing for {row['slug']}: {share}")
        if not pose_path.is_file():
            missing.append(f"pose missing for {row['slug']}: {pose_path}")

    print(
        json.dumps(
            {
                "shareInstalled": share_count,
                "nongInstalled": nong_count,
                "missing": missing,
                "status": "ok" if not missing else "fail",
            },
            indent=2,
        )
    )
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
