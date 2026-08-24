import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  matcherNeedCoveragePercent,
  matcherProductCoversNeed
} from "../lib/matcher/adapters/web.ts";
import { COVERAGE_SCALE } from "../lib/matcher/config.ts";
import type { MatcherProduct } from "../lib/matcher/types.ts";
import type { ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";

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
    targetComparableAmount: null,
    targetDose: null,
    targetText: null,
    weight: 1
  };
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
