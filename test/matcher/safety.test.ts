import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateDailyExposure } from "../../lib/matcher/dose.ts";
import { evaluateSafety } from "../../lib/matcher/safety.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import type { CanonicalRequest, DoseVariant } from "../../lib/matcher/types.ts";

function request(overrides: Partial<CanonicalRequest> = {}): CanonicalRequest {
  const zinc = scaleAmount({
    amount: 25,
    subjectId: "sup_zinc",
    subjectName: "Zinc",
    unit: "mg"
  });
  assert.equal("reason" in zinc, false);
  if ("reason" in zinc) {
    throw new Error(zinc.message);
  }

  return {
    acceptedGapSubjectIds: [],
    allowedForms: null,
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    dietaryPreference: "any",
    excludeSubjectIds: [],
    leftovers: [],
    maxDailyPills: null,
    maxPriceMinor: null,
    maxProductCount: 8,
    medicationCodes: [],
    omega3SourcePreference: "any",
    optimization: "best_coverage",
    profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
    retainProductIds: [],
    retainSubjectIds: [],
    selectorMode: "agentic",
    targets: [
      {
        name: "Zinc",
        requested: zinc,
        requestedAmount: 25,
        requestedUnit: "mg",
        subjectId: "sup_zinc"
      }
    ],
    ...overrides
  };
}

describe("matcher safety engine", () => {
  it("SAFE-02 fires zinc UL exactly at 40 mg", () => {
    const amount = scaleAmount({
      amount: 40,
      subjectId: "sup_zinc",
      subjectName: "Zinc",
      unit: "mg"
    });
    assert.equal("reason" in amount, false);
    if ("reason" in amount) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", amount]]),
      contributions: new Map([["sup_zinc", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: request({
        safetyCeilings: [
          {
            maxAmount: 40,
            maxUnit: "mg",
            name: "Zinc",
            subjectId: "sup_zinc"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, false);
    assert.equal(
      safety.findings.some((item) => item.code === "dose_review_required"),
      true
    );
  });

  it("blocks a stack that exceeds the admin ceiling", () => {
    const amount = scaleAmount({
      amount: 41,
      subjectId: "sup_zinc",
      subjectName: "Zinc",
      unit: "mg"
    });
    assert.equal("reason" in amount, false);
    if ("reason" in amount) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", amount]]),
      contributions: new Map([["sup_zinc", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: request({
        safetyCeilings: [
          {
            maxAmount: 40,
            maxUnit: "mg",
            name: "Zinc",
            subjectId: "sup_zinc"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, true);
    assert.equal(
      safety.findings.some(
        (item) => item.code === "dose_review_required" && item.action === "block"
      ),
      true
    );
  });

  it("SAFE-04 blocks CKD plus magnesium at request level", () => {
    const mag = scaleAmount({
      amount: 300,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "mg"
    });
    assert.equal("reason" in mag, false);
    if ("reason" in mag) {
      return;
    }
    const next = request({
      conditionCodes: ["ckd"],
      targets: [
        {
          name: "Magnesium",
          requested: mag,
          requestedAmount: 300,
          requestedUnit: "mg",
          subjectId: "sup_mag"
        }
      ]
    });
    const exposure = aggregateDailyExposure({ current: [], variants: [] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: next,
      variants: []
    });
    assert.equal(safety.hardBlocked, true);
    assert.equal(
      safety.findings.some((item) => item.code === "condition_review_required"),
      true
    );
  });

  it("SAFE-01 does not fire zinc UL at 39.999 mg", () => {
    const amount = scaleAmount({
      amount: 39.999,
      subjectId: "sup_zinc",
      subjectName: "Zinc",
      unit: "mg"
    });
    assert.equal("reason" in amount, false);
    if ("reason" in amount) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", amount]]),
      contributions: new Map([["sup_zinc", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: request({
        safetyCeilings: [
          {
            maxAmount: 40,
            maxUnit: "mg",
            name: "Zinc",
            subjectId: "sup_zinc"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(
      safety.findings.some((item) => item.code === "dose_review_required"),
      false
    );
  });

  it("blocks magnesium exposure above the NIH supplemental UL when no admin ceiling is loaded", () => {
    const amount = scaleAmount({
      amount: 2046,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "mg"
    });
    assert.equal("reason" in amount, false);
    if ("reason" in amount) {
      return;
    }
    const requested = scaleAmount({
      amount: 200,
      subjectId: "sup_mag",
      subjectName: "Magnesium",
      unit: "mg"
    });
    assert.equal("reason" in requested, false);
    if ("reason" in requested) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_mag", amount]]),
      contributions: new Map([["sup_mag", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_mag",
      unknownSafetyAmount: false,
      variantId: "prd_mag:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: request({
        safetyCeilings: [],
        targets: [
          {
            name: "Magnesium",
            requested,
            requestedAmount: 200,
            requestedUnit: "mg",
            subjectId: "sup_mag"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, true);
    assert.equal(
      safety.findings.some(
        (item) => item.code === "dose_review_required" && item.action === "block"
      ),
      true
    );
  });

  it("blocks vitamin D exposure above 4000 IU when no admin ceiling is loaded", () => {
    const amount = scaleAmount({
      amount: 4600,
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      unit: "IU"
    });
    assert.equal("reason" in amount, false);
    if ("reason" in amount) {
      return;
    }
    const requested = scaleAmount({
      amount: 2000,
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      unit: "IU"
    });
    assert.equal("reason" in requested, false);
    if ("reason" in requested) {
      return;
    }
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_d3", amount]]),
      contributions: new Map([["sup_d3", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_d3",
      unknownSafetyAmount: false,
      variantId: "prd_d3:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: request({
        safetyCeilings: [],
        targets: [
          {
            name: "Vitamin D3",
            requested,
            requestedAmount: 2000,
            requestedUnit: "IU",
            subjectId: "sup_d3"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, true);
  });
});
