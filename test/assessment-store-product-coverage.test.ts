import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileProductRecommendationCoverage } from "../lib/assessment-store.ts";
import type { RecommendedProduct } from "../lib/formulation-types.ts";

function recommendation(input: Readonly<{
  covers: string[];
  productCoveragePercent: number;
  stackContributionPercent: number;
}>): RecommendedProduct {
  return {
    affiliate: false,
    covers: input.covers,
    description: "",
    id: input.covers.join("-"),
    marketplace: "Imported product",
    name: input.covers.join(", "),
    priority: 1,
    productCoveragePercent: input.productCoveragePercent,
    productId: input.covers.join("-"),
    rank: 1,
    stackContributionPercent: input.stackContributionPercent,
    tag: "Best match",
    url: "https://example.com"
  };
}

describe("assessment store product coverage reconciliation", () => {
  it("preserves matcher stack contribution instead of summing overlapping product coverage", () => {
    const result = reconcileProductRecommendationCoverage({
      foodGuidance: [],
      rawNeedCoverage: [
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Magnesium",
          id: "supplement:magnesium",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Vitamin D3",
          id: "supplement:vitamin-d3",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Theanine",
          id: "supplement:theanine",
          itemType: "supplement"
        }
      ],
      recommendations: [
        recommendation({
          covers: ["magnesium", "vitamin-d3"],
          productCoveragePercent: 67,
          stackContributionPercent: 40
        }),
        recommendation({
          covers: ["vitamin-d3", "theanine"],
          productCoveragePercent: 67,
          stackContributionPercent: 35
        }),
        recommendation({
          covers: ["theanine"],
          productCoveragePercent: 33,
          stackContributionPercent: 25
        })
      ],
      supplementBreakdown: [
        {
          category: "Mineral",
          dailyDose: { en: "200 mg/day", th: "200 mg/day" },
          effectivenessRank: 1,
          id: "magnesium",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Magnesium", th: "Magnesium" }
        },
        {
          category: "Vitamin",
          dailyDose: { en: "1000 IU/day", th: "1000 IU/day" },
          effectivenessRank: 2,
          id: "vitamin-d3",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Vitamin D3", th: "Vitamin D3" }
        },
        {
          category: "Amino acid",
          dailyDose: { en: "200 mg/day", th: "200 mg/day" },
          effectivenessRank: 3,
          id: "theanine",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Theanine", th: "Theanine" }
        }
      ]
    });

    assert.deepEqual(
      result.recommendations.map((item) => item.stackContributionPercent),
      [40, 35, 25]
    );
    assert.equal(
      result.recommendations.reduce(
        (total, item) => total + (item.stackContributionPercent ?? 0),
        0
      ),
      100
    );
  });
});
