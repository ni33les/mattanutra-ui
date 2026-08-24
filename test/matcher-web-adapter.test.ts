import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  matcherNeedCoveragePercent,
  matcherProductCoversNeed,
  recommendWithMatcher
} from "../lib/matcher/adapters/web.ts";
import { COVERAGE_SCALE } from "../lib/matcher/config.ts";
import type { MatcherProduct } from "../lib/matcher/types.ts";
import type {
  ProductCandidate,
  ProductRecommendationNeed
} from "../lib/product-recommendation-types.ts";

function need(
  overrides: Partial<ProductRecommendationNeed> &
    Pick<ProductRecommendationNeed, "id" | "displayName" | "normalizedName" | "sourceId">
): ProductRecommendationNeed {
  return {
    aliasKeys: overrides.aliasKeys ?? [overrides.normalizedName],
    category: "Foundation",
    displayName: overrides.displayName,
    id: overrides.id,
    itemType: "supplement",
    normalizedName: overrides.normalizedName,
    sourceId: overrides.sourceId,
    targetComparableAmount: overrides.targetComparableAmount ?? null,
    targetDose: overrides.targetDose ?? null,
    targetText: overrides.targetText ?? null,
    weight: overrides.weight ?? 1
  };
}

function candidate(input: Readonly<{
  facts: ReadonlyArray<{
    amount: number;
    name: string;
    normalizedName: string;
    unit: string;
  }>;
  id: string;
  title: string;
}>): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    brandStatus: "approved",
    currency: "THB",
    facts: input.facts.map((fact) => ({
      amount: fact.amount,
      comparableAmount: fact.amount,
      confidence: "high" as const,
      itemType: "supplement" as const,
      name: fact.name,
      normalizedName: fact.normalizedName,
      unit: fact.unit
    })),
    id: input.id,
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 350,
    productAudience: "both",
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    retailAvailabilityStatus: "available_now",
    selectedRetailerName: "Delight Pharmacy",
    selectedRetailerOrganisationId: "delight",
    status: "approved",
    title: input.title
  };
}

function dosedNeed(
  input: Readonly<{
    amount: number;
    displayName: string;
    id: string;
    normalizedName: string;
    unit: "mcg" | "mg";
    weight?: number;
  }>
): ProductRecommendationNeed {
  return need({
    displayName: input.displayName,
    id: input.id,
    normalizedName: input.normalizedName,
    sourceId: input.normalizedName,
    targetComparableAmount: input.amount,
    targetDose: {
      amount: input.amount,
      originalText: `${input.amount} ${input.unit}/day`,
      unit: input.unit
    },
    targetText: `${input.amount} ${input.unit}/day`,
    weight: input.weight ?? 1
  });
}

function product(overrides: Partial<MatcherProduct> = {}): MatcherProduct {
  return {
    availableCountryCodes: ["TH"],
    contributionSubjectIds: [],
    currency: "THB",
    dailyPillsPerServing: 1,
    dietarySource: "any",
    form: "capsule",
    imageUrl: null,
    incompleteCommercialFacts: false,
    labelledContributions: [],
    omegaSource: "none",
    orderable: true,
    prenatalOrFertility: false,
    productAudience: "both",
    productId: "bio-mag",
    retailerSku: "bio-mag",
    sellerId: "delight",
    sellerName: "Delight Pharmacy",
    source: "retail",
    status: "approved",
    stockStatus: "in_stock",
    title: "Blackmores Bio Magnesium",
    unknownSafetyAmount: false,
    unitPriceMinor: 10000,
    ...overrides
  };
}

