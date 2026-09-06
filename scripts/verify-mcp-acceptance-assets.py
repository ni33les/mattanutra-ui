"""Verify the supplied acceptance assets without importing or modifying the runner.

This prerequisite check does not certify the product, test inventory or A/B result.
Evidence hashes refer to the inner artifacts.json, not its ZIP container.
"""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import zipfile


MANIFEST = Path(__file__).resolve().parents[1] / "test/agentic/consistency-v11/acceptance-assets.json"


def digest_stream(stream):
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def verify_asset_directory(assets_dir, evidence_dir, manifest):
    definitions = manifest.get("assets")
    if not isinstance(definitions, list) or not definitions:
        raise ValueError("The acceptance asset manifest must contain assets.")
    results = []
    names = set()
    for definition in definitions:
        name = definition["name"]
        kind = definition["kind"]
        expected = definition["sha256"]
        if (not isinstance(name, str) or Path(name).name != name or name in names
                or kind not in ("file", "evidence")
                or not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected)):
            raise ValueError("Invalid or duplicate acceptance asset definition.")
        names.add(name)
        path = (evidence_dir if kind == "evidence" else assets_dir) / name
        result = {"name": name, "kind": kind, "expectedSha256": expected}
        results.append(result)
        if not path.is_file():
            result["status"] = "missing"
            continue
        try:
            if kind == "evidence":
                with zipfile.ZipFile(path) as archive:
                    members = [entry for entry in archive.infolist()
                               if not entry.is_dir() and PurePosixPath(entry.filename).name == "artifacts.json"]
                    if len(members) != 1:
                        result["status"] = "ambiguous_artifacts" if members else "missing_artifacts"
                        continue
                    result["member"] = members[0].filename
                    with archive.open(members[0]) as stream:
                        actual = digest_stream(stream)
            else:
                with path.open("rb") as stream:
                    actual = digest_stream(stream)
            result["actualSha256"] = actual
            result["status"] = "verified" if actual == expected else "hash_mismatch"
        except (zipfile.BadZipFile, RuntimeError):
            result["status"] = "invalid_archive"
        except OSError:
            result["status"] = "unreadable"
    return {
        "ok": all(result["status"] == "verified" for result in results),
        "scope": "acceptance_asset_integrity_only",
        "assets": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-dir", required=True, type=Path)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    try:
        manifest = json.loads(MANIFEST.read_text())
        report = verify_asset_directory(arguments.assets_dir, arguments.evidence_dir, manifest)
    except (ValueError, KeyError, TypeError, OSError) as error:
        report = {"ok": False, "error": str(error), "scope": "acceptance_asset_integrity_only"}
    encoded = json.dumps(report, indent=2) + "\n"
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(encoded)
    print(encoded, end="")
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
