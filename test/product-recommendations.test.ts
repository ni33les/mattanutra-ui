import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProductNeeds,
  buildProductSearchQueries,
  normalizeProductFactKey,
  productFactAliasKeys,
  productFactLooksLikeConcentration,
  productKeysMatch,
  recommendProductStack,
  recommendProductStackFullBeam,
  recommendProductStackV2,
  type ProductCandidate,
  type ProductRecommendationNeed
} from "../lib/product-recommendations.ts";

function need(
  id: string,
  name: string,
  weight: number,
  targetComparableAmount = 1000,
  itemType: ProductRecommendationNeed["itemType"] = "supplement"
): ProductRecommendationNeed {
  return {
    category: itemType === "food" ? "Food" : "Supplement",
    displayName: name,
    id,
    itemType,
    normalizedName: name.toLowerCase().replace(/\s+/g, "_"),
    sourceId: id,
    targetComparableAmount,
    targetDose: null,
    targetText: "1 mg/day",
    weight
  };
}

function product(input: Readonly<{
  affiliate?: boolean;
  amount: number;
  audience?: ProductCandidate["productAudience"];
  factAudience?: NonNullable<ProductCandidate["facts"][number]["supplementAudience"]>;
  id: string;
  maxAmount?: number | null;
  maxUnit?: string | null;
  name: string;
  status?: ProductCandidate["status"];
  priceAmount?: number | null;
  servingLabel?: string | null;
}>): ProductCandidate {
  return {
    activeOfferId: input.affiliate ? `${input.id}-affiliate` : null,
    activeAffiliateUrl: input.affiliate ? `https://affiliate.example/${input.id}` : null,
    affiliateStatus: input.affiliate ? "active" : "none",
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    brandStatus: "approved",
    currency: "THB",
    facts: [
      {
        amount: input.amount,
        comparableAmount: input.amount * 1000,
        confidence: "high",
        itemType: "supplement",
        maxAmount: input.maxAmount ?? null,
        maxUnit: input.maxUnit ?? "mg",
        name: input.name,
        normalizedName: input.name.toLowerCase().replace(/\s+/g, "_"),
        servingLabel: input.servingLabel ?? null,
        supplementAudience: input.factAudience ?? "both",
        unit: "mg"
      }
    ],
    id: input.id,
    labelStatus: "parsed",
    status: input.status ?? "approved",
    platform: "shopee",
    productAudience: input.audience ?? "both",
    priceAmount: input.priceAmount ?? 100,
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    title: input.name
  };
}

