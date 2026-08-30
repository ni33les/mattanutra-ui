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

  it("does not invent 100% need coverage from a covers list when matcher diagnostics are empty", () => {
    const result = reconcileProductRecommendationCoverage({
      foodGuidance: [],
      rawNeedCoverage: [],
      storedStackCoveragePercent: 20,
      recommendations: [
        recommendation({
          covers: [
            "vitamin-d3",
            "omega-3",
            "magnesium",
            "creatine"
          ],
          productCoveragePercent: 20,
          stackContributionPercent: 20
        })
      ],
      supplementBreakdown: [
        {
          category: "Vitamin",
          dailyDose: { en: "50 mcg/day", th: "50 mcg/day" },
          effectivenessRank: 1,
          id: "vitamin-d3",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Vitamin D3", th: "Vitamin D3" }
        },
        {
          category: "Mineral",
          dailyDose: { en: "300 mg/day", th: "300 mg/day" },
          effectivenessRank: 2,
          id: "magnesium",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Magnesium", th: "Magnesium" }
        },
        {
          category: "Amino acid",
          dailyDose: { en: "3000 mg/day", th: "3000 mg/day" },
          effectivenessRank: 3,
          id: "creatine",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Creatine", th: "Creatine" }
        }
      ]
    });

    assert.equal(result.stackCoveragePercent, 20);
    assert.equal(
      result.needCoverage.every((item) => item.coveragePercent === 0),
      true
    );
    assert.equal(result.recommendations[0]?.stackCoveragePercent, 20);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 20);
  });

  it("publishes unweighted formula coverage for marketing when rank weights differ", () => {
    const result = reconcileProductRecommendationCoverage({
      foodGuidance: [],
      rawNeedCoverage: [
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 0,
          displayName: "Vitamin D3",
          id: "supplement:vitamin-d3",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Omega-3",
          id: "supplement:omega-3",
          itemType: "supplement"
        },
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
          coveragePercent: 0,
          displayName: "Vitamin B12",
          id: "supplement:vitamin-b12",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "CoQ10",
          id: "supplement:coq10",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Vitamin C",
          id: "supplement:vitamin-c",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Zinc",
          id: "supplement:zinc",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 100,
          displayName: "Creatine",
          id: "supplement:creatine",
          itemType: "supplement"
        }
      ],
      storedStackCoveragePercent: 62,
      recommendations: [
        recommendation({
          covers: ["omega-3"],
          productCoveragePercent: 21,
          stackContributionPercent: 21
        })
      ],
      supplementBreakdown: [
        {
          category: "Vitamin",
          dailyDose: { en: "2000 IU/day", th: "2000 IU/day" },
          effectivenessRank: 1,
          id: "vitamin-d3",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Vitamin D3", th: "Vitamin D3" }
        },
        {
          category: "Fatty acid",
          dailyDose: { en: "1000 mg/day", th: "1000 mg/day" },
          effectivenessRank: 2,
          id: "omega-3",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Omega-3", th: "Omega-3" }
        },
        {
          category: "Mineral",
          dailyDose: { en: "200 mg/day", th: "200 mg/day" },
          effectivenessRank: 3,
          id: "magnesium",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Magnesium", th: "Magnesium" }
        },
        {
          category: "Vitamin",
          dailyDose: { en: "500 mcg/day", th: "500 mcg/day" },
          effectivenessRank: 4,
          id: "vitamin-b12",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Vitamin B12", th: "Vitamin B12" }
        },
        {
          category: "Targeted",
          dailyDose: { en: "100 mg/day", th: "100 mg/day" },
          effectivenessRank: 5,
          id: "coq10",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "CoQ10", th: "CoQ10" }
        },
        {
          category: "Vitamin",
          dailyDose: { en: "500 mg/day", th: "500 mg/day" },
          effectivenessRank: 6,
          id: "vitamin-c",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Vitamin C", th: "Vitamin C" }
        },
        {
          category: "Mineral",
          dailyDose: { en: "15 mg/day", th: "15 mg/day" },
          effectivenessRank: 7,
          id: "zinc",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Zinc", th: "Zinc" }
        },
        {
          category: "Amino acid",
          dailyDose: { en: "3 g/day", th: "3 g/day" },
          effectivenessRank: 8,
          id: "creatine",
          rationale: { en: "", th: "" },
          status: "add",
          supplement: { en: "Creatine", th: "Creatine" }
        }
      ]
    });

    assert.equal(result.stackCoveragePercent, 75);
  });
});
