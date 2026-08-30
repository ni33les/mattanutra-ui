import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coveredFormulaNeedCount,
  formulaNeedCount,
  marketingCoveragePercentFromNeedCoverage
} from "../lib/marketing-coverage.ts";
import {
  stackCoveragePercent,
  unweightedStackCoveragePercent
} from "../lib/product-recommendation-metrics.ts";
import type { ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";

function need(
  id: string,
  weight: number,
  itemType: ProductRecommendationNeed["itemType"] = "supplement"
): ProductRecommendationNeed {
  return {
    category: "Supplement",
    displayName: id,
    id,
    itemType,
    normalizedName: id,
    sourceId: id,
    targetComparableAmount: 1,
    targetDose: null,
    targetText: "1 mg/day",
    weight
  };
}

describe("marketing coverage is unweighted", () => {
  it("averages formula nutrients equally even when rank weights differ", () => {
    const coverage = new Map<string, number>([
      ["vitamin-d3", 0],
      ["omega-3", 1],
      ["magnesium", 1],
      ["vitamin-b12", 0],
      ["coq10", 1],
      ["vitamin-c", 1],
      ["zinc", 1],
      ["creatine", 1]
    ]);
    const needs = [
      need("vitamin-d3", 7),
      need("omega-3", 6),
      need("magnesium", 5),
      need("vitamin-b12", 4),
      need("coq10", 3),
      need("vitamin-c", 2),
      need("zinc", 1),
      need("creatine", 1)
    ];

    assert.equal(Math.round(stackCoveragePercent(coverage, needs)), 62);
    assert.equal(Math.round(unweightedStackCoveragePercent(coverage, needs)), 75);
    assert.equal(
      marketingCoveragePercentFromNeedCoverage([
        { coveragePercent: 0, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 0, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" }
      ]),
      75
    );
  });

  it("ignores food rows in the marketing average", () => {
    assert.equal(
      marketingCoveragePercentFromNeedCoverage([
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 0, itemType: "food" }
      ]),
      100
    );
  });

  it("matches the live reveal table: equal average 82%, and any positive coverage counts", () => {
    const needs = [
      { coveragePercent: 60, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" },
      { coveragePercent: 88, itemType: "supplement" },
      { coveragePercent: 2, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" },
      { coveragePercent: 66, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" },
      { coveragePercent: 100, itemType: "supplement" }
    ];

    assert.equal(formulaNeedCount(needs), 10);
    assert.equal(marketingCoveragePercentFromNeedCoverage(needs), 82);
    assert.equal(coveredFormulaNeedCount(needs), 10);
  });
});