describe("product recommendation scoring", () => {
  it("builds product needs from every visible supplement status", () => {
    const needs = buildProductNeeds({
      foodGuidance: null,
      formulation: {
        supplementBreakdown: [
          {
            category: "Fatty Acids",
            dailyDose: { en: "1000 mg/day", th: "1000 mg/day" },
            effectivenessRank: 1,
            id: "omega-3",
            rationale: { en: "Supports low fish intake.", th: "Supports low fish intake." },
            status: "covered",
            supplement: { en: "Omega-3", th: "Omega-3" }
          },
          {
            category: "Minerals",
            dailyDose: { en: "300 mg/day", th: "300 mg/day" },
            effectivenessRank: 2,
            id: "magnesium",
            rationale: { en: "Supports recovery.", th: "Supports recovery." },
            status: "add",
            supplement: { en: "Magnesium", th: "Magnesium" }
          },
          {
            category: "Herbals",
            dailyDose: { en: "300 mg/day", th: "300 mg/day" },
            effectivenessRank: 3,
            id: "ashwagandha",
            rationale: { en: "Supports calm.", th: "Supports calm." },
            safety: {
              action: "human_review",
              message: { en: "Hidden review.", th: "Hidden review." },
              visibility: "hidden"
            },
            status: "review",
            supplement: { en: "Ashwagandha", th: "Ashwagandha" }
          }
        ]
      }
    });

    assert.deepEqual(
      needs.map((item) => item.sourceId),
      ["omega-3", "magnesium"]
    );
  });

  it("builds broad product search queries instead of exact dose strings", () => {
    const queries = buildProductSearchQueries([
      need("vitamin_d", "Vitamin D3", 7, 1000),
      need("coq10", "CoQ10", 6, 1000),
      need("chia", "Chia Seeds", 5, 0, "food")
    ]);

    assert.equal(queries.includes("multivitamin"), true);
    assert.equal(queries.includes("vitamin d3"), true);
    assert.equal(queries.includes("coenzyme q10"), true);
    assert.equal(queries.includes("chia seeds"), false);
    assert.equal(queries.includes("chia seeds supplement"), false);
    assert.equal(
      queries.some((query) => /\d+\s*(mg|mcg|iu)/i.test(query)),
      false
    );
  });

  it("selects nutritional coverage over affiliate-only matches", () => {
    const result = recommendProductStack({
      candidates: [
        product({ affiliate: true, amount: 0.2, id: "affiliate", name: "Magnesium" }),
        product({ amount: 1, id: "best", name: "Magnesium" })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "best");
    assert.equal(result.stackCoveragePercent, 100);
  });

  it("uses affiliate links as a tie-breaker for equivalent safe products", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 1, id: "plain", name: "Vitamin D" }),
        product({ affiliate: true, amount: 1, id: "affiliate", name: "Vitamin D" })
      ],
      needs: [need("vitamin_d", "Vitamin D", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "affiliate");
  });

  it("does not recommend women-only products to male clients", () => {
    const result = recommendProductStack({
      candidates: [
        product({
          amount: 1,
          audience: "female",
          id: "conceive-well",
          name: "Folate"
        }),
        product({
          amount: 0.8,
          audience: "both",
          id: "general-folate",
          name: "Folate"
        })
      ],
      clientSex: "male",
      needs: [need("folate", "Folate", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "general-folate");
    assert.equal(
      result.exclusions.some(
        (item) =>
          item.productId === "conceive-well" &&
          item.reason === "Product is for women only"
      ),
      true
    );
  });

  it("allows women-only products for female clients", () => {
    const result = recommendProductStack({
      candidates: [
        product({
          amount: 1,
          audience: "female",
          id: "conceive-well",
          name: "Folate"
        })
      ],
      clientSex: "female",
      needs: [need("folate", "Folate", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "conceive-well");
  });

  it("caps stack size and avoids double-counting duplicate coverage", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 1, id: "one", name: "Zinc" }),
        product({ amount: 1, id: "two", name: "Zinc" }),
        product({ amount: 1, id: "three", name: "Zinc" }),
        product({ amount: 1, id: "four", name: "Zinc" }),
        product({ amount: 1, id: "five", name: "Zinc" }),
        product({ amount: 1, id: "six", name: "Zinc" }),
        product({ amount: 1, id: "seven", name: "Zinc" })
      ],
      maxProducts: 6,
      needs: [need("zinc", "Zinc", 5)]
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.stackCoveragePercent, 100);
  });

  it("continues past the target count when another product covers an unmatched need", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 1, id: "one", name: "Vitamin D" }),
        product({ amount: 1, id: "two", name: "Magnesium" }),
        product({ amount: 1, id: "three", name: "Glucosamine" }),
        product({ amount: 0.75, id: "four", name: "Ashwagandha" })
      ],
      maxProducts: 6,
      needs: [
        need("vitamin_d", "Vitamin D", 10),
        need("magnesium", "Magnesium", 10),
        need("glucosamine", "Glucosamine", 10),
        need("ashwagandha", "Ashwagandha", 1)
      ],
      targetProducts: 3
    });
    const recommendedIds = result.recommendations.map((item) => item.product.id);

    assert.deepEqual(new Set(recommendedIds), new Set(["one", "two", "three", "four"]));
  });

  it("skips weak top-ups after the target count to cover an unmet need", () => {
    const noisyWeakTopUp: ProductCandidate = {
      ...product({ amount: 0.95, id: "weak-top-up", name: "Vitamin D" }),
      facts: [
        ...product({ amount: 0.95, id: "weak-top-up", name: "Vitamin D" }).facts,
        ...Array.from({ length: 40 }, (_, index) => ({
          amount: 1,
          comparableAmount: 1000,
          confidence: "high" as const,
          itemType: "supplement" as const,
          name: `Extra ${index}`,
          normalizedName: `extra_${index}`,
          unit: "mg"
        }))
      ]
    };
    const result = recommendProductStack({
      candidates: [
        product({ amount: 0.85, id: "one", name: "Vitamin D" }),
        product({ amount: 0.9, id: "two", name: "Magnesium" }),
        product({ amount: 0.9, id: "three", name: "Omega-3" }),
        noisyWeakTopUp,
        product({ amount: 1, id: "ashwagandha", name: "Ashwagandha" })
      ],
      maxProducts: 6,
      needs: [
        need("vitamin_d", "Vitamin D", 10),
        need("magnesium", "Magnesium", 10),
        need("omega_3", "Omega-3", 10),
        need("ashwagandha", "Ashwagandha", 1)
      ],
      targetProducts: 3
    });
    const recommendedIds = result.recommendations.map((item) => item.product.id);

    assert.equal(recommendedIds.includes("ashwagandha"), true);
    assert.equal(recommendedIds.includes("weak-top-up"), false);
  });

  it("keeps low-priority requested needs visible when a valid product exists", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 1, id: "one", name: "Vitamin D" }),
        product({ amount: 1, id: "two", name: "Magnesium" }),
        product({ amount: 1, id: "three", name: "Omega-3" }),
        product({ amount: 1, id: "four", name: "Ashwagandha" }),
        product({ amount: 1, id: "five", name: "Multi-strain probiotics" }),
        product({ amount: 0.25, id: "six", name: "L-Theanine" })
      ],
      needs: [
        need("vitamin_d", "Vitamin D", 10),
        need("magnesium", "Magnesium", 10),
        need("omega_3", "Omega-3", 10),
        need("ashwagandha", "Ashwagandha", 4),
        need("multi_strain_probiotics", "Multi-strain probiotics", 2),
        need("theanine", "Theanine", 1)
      ],
      targetProducts: 3
    });

    assert.equal(
      result.recommendations.some((item) => item.product.id === "six"),
      true
    );
    assert.equal(
      result.diagnostics.matchedNeeds.some((item) => item.id === "theanine"),
      true
    );
  });

  it("excludes ignored and missing-label products", () => {
    const missingFacts = {
      ...product({ amount: 1, id: "missing", name: "Iron" }),
      facts: [],
      labelStatus: "missing" as const
    };
    const blocked = product({
      amount: 1,
      id: "blocked",
      name: "Iron",
      status: "ignored"
    });
    const result = recommendProductStack({
      candidates: [missingFacts, blocked],
      needs: [need("iron", "Iron", 5)]
    });

    assert.equal(result.recommendations.length, 0);
    assert.equal(result.exclusions.length, 2);
  });

  it("keeps unapproved products out of customer recommendations", () => {
    const result = recommendProductStack({
      candidates: [
        product({
          amount: 1,
          id: "unknown",
          name: "CoQ10",
          status: "pending_review"
        })
      ],
      needs: [need("coq10", "CoQ10", 5)]
    });

    assert.equal(result.recommendations.length, 0);
    assert.equal(result.exclusions[0]?.reason, "Product is not approved yet");
  });

  it("keeps review-required product validation out of matching", () => {
    const result = recommendProductStack({
      candidates: [
        {
          ...product({ amount: 1, id: "dirty", name: "Curcumin" }),
          validation: {
            checkedAt: new Date().toISOString(),
            matchableFactCount: 0,
            reasons: ["dirty_name"],
            status: "needs_review",
            summary: "Product facts need cleanup before matching."
          }
        }
      ],
      needs: [need("curcumin", "Curcumin", 5)]
    });

    assert.equal(result.recommendations.length, 0);
    assert.match(result.exclusions[0]?.reason ?? "", /validation/i);
  });

  it("keeps food needs out of product matching coverage", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 1, id: "d3", name: "Vitamin D" })
      ],
      needs: [
        need("vitamin_d", "Vitamin D", 5),
        need("chia", "Chia Seeds", 5, 1000, "food")
      ]
    });

    assert.equal(result.stackCoveragePercent, 100);
    assert.equal(result.supplementProductCoveragePercent, 100);
    assert.equal(result.foodCoveragePercent, 0);
    assert.equal(result.totalPlanCoveragePercent, 100);
    assert.equal(result.clientNeeds.some((item) => item.itemType === "food"), false);
    assert.equal(result.diagnostics.unmatchedNeeds.length, 0);
  });

  it("allows approved multis with safe extra ingredients as a loose fit", () => {
    const fact = (id: string, name: string) =>
      product({ amount: 1, id, name }).facts[0]!;
    const multi: ProductCandidate = {
      ...product({ amount: 1, id: "multi", name: "Magnesium" }),
      facts: [
        fact("multi-magnesium", "Magnesium"),
        fact("multi-zinc", "Zinc"),
        fact("multi-vitamin-c", "Vitamin C"),
        fact("multi-b12", "Vitamin B12"),
        fact("multi-folate", "Folate"),
        fact("multi-selenium", "Selenium")
      ],
      productKind: "multi"
    };
    const result = recommendProductStack({
      candidates: [multi],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "multi");
    assert.equal(result.stackCoveragePercent, 100);
  });

  it("strips potency artefacts from fact names without treating them as per-serving dose", () => {
    const potencyOnly: ProductCandidate = {
      ...product({ amount: 1, id: "potency", name: "Vitamin D3" }),
      facts: [
        {
          amount: 100000,
          comparableAmount: null,
          confidence: "high",
          itemType: "supplement",
          name: "Vitamin D3 100000 IU/g",
          normalizedName: "vitamin_d3_100000_iu_g",
          unit: "iu"
        }
      ]
    };
    const perServingDose: ProductCandidate = {
      ...product({ amount: 0.025, id: "serving-dose", name: "Vitamin D3" }),
      facts: [
        {
          amount: 25,
          comparableAmount: 25,
          confidence: "high",
          itemType: "supplement" as const,
          name: "Vitamin D3",
          normalizedName: "vitamin_d3",
          unit: "mcg"
        }
      ]
    };

    const result = recommendProductStack({
      candidates: [potencyOnly, perServingDose],
      needs: [need("vitamin_d", "Vitamin D", 7, 25)]
    });
    const potencyOnlyResult = recommendProductStack({
      candidates: [potencyOnly],
      needs: [need("vitamin_d", "Vitamin D", 7, 25)]
    });

    assert.equal(productFactLooksLikeConcentration("Vitamin D3 100000 IU/g"), true);
    assert.equal(productFactLooksLikeConcentration("Theanine 50 mg per capsule"), false);
    assert.equal(normalizeProductFactKey("Vitamin D3 100000 IU/g"), "vitamin_d3");
    assert.equal(normalizeProductFactKey("Vitamin B12 0.1%"), "vitamin_b12");
    assert.equal(normalizeProductFactKey("Ferrous fumarate 60%"), "ferrous_fumarate");
    assert.equal(
      normalizeProductFactKey("Nicotinamide (33.3%)"),
      "nicotinamide"
    );
    assert.equal(result.recommendations[0]?.product.id, "serving-dose");
    assert.equal(potencyOnlyResult.recommendations.length, 0);
    assert.equal(potencyOnlyResult.stackCoveragePercent, 0);
  });

  it("matches curated ingredient aliases and bounded typos", () => {
    const result = recommendProductStack({
      candidates: [
        product({ amount: 0.025, id: "d3-form", name: "Cholecalciferol" }),
        product({
          amount: 0.05,
          id: "theanine-form",
          name: "Theanine (AlphaWave L-theanine)"
        }),
        product({
          amount: 0.14,
          id: "dha-form",
          name: "Docosahexaenoic acid (DHA)-rich oil"
        }),
        product({ amount: 1, id: "typo", name: "Magnesum" })
      ],
      needs: [
        need("vitamin_d", "Vitamin D", 7, 25),
        need("theanine", "Theanine", 4, 50),
        need("omega_3", "Omega-3", 4, 140),
        need("magnesium", "Magnesium", 5)
      ]
    });

    assert.equal(productKeysMatch("L-Theanine", "Theanine"), true);
    assert.equal(
      productKeysMatch("Docosahexaenoic acid (DHA)-rich oil", "Omega-3"),
      true
    );
    assert.equal(
      productFactAliasKeys("Theanine (AlphaWave L-theanine)").includes("l_theanine"),
      true
    );
    assert.equal(productKeysMatch("Ashwaganda root extract", "Ashwagandha"), true);
    assert.equal(productKeysMatch("Curacumin", "Curcumin"), true);
    assert.equal(productKeysMatch("Probiotic blend", "Multi-strain probiotics"), true);
    assert.equal(productKeysMatch("Glutamine", "L-Glutamine"), true);
    assert.equal(productKeysMatch("Magnesium bisglycinate", "Magnesium"), true);
    assert.equal(
      result.recommendations.some((item) => item.product.id === "d3-form"),
      true
    );
    assert.equal(
      result.recommendations.some((item) => item.product.id === "theanine-form"),
      true
    );
    assert.equal(
      result.recommendations.some((item) => item.product.id === "dha-form"),
      true
    );
    assert.equal(
      result.recommendations.some((item) => item.product.id === "typo"),
      true
    );
  });

  it("keeps the expected-hit regression set matchable", () => {
    const expected = [
      ["magnesium", "Magnesium"],
      ["vitamin_d3", "Vitamin D3"],
      ["omega_3", "Omega-3"],
      ["curcumin", "Curcumin"],
      ["ashwagandha", "Ashwagandha"],
      ["multi_strain_probiotics", "Multi-strain probiotics"],
      ["theanine", "Theanine"],
      ["l_glutamine", "L-Glutamine"],
      ["coq10", "CoQ10"],
      ["zinc", "Zinc"],
      ["b_complex", "B Complex"],
      ["multivitamin", "Multivitamin"]
    ] as const;
    const result = recommendProductStack({
      candidates: expected.map(([id, name]) =>
        product({ amount: 1, id: `product-${id}`, name })
      ),
      maxProducts: 6,
      needs: expected.map(([id, name], index) =>
        need(id, name, expected.length - index)
      )
    });
    const recommendedIds = new Set(
      result.recommendations.map((item) => item.product.id)
    );

    assert.equal(result.recommendations.length, 6);
    assert.equal(recommendedIds.has("product-magnesium"), true);
    assert.equal(recommendedIds.has("product-vitamin_d3"), true);
    assert.equal(recommendedIds.has("product-omega_3"), true);
    assert.equal(result.diagnostics.nearMisses.length > 0, true);
  });

  it("does not let fuzzy matching confuse compound salts with a different mineral need", () => {
    const result = recommendProductStack({
      candidates: [
        product({
          amount: 1,
          id: "pantothenate",
          name: "Calcium Pantothenate"
        })
      ],
      needs: [need("calcium", "Calcium", 5)]
    });

    assert.equal(result.recommendations.length, 0);
  });
});

