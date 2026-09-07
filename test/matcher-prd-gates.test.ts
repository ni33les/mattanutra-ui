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
  it("keeps magnesium matching available with serious CKD advice", () => {
    const result = match(
      qaRequest({
        conditionCodes: ["ckd"],
        targets: [qaTarget("mag", 200)]
      }),
      QA_GOLD_CATALOG
    );

    assert.ok(result.selected);
    assert.equal(result.selected.safety.hardBlocked, false);
    assert.ok(result.selected.safety.findings.some((row) => row.code === "condition_review_required"));
  });

  it("reports CKD as clinical advice without a numeric zero-dose limit", () => {
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
      (item) => item.code === "condition_review_required" && item.action === "inform"
    );

    assert.equal(safety.hardBlocked, false);
    assert.equal(safety.requiresAck, false);
    assert.ok(block);
    assert.equal(block?.thresholdUnits, null);
  });

  it("returns the requested magnesium match for a CKD web client", () => {
    const result = recommendMag(["ckd"]);

    assert.equal(result.recommendations[0]?.product.id, "mag-200");
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

  it("keeps the population magnesium limit separate from CKD advice", () => {
    assert.equal(
      upperLimitAmount("Magnesium", "mg", {
        ceilings: qaCatalogSafetyCeilings(),
        conditionCodes: ["ckd"],
        profile: { ageYears: 52, lifeStage: "adult" },
        subjectId: "sup_mag"
      }),
      350
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
