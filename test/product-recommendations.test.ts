import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMarketplaceSearchQueries,
  normalizeProductFactKey,
  productFactAliasKeys,
  productFactLooksLikeConcentration,
  productKeysMatch,
  recommendProductStack,
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
  id: string;
  name: string;
  status?: ProductCandidate["status"];
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
        name: input.name,
        normalizedName: input.name.toLowerCase().replace(/\s+/g, "_"),
        unit: "mg"
      }
    ],
    id: input.id,
    labelStatus: "parsed",
    status: input.status ?? "approved",
    platform: "shopee",
    productAudience: input.audience ?? "both",
    priceAmount: 100,
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    title: input.name
  };
}

describe("product recommendation scoring", () => {
  it("builds broad marketplace search queries instead of exact dose strings", () => {
    const queries = buildMarketplaceSearchQueries([
      need("vitamin_d", "Vitamin D3", 7, 1000),
      need("coq10", "CoQ10", 6, 1000),
      need("chia", "Chia Seeds", 5, 0, "food")
    ]);

    assert.equal(queries.includes("multivitamin"), true);
    assert.equal(queries.includes("vitamin d3"), true);
    assert.equal(queries.includes("coenzyme q10"), true);
    assert.equal(queries.includes("chia seeds"), true);
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

    assert.deepEqual(recommendedIds, ["one", "two", "three", "four"]);
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

  it("reports supplement coverage separately from food coverage", () => {
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
    assert.equal(result.totalPlanCoveragePercent, 50);
    assert.equal(result.diagnostics.unmatchedNeeds[0]?.displayName, "Chia Seeds");
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
    assert.equal(potencyOnlyResult.recommendations[0]?.product.id, "potency");
    assert.equal(potencyOnlyResult.stackCoveragePercent, 80);
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