describe("product recommendation scoring v2 exact shortlist", () => {
  it("uses full-beam as the active default matcher and emits v2 diagnostics", () => {
    const result = recommendProductStack({
      candidates: [product({ amount: 1, id: "magnesium", name: "Magnesium" })],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.diagnostics.algorithmVersion, "v2-full-beam");
    assert.equal(result.recommendations[0]?.product.id, "magnesium");
  });

  it("can recommend multiple servings when a safe single product underdoses a need", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.25,
          id: "low-dose-magnesium",
          maxAmount: 5000,
          name: "Magnesium",
          servingLabel: "1 capsule"
        })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "low-dose-magnesium");
    assert.equal(result.recommendations[0]?.servingMultiplier, 3);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 75);
    assert.match(result.recommendations[0]?.why ?? "", /Use 3 servings/i);
  });

  it("does not multiply a label dose when serving metadata is missing", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.25,
          id: "low-dose-no-serving",
          maxAmount: 5000,
          name: "Magnesium"
        })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "low-dose-no-serving");
    assert.equal(result.recommendations[0]?.servingMultiplier, 1);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 25);
    assert.doesNotMatch(result.recommendations[0]?.why ?? "", /Use 2|Use 3/i);
  });

  it("does not treat an undosed ingredient name as coverage when the formula has a target dose", () => {
    const undosed = product({
      amount: 0,
      id: "undosed-taurine",
      name: "Taurine"
    });
    const result = recommendProductStackFullBeam({
      candidates: [
        {
          ...undosed,
          facts: [{
            ...undosed.facts[0]!,
            amount: null,
            comparableAmount: null,
            unit: null
          }]
        }
      ],
      needs: [need("taurine", "Taurine", 5)]
    });

    assert.equal(result.recommendations.length, 0);
    assert.equal(result.diagnostics.unmatchedNeeds[0]?.coveragePercent, 0);
    assert.equal(
      result.diagnostics.unmatchedNeeds[0]?.bestRejectedReason,
      "No approved product in the catalogue covers this need"
    );
  });

  it("prefers safe multiple servings over stacking separate products for the same need", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.5,
          id: "single-low-dose",
          maxAmount: 5000,
          maxUnit: "mg/day",
          name: "Magnesium",
          servingLabel: "1 capsule"
        }),
        product({
          amount: 0.5,
          id: "second-low-dose",
          maxAmount: 5000,
          maxUnit: "mg/day",
          name: "Magnesium",
          servingLabel: "1 capsule"
        })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0]?.servingMultiplier, 2);
    assert.equal(result.recommendations[0]?.stackContributionPercent, 100);
  });

  it("prefers one serving over three when coverage is materially similar", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.92,
          id: "simple-magnesium",
          name: "Magnesium"
        }),
        product({
          amount: 0.33,
          id: "three-serving-magnesium",
          maxAmount: 5000,
          maxUnit: "mg/day",
          name: "Magnesium",
          servingLabel: "1 capsule"
        })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "simple-magnesium");
    assert.equal(result.recommendations[0]?.servingMultiplier, 1);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 92);
  });

  it("allows three servings when they unlock a material coverage gain", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.8,
          id: "simple-magnesium",
          name: "Magnesium"
        }),
        product({
          amount: 0.32,
          id: "three-serving-magnesium",
          maxAmount: 5000,
          maxUnit: "mg/day",
          name: "Magnesium",
          servingLabel: "1 capsule"
        })
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "three-serving-magnesium");
    assert.equal(result.recommendations[0]?.servingMultiplier, 3);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 96);
  });

  it("supports compact and balanced stack preferences", () => {
    const multi: ProductCandidate = {
      ...product({ amount: 0.98, id: "near-complete-multi", name: "Vitamin D" }),
      facts: [
        product({ amount: 0.98, id: "multi-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 0.98, id: "multi-mag", name: "Magnesium" }).facts[0]!
      ],
      productKind: "multi"
    };
    const candidates = [
      multi,
      product({ amount: 1, id: "perfect-d3", name: "Vitamin D" }),
      product({ amount: 1, id: "perfect-magnesium", name: "Magnesium" })
    ];
    const needs = [
      need("vitamin_d", "Vitamin D", 8),
      need("magnesium", "Magnesium", 8)
    ];
    const compact = recommendProductStackFullBeam({
      candidates,
      needs,
      stackPreference: "compact"
    });
    const balanced = recommendProductStackFullBeam({
      candidates,
      needs,
      stackPreference: "balanced"
    });

    assert.deepEqual(
      compact.recommendations.map((item) => item.product.id),
      ["near-complete-multi"]
    );
    assert.equal(compact.supplementProductCoveragePercent, 98);
    assert.equal(balanced.supplementProductCoveragePercent, 100);
    assert.equal(balanced.recommendations.length, 2);
    assert.equal(compact.diagnostics.stackPreference, "compact");
    assert.equal(balanced.diagnostics.stackPreference, "balanced");
  });

  it("keeps balanced mode focused on maximum supplement coverage", () => {
    const broad: ProductCandidate = {
      ...product({ amount: 1, id: "broad-multi", name: "Vitamin D" }),
      facts: [
        product({ amount: 1, id: "broad-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 1, id: "broad-mag", name: "Magnesium" }).facts[0]!
      ],
      productKind: "multi"
    };
    const candidates = [
      broad,
      product({ amount: 1, id: "perfect-b12", name: "Vitamin B12" })
    ];
    const needs = [
      need("vitamin_d", "Vitamin D", 10),
      need("magnesium", "Magnesium", 10),
      need("b12", "Vitamin B12", 1)
    ];
    const result = recommendProductStackFullBeam({
      candidates,
      needs,
      stackPreference: "balanced"
    });

    assert.deepEqual(
      result.recommendations.map((item) => item.product.id).sort(),
      ["broad-multi", "perfect-b12"]
    );
    assert.equal(result.supplementProductCoveragePercent, 100);
  });

  it("lets compact mode trade some coverage for a smaller stack", () => {
    const broad: ProductCandidate = {
      ...product({ amount: 0.67, id: "broad-multi", name: "Vitamin D" }),
      facts: [
        product({ amount: 0.67, id: "broad-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 0.67, id: "broad-mag", name: "Magnesium" }).facts[0]!,
        product({ amount: 0.67, id: "broad-zinc", name: "Zinc" }).facts[0]!
      ],
      productKind: "multi"
    };
    const candidates = [
      broad,
      product({ amount: 1, id: "perfect-d3", name: "Vitamin D" }),
      product({ amount: 1, id: "perfect-magnesium", name: "Magnesium" }),
      product({ amount: 1, id: "perfect-zinc", name: "Zinc" })
    ];
    const needs = [
      need("vitamin_d", "Vitamin D", 5),
      need("magnesium", "Magnesium", 5),
      need("zinc", "Zinc", 5)
    ];
    const compact = recommendProductStackFullBeam({
      candidates,
      needs,
      stackPreference: "compact"
    });
    const balanced = recommendProductStackFullBeam({
      candidates,
      needs,
      stackPreference: "balanced"
    });

    assert.deepEqual(
      compact.recommendations.map((item) => item.product.id),
      ["broad-multi"]
    );
    assert.equal(compact.supplementProductCoveragePercent, 67);
    assert.equal(balanced.supplementProductCoveragePercent, 100);
    assert.equal(balanced.recommendations.length, 3);
  });

  it("reports distinct alternative stack fingerprints", () => {
    const broad: ProductCandidate = {
      ...product({ amount: 0.67, id: "broad-multi", name: "Vitamin D" }),
      facts: [
        product({ amount: 0.67, id: "broad-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 0.67, id: "broad-mag", name: "Magnesium" }).facts[0]!,
        product({ amount: 0.67, id: "broad-zinc", name: "Zinc" }).facts[0]!
      ],
      productKind: "multi"
    };
    const result = recommendProductStackFullBeam({
      candidates: [
        broad,
        product({ amount: 1, id: "perfect-d3", name: "Vitamin D" }),
        product({ amount: 1, id: "perfect-magnesium", name: "Magnesium" }),
        product({ amount: 1, id: "perfect-zinc", name: "Zinc" }),
        product({ amount: 1, id: "backup-zinc", name: "Zinc" })
      ],
      needs: [
        need("vitamin_d", "Vitamin D", 5),
        need("magnesium", "Magnesium", 5),
        need("zinc", "Zinc", 5)
      ]
    });
    const alternatives = result.diagnostics.trace?.alternativeStacks ?? [];
    const fingerprints = alternatives.map((stack) =>
      [...stack.productIds].sort().join("|")
    );

    assert.equal(new Set(fingerprints).size, fingerprints.length);
    assert.ok(alternatives.length > 0);
  });

  it("does not add a second product only to top up an already adequate need", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.8,
          id: "adequate-primary",
          name: "Vitamin D"
        }),
        product({
          amount: 0.4,
          id: "duplicate-top-up",
          name: "Vitamin D"
        })
      ],
      needs: [need("vitamin_d", "Vitamin D", 5)]
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0]?.product.id, "adequate-primary");
    assert.equal(result.recommendations[0]?.stackContributionPercent, 80);
  });

  it("does not add a second product only to top up the same unmet need", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 0.6,
          id: "curcumin-primary",
          name: "Curcumin"
        }),
        product({
          amount: 0.6,
          id: "curcumin-top-up",
          name: "Curcumin"
        })
      ],
      maxProducts: 6,
      needs: [need("curcumin", "Curcumin", 5)]
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0]?.product.id, "curcumin-primary");
    assert.equal(result.recommendations[0]?.stackContributionPercent, 60);
  });

  it("does not add tiny low-priority partial matches to a useful stack", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({ amount: 1, id: "coq10-full", name: "CoQ10" }),
        product({ amount: 1, id: "omega-full", name: "Omega-3" }),
        product({ amount: 0.12, id: "creatine-tiny", name: "Creatine" })
      ],
      maxProducts: 6,
      needs: [
        need("coq10", "CoQ10", 7),
        need("omega_3", "Omega-3", 6),
        need("creatine", "Creatine", 2)
      ]
    });

    assert.deepEqual(
      result.recommendations.map((item) => item.product.id),
      ["coq10-full", "omega-full"]
    );
    assert.equal(result.stackCoveragePercent, 87);
  });

  it("does not increase serving count when another fact would exceed its safety limit", () => {
    const base = product({
      amount: 0.25,
      id: "combo",
      maxAmount: 5000,
      name: "Magnesium",
      servingLabel: "1 capsule"
    });
    const result = recommendProductStackFullBeam({
      candidates: [
        {
          ...base,
          facts: [
            base.facts[0]!,
            {
              amount: 1,
              comparableAmount: 1000,
              confidence: "high",
              itemType: "supplement",
              maxAmount: 2,
              maxUnit: "mg",
              name: "Iron",
              normalizedName: "iron",
              supplementAudience: "both",
              unit: "mg"
            }
          ]
        }
      ],
      needs: [need("magnesium", "Magnesium", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "combo");
    assert.equal(result.recommendations[0]?.servingMultiplier, 2);
    assert.equal(result.recommendations[0]?.productCoveragePercent, 50);
  });

  it("reports safety-blocked products as the reason an unmet need has no coverage", () => {
    const ashwagandha: ProductCandidate = {
      ...product({ amount: 1, id: "ashwagandha", name: "Ashwagandha" }),
      facts: [
        {
          ...product({ amount: 1, id: "ashwagandha", name: "Ashwagandha" }).facts[0]!,
          safetyFlags: ["pregnancy_caution"]
        }
      ]
    };
    const result = recommendProductStackFullBeam({
      candidates: [ashwagandha],
      clientContext: { lifestage: "ttc" },
      needs: [need("ashwagandha", "Ashwagandha", 5)]
    });
    const unmatched = result.diagnostics.unmatchedNeeds[0];

    assert.equal(result.recommendations.length, 0);
    assert.equal(unmatched?.id, "ashwagandha");
    assert.equal(unmatched?.bestRejectedProductId, "ashwagandha");
    assert.match(
      unmatched?.bestRejectedReason ?? "",
      /pregnancy, breastfeeding, or trying-to-conceive/i
    );
  });

  it("reports underdosed approved products separately from blocked catalogue products", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({ amount: 1, id: "magnesium", name: "Magnesium" }),
        product({ amount: 0.03, id: "taurine-low-dose", name: "Taurine" })
      ],
      needs: [
        need("magnesium", "Magnesium", 5),
        need("taurine", "Taurine", 1)
      ]
    });
    const unmatched = result.diagnostics.unmatchedNeeds.find(
      (item) => item.id === "taurine"
    );

    assert.equal(unmatched?.bestRejectedProductId, null);
    assert.equal(
      unmatched?.bestRejectedReason,
      "Available approved products underdose this formula target"
    );
  });

  it("enforces supplement max dose across all product servings in the stack", () => {
    const d3Fact = () => ({
      amount: 3000,
      comparableAmount: null,
      confidence: "high" as const,
      itemType: "supplement" as const,
      maxAmount: 4000,
      maxUnit: "IU/day",
      name: "D3",
      normalizedName: "d3",
      supplementAudience: "both" as const,
      unit: "IU"
    });
    const magnesiumBase = product({
      amount: 1,
      id: "magnesium-with-d3",
      name: "Magnesium"
    });
    const zincBase = product({
      amount: 1,
      id: "zinc-with-d3",
      name: "Zinc",
      priceAmount: 1
    });
    const magnesiumWithD3: ProductCandidate = {
      ...magnesiumBase,
      facts: [magnesiumBase.facts[0]!, d3Fact()],
      productKind: "multi"
    };
    const zincWithD3: ProductCandidate = {
      ...zincBase,
      facts: [zincBase.facts[0]!, d3Fact()],
      productKind: "multi"
    };
    const zincOnly = product({
      amount: 1,
      id: "zinc-only",
      name: "Zinc",
      priceAmount: 1000
    });
    const needs = [
      need("magnesium", "Magnesium", 5),
      need("zinc", "Zinc", 5)
    ];
    const recommenders = [
      { name: "full-beam", recommend: recommendProductStackFullBeam },
      { name: "shortlist", recommend: recommendProductStackV2 }
    ];

    for (const { name, recommend } of recommenders) {
      const result = recommend({
        candidates: [magnesiumWithD3, zincWithD3, zincOnly],
        maxProducts: 2,
        needs
      });
      const recommendedIds = new Set(
        result.recommendations.map((item) => item.product.id)
      );
      const totalD3 = result.recommendations.reduce(
        (total, item) =>
          total +
          item.product.facts.reduce(
            (factTotal, fact) =>
              productKeysMatch(fact.name, "Vitamin D3", fact.aliasKeys)
                ? factTotal + (fact.amount ?? 0) * item.servingMultiplier
                : factTotal,
            0
          ),
        0
      );

      assert.equal(recommendedIds.has("magnesium-with-d3"), true, name);
      assert.equal(recommendedIds.has("zinc-with-d3"), false, name);
      assert.equal(recommendedIds.has("zinc-only"), true, name);
      assert.equal(totalD3 <= 4000, true, name);
      assert.equal(result.supplementProductCoveragePercent, 100, name);
    }
  });

  it("does not stack duplicate pack variants of the same product", () => {
    const singlePack = {
      ...product({
        amount: 0.25,
        id: "dhc-turmeric-single",
        maxAmount: 5000,
        name: "Curcumin"
      }),
      brandName: "DHC",
      title: "DHC Concentrated Turmeric 30-Day Supply"
    };
    const twoPack = {
      ...product({
        amount: 0.25,
        id: "dhc-turmeric-two-pack",
        maxAmount: 5000,
        name: "Curcumin"
      }),
      brandName: "DHC",
      title: "DHC Concentrated Turmeric 30-Day Supply 2-Pack"
    };
    const result = recommendProductStackFullBeam({
      candidates: [singlePack, twoPack],
      needs: [need("curcumin", "Curcumin", 5)]
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(
      result.recommendations.filter((item) => /turmeric/i.test(item.product.title)).length,
      1
    );
  });

  it("scores stacks order-independently", () => {
    const candidates = [
      product({ amount: 0.8, id: "d3", name: "Vitamin D" }),
      product({ amount: 0.8, id: "magnesium", name: "Magnesium" }),
      product({ amount: 0.8, id: "omega", name: "Omega-3" })
    ];
    const needs = [
      need("vitamin_d", "Vitamin D", 8),
      need("magnesium", "Magnesium", 7),
      need("omega_3", "Omega-3", 6)
    ];
    const forward = recommendProductStackV2({ candidates, needs });
    const reverse = recommendProductStackV2({
      candidates: [...candidates].reverse(),
      needs
    });

    assert.deepEqual(
      forward.recommendations.map((item) => item.product.id),
      reverse.recommendations.map((item) => item.product.id)
    );
    assert.equal(
      forward.diagnostics.trace?.utilityScore,
      reverse.diagnostics.trace?.utilityScore
    );
  });

  it("finds the exact best stack from the deterministic shortlist", () => {
    const broadMulti: ProductCandidate = {
      ...product({ amount: 1, id: "broad", name: "Vitamin D" }),
      facts: [
        product({ amount: 1, id: "broad-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 1, id: "broad-mag", name: "Magnesium" }).facts[0]!,
        product({ amount: 1, id: "broad-omega", name: "Omega-3" }).facts[0]!
      ],
      productKind: "multi",
      priceAmount: 450
    };
    const result = recommendProductStackV2({
      candidates: [
        product({ amount: 1, id: "d3", name: "Vitamin D", priceAmount: 250 }),
        product({ amount: 1, id: "magnesium", name: "Magnesium", priceAmount: 250 }),
        product({ amount: 1, id: "omega", name: "Omega-3", priceAmount: 250 }),
        broadMulti
      ],
      clientContext: { pillLimit: "1-3" },
      needs: [
        need("vitamin_d", "Vitamin D", 8),
        need("magnesium", "Magnesium", 7),
        need("omega_3", "Omega-3", 6)
      ]
    });

    assert.deepEqual(
      result.recommendations.map((item) => item.product.id),
      ["broad"]
    );
    assert.equal(result.stackCoveragePercent, 100);
  });

  it("caps duplicate coverage and reports contribution from the same final math", () => {
    const first: ProductCandidate = {
      ...product({ amount: 0.8, id: "first", name: "Zinc" }),
      facts: [
        product({ amount: 0.8, id: "first-zinc", name: "Zinc" }).facts[0]!,
        product({ amount: 1, id: "first-magnesium", name: "Magnesium" }).facts[0]!
      ]
    };
    const second: ProductCandidate = {
      ...product({ amount: 0.8, id: "second", name: "Zinc" }),
      facts: [
        product({ amount: 0.8, id: "second-zinc", name: "Zinc" }).facts[0]!,
        product({ amount: 1, id: "second-d3", name: "Vitamin D" }).facts[0]!
      ]
    };
    const result = recommendProductStackV2({
      candidates: [first, second],
      needs: [
        need("zinc", "Zinc", 5),
        need("magnesium", "Magnesium", 5),
        need("vitamin_d", "Vitamin D", 5)
      ]
    });
    const contributionTotal = result.recommendations.reduce(
      (total, item) => total + (item.stackContributionPercent ?? 0),
      0
    );

    assert.equal(result.stackCoveragePercent, 100);
    assert.equal(contributionTotal, 100);
  });

  it("matches expected hits including ashwagandha, probiotics, and curcumin", () => {
    const result = recommendProductStackV2({
      candidates: [
        product({ amount: 1, id: "ashwagandha", name: "Ashwaganda root extract" }),
        product({ amount: 1, id: "probiotics", name: "Probiotic blend" }),
        product({ amount: 1, id: "curcumin", name: "Curacumin" })
      ],
      maxProducts: 6,
      needs: [
        need("ashwagandha", "Ashwagandha", 5),
        need("multi_strain_probiotics", "Multi-strain probiotics", 5),
        need("curcumin", "Curcumin", 5)
      ]
    });
    const recommendedIds = new Set(
      result.recommendations.map((item) => item.product.id)
    );

    assert.equal(recommendedIds.has("ashwagandha"), true);
    assert.equal(recommendedIds.has("probiotics"), true);
    assert.equal(recommendedIds.has("curcumin"), true);
  });

  it("uses affiliate links only as a near-equivalent tie-breaker", () => {
    const betterNutrition = recommendProductStackV2({
      candidates: [
        product({ affiliate: true, amount: 0.4, id: "affiliate", name: "CoQ10" }),
        product({ amount: 1, id: "best", name: "CoQ10" })
      ],
      needs: [need("coq10", "CoQ10", 5)]
    });
    const equivalent = recommendProductStackV2({
      candidates: [
        product({ amount: 1, id: "plain", name: "CoQ10" }),
        product({ affiliate: true, amount: 1, id: "affiliate", name: "CoQ10" })
      ],
      needs: [need("coq10", "CoQ10", 5)]
    });

    assert.equal(betterNutrition.recommendations[0]?.product.id, "best");
    assert.equal(equivalent.recommendations[0]?.product.id, "affiliate");
  });

  it("modulates utility from budget and pill-limit context", () => {
    const singleExpensive: ProductCandidate = {
      ...product({ amount: 1, id: "single", name: "Vitamin D", priceAmount: 4000 }),
      facts: [
        product({ amount: 1, id: "single-d3", name: "Vitamin D" }).facts[0]!,
        product({ amount: 1, id: "single-mag", name: "Magnesium" }).facts[0]!
      ],
      productKind: "multi"
    };
    const twoCheap = [
      product({ amount: 1, id: "cheap-d3", name: "Vitamin D", priceAmount: 300 }),
      product({ amount: 1, id: "cheap-mag", name: "Magnesium", priceAmount: 300 })
    ];
    const needs = [
      need("vitamin_d", "Vitamin D", 5),
      need("magnesium", "Magnesium", 5)
    ];
    const convenience = recommendProductStackV2({
      candidates: [singleExpensive, ...twoCheap],
      clientContext: { budgetPreference: "high", pillLimit: "1-3" },
      needs
    });
    const budget = recommendProductStackV2({
      candidates: [singleExpensive, ...twoCheap],
      clientContext: { budgetPreference: "low", pillLimit: "unlimited" },
      needs
    });

    assert.equal(convenience.diagnostics.trace?.weights.simplicity > budget.diagnostics.trace?.weights.simplicity, true);
    assert.equal(budget.diagnostics.trace?.weights.cost > convenience.diagnostics.trace?.weights.cost, true);
  });

  it("excludes unsafe or wrong-audience candidates before exact scoring", () => {
    const result = recommendProductStackV2({
      candidates: [
        product({
          amount: 1,
          audience: "female",
          id: "female-only",
          name: "Folate"
        }),
        product({
          amount: 1,
          id: "pending",
          name: "Folate",
          status: "pending_review"
        }),
        product({ amount: 1, id: "safe", name: "Folate" })
      ],
      clientSex: "male",
      needs: [need("folate", "Folate", 5)]
    });

    assert.equal(result.recommendations[0]?.product.id, "safe");
    assert.equal(
      result.diagnostics.blockedProducts.some((item) => item.productId === "female-only"),
      true
    );
    assert.equal(
      result.diagnostics.blockedProducts.some((item) => item.productId === "pending"),
      true
    );
  });

  it("uses canonical supplement audience flags inside otherwise general products", () => {
    const maleResult = recommendProductStackV2({
      candidates: [
        product({
          amount: 1,
          audience: "both",
          factAudience: "female",
          id: "female-fact",
          name: "Vitex"
        }),
        product({
          amount: 0.8,
          audience: "both",
          id: "general",
          name: "Vitex"
        })
      ],
      clientSex: "male",
      needs: [need("vitex", "Vitex", 5)]
    });
    const femaleResult = recommendProductStackV2({
      candidates: [
        product({
          amount: 1,
          audience: "both",
          factAudience: "female",
          id: "female-fact",
          name: "Vitex"
        })
      ],
      clientSex: "female",
      needs: [need("vitex", "Vitex", 5)]
    });

    assert.equal(maleResult.recommendations[0]?.product.id, "general");
    assert.equal(
      maleResult.exclusions.some(
        (item) =>
          item.productId === "female-fact" &&
          item.reason === "Supplement is for women only"
      ),
      true
    );
    assert.equal(femaleResult.recommendations[0]?.product.id, "female-fact");
  });

  it("keeps a full-pool beam comparison matcher available", () => {
    const candidates = Array.from({ length: 36 }, (_, index) =>
      product({
        amount: index % 2 === 0 ? 1 : 0.7,
        id: `candidate-${index}`,
        name: index % 3 === 0 ? "Vitamin D" : "Magnesium"
      })
    );
    const needs = [
      need("vitamin_d", "Vitamin D", 5),
      need("magnesium", "Magnesium", 5)
    ];
    const shortlist = recommendProductStackV2({ candidates, maxProducts: 2, needs });
    const fullBeam = recommendProductStackFullBeam({
      candidates,
      maxProducts: 2,
      needs
    });

    assert.equal(fullBeam.diagnostics.algorithmVersion, "v2-full-beam");
    assert.equal(fullBeam.diagnostics.trace?.searchMode, "full-beam");
    assert.equal(fullBeam.diagnostics.trace?.candidatePoolSize, 36);
    assert.equal(fullBeam.diagnostics.trace?.shortlistSize, 36);
    assert.equal(
      (fullBeam.diagnostics.trace?.evaluatedStackCount ?? 0) >
        (shortlist.diagnostics.trace?.evaluatedStackCount ?? 0),
      true
    );
    assert.equal(
      fullBeam.supplementProductCoveragePercent >=
        shortlist.supplementProductCoveragePercent,
      true
    );
  });

  it("keeps low-rank distinct need candidates alive during full-pool beam search", () => {
    const candidates = [
      ...Array.from({ length: 50 }, (_, index) =>
        product({
          amount: 1,
          id: `vitamin-d-${index}`,
          name: "Vitamin D"
        })
      ),
      ...Array.from({ length: 50 }, (_, index) =>
        product({
          amount: 1,
          id: `magnesium-${index}`,
          name: "Magnesium"
        })
      ),
      product({ amount: 1, id: "ashwagandha", name: "Ashwagandha" }),
      product({ amount: 1, id: "curcumin", name: "Curcumin" })
    ];
    const result = recommendProductStackFullBeam({
      candidates,
      maxProducts: 4,
      needs: [
        need("vitamin_d", "Vitamin D", 8),
        need("magnesium", "Magnesium", 8),
        need("ashwagandha", "Ashwagandha", 5),
        need("curcumin", "Curcumin", 5)
      ]
    });
    const recommendedIds = new Set(
      result.recommendations.map((item) => item.product.id)
    );

    assert.equal(recommendedIds.has("ashwagandha"), true);
    assert.equal(recommendedIds.has("curcumin"), true);
    assert.deepEqual(
      result.diagnostics.unmatchedNeeds.map((item) => item.displayName),
      []
    );
  });

  it("prefers materially higher coverage over a tiny clean single-product stack", () => {
    const result = recommendProductStackFullBeam({
      candidates: [
        product({
          amount: 1,
          id: "perfect-probiotic",
          name: "Probiotics"
        }),
        product({ amount: 1, id: "d3", name: "Vitamin D" }),
        product({ amount: 1, id: "magnesium", name: "Magnesium" }),
        product({ amount: 1, id: "curcumin", name: "Curcumin" }),
        product({ amount: 1, id: "glucosamine", name: "Glucosamine" })
      ],
      maxProducts: 5,
      needs: [
        need("vitamin_d", "Vitamin D", 8),
        need("magnesium", "Magnesium", 8),
        need("curcumin", "Curcumin", 7),
        need("glucosamine", "Glucosamine", 7),
        need("probiotics", "Probiotics", 2)
      ]
    });

    assert.equal(result.supplementProductCoveragePercent, 100);
    assert.deepEqual(
      result.diagnostics.unmatchedNeeds.map((item) => item.displayName),
      []
    );
    assert.equal(result.recommendations.length > 1, true);
  });
});
