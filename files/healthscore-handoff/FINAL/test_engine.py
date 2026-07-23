"""
HealthScore Engine — snapshot tests

Runs the engine against fixture inputs (Marcus, Priya) and asserts the
content packages match expected outputs byte-for-byte.

Usage:
    pip install pytest
    cd engine
    python -m pytest test_engine.py -v

To deliberately update snapshots after an intentional engine change:
    python test_engine.py --update-snapshots
    git diff engine/fixtures/   # review every byte of the diff
    git add engine/fixtures/
    git commit -m "engine: <intentional change description>"

If a test fails without an intentional change, do NOT regenerate the
snapshots to silence it. A failing snapshot means an engine change is
silently moving customer scores; investigate before doing anything else.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Ensure local imports work regardless of pytest invocation directory
sys.path.insert(0, str(Path(__file__).parent))

from engine import score as engine_score
from healthscore_content import build_page_content

FIXTURES_DIR = Path(__file__).parent / "fixtures"
PCTILE_PATH = Path(__file__).parent / "pctile.json"

with PCTILE_PATH.open() as f:
    PERCENTILES = json.load(f)

FIXTURES = ["marcus", "priya"]


def _run_engine(answers: dict, first_name: str) -> dict:
    """Replicate exactly what server.py does for a /score request."""
    result = engine_score(answers)
    percentile = PERCENTILES.get(str(result["final"]), 50)
    pkg = build_page_content(
        answers=answers,
        result=result,
        percentile=percentile,
        first_name=first_name,
    )
    pkg.setdefault("meta", {})["engine_version"] = "1.0.0"
    return pkg


@pytest.mark.parametrize("slug", FIXTURES)
def test_snapshot(slug: str):
    """Engine output for fixture inputs must match expected snapshots."""
    with (FIXTURES_DIR / f"{slug}_answers.json").open() as f:
        inp = json.load(f)
    with (FIXTURES_DIR / f"{slug}_expected.json").open() as f:
        expected = json.load(f)

    actual = _run_engine(inp["answers"], inp["first_name"])

    # Compare via canonical JSON to ignore key ordering differences
    actual_canonical = json.dumps(actual, sort_keys=True, ensure_ascii=False)
    expected_canonical = json.dumps(expected, sort_keys=True, ensure_ascii=False)

    if actual_canonical != expected_canonical:
        # Print a diff-friendly view to help debugging
        print(f"\n=== {slug} snapshot MISMATCH ===")
        print(f"Expected score: {expected['locked']['score']}, band: {expected['locked']['band']}")
        print(f"Actual   score: {actual['locked']['score']}, band: {actual['locked']['band']}")
        # Find first differing top-level key
        for key in ("locked", "copy", "meta"):
            if json.dumps(actual.get(key), sort_keys=True) != json.dumps(expected.get(key), sort_keys=True):
                print(f"  First differing top-level section: '{key}'")
                break
        pytest.fail(f"{slug} snapshot mismatch — see output for details")


@pytest.mark.parametrize("slug", FIXTURES)
def test_invariants(slug: str):
    """Output structural invariants documented in 03_ENGINE_CONTRACT.md."""
    with (FIXTURES_DIR / f"{slug}_answers.json").open() as f:
        inp = json.load(f)
    pkg = _run_engine(inp["answers"], inp["first_name"])

    # 1. Exactly 5 pillars
    assert len(pkg["locked"]["pillars"]) == 5

    # 2. Pillars sorted descending by value
    values = [p["value"] for p in pkg["locked"]["pillars"]]
    assert values == sorted(values, reverse=True), f"pillars not sorted desc: {values}"

    # 3. Score is in clamped range
    assert 30 <= pkg["locked"]["score"] <= 92

    # 4. Median is 60 (engine constant)
    assert pkg["locked"]["median"] == 60

    # 5. gap_trio has exactly 3 items
    assert len(pkg["copy"]["gap_trio"]) == 3

    # 6. findings has 1, 2, or 3 items
    assert 1 <= len(pkg["copy"]["findings"]) <= 3

    # 7. spectrum_you == locked.score
    assert pkg["copy"]["relativity"]["spectrum_you"] == pkg["locked"]["score"]

    # 8. spectrum_median == locked.median
    assert pkg["copy"]["relativity"]["spectrum_median"] == pkg["locked"]["median"]

    # 9. relativity.mode is one of the documented values
    assert pkg["copy"]["relativity"]["mode"] in ("rank", "gap")

    # 10. Each pillar has the contract-required keys
    for p in pkg["locked"]["pillars"]:
        assert {"label", "value", "goal_linked"}.issubset(p.keys())


def test_no_forbidden_substrings():
    """No string in any content package should contain a forbidden substring."""
    from healthscore_library import FORBIDDEN

    for slug in FIXTURES:
        with (FIXTURES_DIR / f"{slug}_expected.json").open() as f:
            pkg = json.load(f)

        # Walk all string values in the package
        def walk(obj, path="root"):
            if isinstance(obj, str):
                low = obj.lower()
                for forbidden in FORBIDDEN:
                    if forbidden.lower() in low:
                        pytest.fail(f"{slug}: forbidden '{forbidden}' found at {path}: {obj[:120]}")
            elif isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{path}.{k}")
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    walk(v, f"{path}[{i}]")

        walk(pkg)


# CLI support for regenerating snapshots
def update_snapshots():
    for slug in FIXTURES:
        with (FIXTURES_DIR / f"{slug}_answers.json").open() as f:
            inp = json.load(f)
        pkg = _run_engine(inp["answers"], inp["first_name"])
        out_path = FIXTURES_DIR / f"{slug}_expected.json"
        with out_path.open("w") as f:
            json.dump(pkg, f, indent=2, ensure_ascii=False)
        print(f"  updated {out_path.name}  (score={pkg['locked']['score']})")


if __name__ == "__main__":
    if "--update-snapshots" in sys.argv:
        update_snapshots()
    else:
        # Run pytest if invoked directly without args
        sys.exit(pytest.main([__file__, "-v"]))
