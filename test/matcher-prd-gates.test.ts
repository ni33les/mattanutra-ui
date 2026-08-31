import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upperLimitAmount } from "../lib/agentic/plan/limits.ts";
import { kidneyAnswerToConditionCode } from "../lib/matcher/condition-ceilings.ts";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { aggregateDailyExposure, isDoseError, scaleAmount } from "../lib/matcher/dose.ts";
import { evaluateSafety, match } from "../lib/matcher/index.ts";
import {
  QA_GOLD_CATALOG,
  qaCatalogSafetyCeilings,
  qaRequest,
  qaTarget
} from "../lib/matcher/qa/index.ts";
import type { DoseVariant } from "../lib/matcher/types.ts";
import type {
  ProductCandidate,
  ProductRecommendationNeed
} from "../lib/product-recommendation-types.ts";

function magNeed(): ProductRecommendationNeed {
  return {
    aliasKeys: ["magnesium"],
    category: "Foundation",
    displayName: "Magnesium",
    id: "supplement:magnesium",
    itemType: "supplement",
    normalizedName: "magnesium",
    sourceId: "magnesium",
    targetComparableAmount: 200,
    targetDose: {
      amount: 200,
      originalText: "200 mg/day",
      unit: "mg"
    },
    targetText: "200 mg/day",
    weight: 1
  };
}

function magnesiumCandidate(): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    availableCountryCodes: ["TH"],
    brandStatus: "approved",
    currency: "THB",
    facts: [
      {
        amount: 200,
        comparableAmount: 200,
        confidence: "high",
        itemType: "supplement",
        name: "Magnesium",
        normalizedName: "magnesium",
        unit: "mg"
      }
    ],
    id: "mag-200",
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 350,
    productAudience: "both",
    productUrl: "https://example.com/mag-200",
    region: "TH",
    retailAvailabilityStatus: "available_now",
    selectedRetailerName: "Delight Pharmacy",
    selectedRetailerOrganisationId: "delight",
    status: "approved",
    title: "Magnesium 200"
  };
}

function recommendMag(conditions: readonly string[]) {
  return recommendWithMatcher({
    budgetAmount: null,
    candidates: [magnesiumCandidate()],
    clientContext: { conditions },
    clientSex: "male",
    countryCode: "TH",
    maxProducts: 6,
    needs: [magNeed()],
    stackPreference: "balanced"
  });
}

describe("PRD matcher gates", () => {
  it("hard-blocks a magnesium stack for a CKD profile", () => {
    const result = match(
      qaRequest({
        conditionCodes: ["ckd"],
        targets: [qaTarget("mag", 200)]
      }),
      QA_GOLD_CATALOG
    );

    assert.equal(result.selected, null);
  });

  it("blocks a magnesium variant for CKD at remaining allowed 0", () => {
    const mag = scaleAmount({
      amount: 300,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "mg"
    });
    assert.equal(isDoseError(mag), false);
    if (isDoseError(mag)) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_mag", mag]]),
      contributions: new Map([["sup_mag", mag]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_mag",
      unknownSafetyAmount: false,
      variantId: "prd_mag:x1"
    };
    const request = qaRequest({
      conditionCodes: ["ckd"],
      targets: [qaTarget("mag", 300)]
    });
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal(isDoseError(exposure), false);
    if (isDoseError(exposure)) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request,
      variants: [variant]
    });
    const block = safety.findings.find(
      (item) => item.code === "dose_review_required" && item.action === "block"
    );

    assert.equal(safety.hardBlocked, true);
    assert.ok(block);
    assert.equal(block?.thresholdUnits, BigInt(0));
  });

  it("does not recommend magnesium to a CKD client on the website matcher", () => {
    const result = recommendMag(["ckd"]);

    assert.equal(result.recommendations.length, 0);
  });

  it("maps quiz kidney disease and reduced to ckd", () => {
    assert.equal(kidneyAnswerToConditionCode("disease"), "ckd");
    assert.equal(kidneyAnswerToConditionCode("reduced"), "ckd");
    assert.equal(kidneyAnswerToConditionCode("normal"), null);
  });

  it("still recommends 200 mg magnesium without CKD against the adult UL", () => {
    const result = recommendMag([]);

    assert.equal(result.recommendations[0]?.product.id, "mag-200");
  });

  it("returns remaining allowed 0 mg magnesium for CKD from upperLimitAmount", () => {
    assert.equal(
      upperLimitAmount("Magnesium", "mg", {
        ceilings: qaCatalogSafetyCeilings(),
        conditionCodes: ["ckd"],
        profile: { ageYears: 52, lifeStage: "adult" },
        subjectId: "sup_mag"
      }),
      0
    );
    assert.equal(
      upperLimitAmount("Magnesium", "mg", {
        ceilings: qaCatalogSafetyCeilings(),
        conditionCodes: [],
        profile: { ageYears: 52, lifeStage: "adult" },
        subjectId: "sup_mag"
      }) != null &&
        upperLimitAmount("Magnesium", "mg", {
          ceilings: qaCatalogSafetyCeilings(),
          conditionCodes: [],
          profile: { ageYears: 52, lifeStage: "adult" },
          subjectId: "sup_mag"
        })! > 0,
      true
    );
  });
});