describe("matcher web adapter coverage mapping", () => {
  it("does not stamp the whole formula onto every SKU", async () => {
    const source = await readFile("lib/matcher/adapters/web.ts", "utf8");

    assert.doesNotMatch(source, /coveredNeeds:\s*supplementNeeds,/);
    assert.match(
      source,
      /coveredNeeds:\s*supplementNeeds\.filter\(\(need\) =>\s*matcherProductCoversNeed/
    );
    assert.match(source, /needDiagnosticsFromBasket/);
    assert.doesNotMatch(
      source,
      /unit:\s*fact\.comparableAmount != null \? "mcg"/
    );
    assert.match(source, /amount:\s*fact\.amount \?\? 0/);
    assert.match(source, /unit:\s*fact\.unit/);
    const live = await readFile("lib/agentic/catalogue/live.ts", "utf8");
    assert.doesNotMatch(
      live,
      /comparableAmount:\s*Number\.isFinite\(amount\) \? amount : null/
    );
    assert.match(live, /comparableAmount:\s*factComparableAmount\(fact\)/);
  });

  it("counts labelled milligrams and IU against the formula, not a fake mcg field", () => {
    const magnesium = dosedNeed({
      amount: 300,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      unit: "mg",
      weight: 5
    });
    const vitaminD3 = dosedNeed({
      amount: 50,
      displayName: "Vitamin D3",
      id: "supplement:vitamin-d3",
      normalizedName: "vitamin_d3",
      unit: "mcg",
      weight: 7
    });
    const omega3 = dosedNeed({
      amount: 1000,
      displayName: "Omega-3",
      id: "supplement:omega-3",
      normalizedName: "omega_3",
      unit: "mg",
      weight: 6
    });
    const creatine = dosedNeed({
      amount: 3000,
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      unit: "mg"
    });

    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 301.5,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            },
            {
              amount: 100,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "IU"
            }
          ],
          id: "mag-d3",
          title: "BLACKMORE MAGNESIUM+D3 50'S"
        }),
        candidate({
          facts: [
            {
              amount: 600,
              name: "Omega-3",
              normalizedName: "omega_3",
              unit: "mg"
            }
          ],
          id: "omega-dha",
          title: "Blackmores Omega DHA"
        })
      ],
      clientContext: null,
      clientSex: null,
      countryCode: "TH",
      maxProducts: 6,
      needs: [magnesium, vitaminD3, omega3, creatine],
      stackPreference: "balanced"
    });

    const byNeed = new Map(
      [...result.diagnostics.matchedNeeds, ...result.diagnostics.unmatchedNeeds].map(
        (item) => [item.id, item.coveragePercent]
      )
    );

    assert.ok((byNeed.get("supplement:magnesium") ?? 0) >= 90);
    assert.ok((byNeed.get("supplement:omega-3") ?? 0) >= 55);
    assert.ok((byNeed.get("supplement:omega-3") ?? 0) <= 70);
    assert.ok((byNeed.get("supplement:vitamin-d3") ?? 100) < 20);
    assert.equal(byNeed.get("supplement:creatine") ?? 0, 0);
    assert.equal(
      result.recommendations.some((row) =>
        row.coveredNeeds.some((item) => item.id === "supplement:creatine")
      ),
      false
    );
  });

  it("maps coverageBySubject units into percents", () => {
    const magnesium = need({
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      sourceId: "magnesium"
    });
    const creatine = need({
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      sourceId: "creatine"
    });
    const coverageBySubject = new Map([
      ["magnesium", COVERAGE_SCALE],
      ["creatine", 0]
    ]);

    assert.equal(matcherNeedCoveragePercent(coverageBySubject, magnesium), 100);
    assert.equal(matcherNeedCoveragePercent(coverageBySubject, creatine), 0);
    assert.equal(
      matcherNeedCoveragePercent(
        new Map([["magnesium", COVERAGE_SCALE * 0.2]]),
        magnesium
      ),
      20
    );
  });

  it("does not let Bio Magnesium cover creatine", () => {
    const magnesium = need({
      aliasKeys: ["magnesium", "magnesium_glycinate"],
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      sourceId: "magnesium"
    });
    const creatine = need({
      aliasKeys: ["creatine"],
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      sourceId: "creatine"
    });
    const bioMag = product({
      contributionSubjectIds: ["magnesium"],
      labelledContributions: [
        {
          amount: 300,
          name: "Magnesium",
          subjectId: "magnesium",
          unit: "mg"
        }
      ]
    });

    assert.equal(matcherProductCoversNeed(bioMag, magnesium), true);
    assert.equal(matcherProductCoversNeed(bioMag, creatine), false);
  });
});
