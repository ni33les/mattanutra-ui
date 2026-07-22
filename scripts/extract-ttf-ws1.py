#!/usr/bin/env python3
"""Extract Workstream 1 (Thai Landing + Library) from files/ttf.zip.

Source of truth remains files/ttf.zip. This script unpacks the nested hand-off
into .cache/ttf-ws1 for build/verification steps. The extract is gitignored.

Usage:
  python3 scripts/extract-ttf-ws1.py
  python3 scripts/extract-ttf-ws1.py --verify
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TTF_ZIP = REPO_ROOT / "files" / "ttf.zip"
CACHE_ROOT = REPO_ROOT / ".cache" / "ttf-ws1"
PACKAGE_DIRNAME = "MattaNutra_TH_Localization_Handoff_2026-07-19"
INNER_ZIP_REL = (
    "Thai Translation FINAL Proton/"
    "FINAL FINAL Hand-off THAI Landing and Library/"
    "MattaNutra_TH_Localization_Handoff_2026-07-19_v3.zip"
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_ws1(force: bool = False) -> Path:
    if not TTF_ZIP.is_file():
        raise SystemExit(f"missing hand-off archive: {TTF_ZIP}")

    package_root = CACHE_ROOT / PACKAGE_DIRNAME
    marker = CACHE_ROOT / ".extract-ok"
    expected_zip_hash = sha256_file(TTF_ZIP)

    if (
        not force
        and marker.is_file()
        and package_root.is_dir()
        and marker.read_text(encoding="utf-8").strip() == expected_zip_hash
    ):
        print(f"reuse {package_root} (matches files/ttf.zip)")
        return package_root

    if CACHE_ROOT.exists():
        shutil.rmtree(CACHE_ROOT)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ttf-ws1-") as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(TTF_ZIP) as outer:
            try:
                outer.getinfo(INNER_ZIP_REL)
            except KeyError as error:
                names = [name for name in outer.namelist() if name.endswith(".zip")]
                raise SystemExit(
                    f"inner WS1 zip not found at {INNER_ZIP_REL!r}; zip members: {names}"
                ) from error
            outer.extract(INNER_ZIP_REL, path=tmp_path)
            inner_zip = tmp_path / INNER_ZIP_REL

        with zipfile.ZipFile(inner_zip) as inner:
            inner.extractall(path=CACHE_ROOT)

    if not package_root.is_dir():
        candidates = list(CACHE_ROOT.glob("**/00_START_HERE.md"))
        if not candidates:
            raise SystemExit(f"extract missing package root under {CACHE_ROOT}")
        found = candidates[0].parent
        if found != package_root:
            if package_root.exists():
                shutil.rmtree(package_root)
            shutil.move(str(found), str(package_root))

    if not package_root.is_dir():
        raise SystemExit(f"package root missing after extract: {package_root}")

    marker.write_text(expected_zip_hash + "\n", encoding="utf-8")
    print(f"extracted {package_root}")
    print(f"source {TTF_ZIP} sha256={expected_zip_hash}")
    return package_root


def verify_checksums(package_root: Path) -> int:
    verification = package_root / "verification"
    script = verification / "verify_deployment.py"
    manifest = verification / "MANIFEST.sha256"
    if not script.is_file() or not manifest.is_file():
        raise SystemExit(f"missing verification tools under {verification}")

    result = subprocess.run(
        [sys.executable, str(script), "--check", str(manifest.name)],
        cwd=str(verification),
        check=False,
    )
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-extract even when cache matches files/ttf.zip",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="run package MANIFEST.sha256 check after extract",
    )
    args = parser.parse_args()

    package_root = extract_ws1(force=args.force)
    print(f"package_root={package_root}")

    if args.verify:
        code = verify_checksums(package_root)
        if code != 0:
            print("MANIFEST.sha256 verification FAILED", file=sys.stderr)
            return code
        print("MANIFEST.sha256 verification PASS")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
