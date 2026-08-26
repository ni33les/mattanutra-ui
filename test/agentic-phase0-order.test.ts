import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalTargetSetHash } from "../lib/matcher/canonicalizer.ts";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";
import type { CanonicalTarget } from "../lib/matcher/types.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

function officialTargets() {
  return [
    qaTarget("d3", 2000),
    qaTarget("omega", 1000),
    qaTarget("mag", 200),
    qaTarget("b12", 250),
    qaTarget("c", 500)
  ];
}

function permute(targets: CanonicalTarget[], seed: number) {
  const next = [...targets];
  let state = seed >>> 0;

  for (let index = next.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = next[index]!;
    next[index] = next[swap]!;
    next[swap] = current;
  }

  return next;
}

describe("Phase 0 target-order invariance", () => {
  it("prints one canonical target-set hash for 20 official orders", () => {
    const base = officialTargets();
    const hashes = new Set<string>();

    for (let seed = 0; seed < 20; seed += 1) {
      hashes.add(
        canonicalTargetSetHash(
          qaRequest({ optimization: "fewest_pills", targets: permute(base, (seed + 1) * 17) })
        )
      );
    }

    assert.equal(hashes.size, 1);
    assert.equal(
      canonicalTargetSetHash(qaRequest({ optimization: "fewest_pills", targets: [...base].reverse() })),
      [...hashes][0]
    );
  });

  it("keeps official fewest_pills products, pills and coverage across 20 permutations", () => {
    const base = officialTargets();
    const baseline = match(
      qaRequest({ optimization: "fewest_pills", targets: base }),
      QA_GOLD_CATALOG
    );
    assert.ok(baseline.selected);
    const expectedIds = ids(baseline);
    const expectedPills = baseline.selected.dailyPills;
    const expectedCoverage = [...baseline.selected.coverageBySubject.entries()].sort(
      (left, right) => left[0].localeCompare(right[0])
    );

    const permutations = [
      [...base].reverse(),
      [base[3]!, base[4]!, base[0]!, base[1]!, base[2]!],
      [base[4]!, base[3]!, base[2]!, base[1]!, base[0]!],
      ...Array.from({ length: 20 }, (_, seed) => permute(base, (seed + 1) * 17))
    ];

    for (const [index, targets] of permutations.entries()) {
      const result = match(
        qaRequest({ optimization: "fewest_pills", targets }),
        QA_GOLD_CATALOG
      );
      assert.deepEqual(ids(result), expectedIds, `perm ${index}`);
      assert.equal(result.selected?.dailyPills, expectedPills, `perm ${index} pills`);
      const coverage = [...(result.selected?.coverageBySubject.entries() ?? [])].sort(
        (left, right) => left[0].localeCompare(right[0])
      );
      assert.deepEqual(coverage, expectedCoverage, `perm ${index} coverage`);
    }
  });
});
