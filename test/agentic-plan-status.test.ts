import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSafety, planStatus } from "../lib/agentic/plan/safety.ts";
import type {
  CanonicalPlanState,
  CoverageRow,
  StackOption
} from "../lib/agentic/plan/types.ts";

function coverage(overrides: Partial<CoverageRow> = {}): CoverageRow {
  return {
    coveragePercent: 100,
    currentAmount: 0,
    deliveredAmount: 200,
    name: "Magnesium",
    percentOfUpperLimit: null,
    remainingGap: 200,
    requestedAmount: 200,
    status: "covered",
    supplementId: "sup_mag",
    totalExposureAmount: 200,
    unit: "mg",
    upperLimitAmount: 350,
    ...overrides
  };
}

function option(rows: CoverageRow[]): StackOption {
  return {
    basket: [
      {
        availabilityAsOf: "2026-08-25T00:00:00.000Z",
        contributionSupplementIds: ["sup_mag"],
        currency: "THB",
        dailyPills: 1,
        deliveryWindow: null,
        fixture: true,
        form: "capsule",
        imageUrl: null,
        incidentalNutrientNames: [],
        incompleteCommercialFacts: false,
        lineTotalMinor: 120,
        pillsPerServing: 1,
        productId: "prd_mag",
        productName: "Magnesium 200",
        quantity: 1,
        requestedNutrientNames: ["Magnesium"],
        retailerSku: "G-MAG-200",
        sellerId: "seller",
        sellerName: "QA",
        servingsPerDay: 1,
        source: "fixture",
        stockStatus: "in_stock",
        unitPriceMinor: 120
      }
    ],
    coverage: rows,
    coveragePercent: 100,
    dailyPills: 1,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_test",
    reason: "test",
    snapshotId: "snap_testphase6",
    totalPriceMinor: 120
  };
}

function state(): CanonicalPlanState {
  return {
    acceptedGaps: [],
    answers: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    locale: "en",
    leftovers: [],
    medicationCodes: [],
    optimization: "fewest_pills",
    pinnedOptionId: null,
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    shownRevision: 1,
    targets: [
      {
        amount: 200,
        name: "Magnesium",
        supplementId: "sup_mag",
        unit: "mg"
      }
    ]
  } as CanonicalPlanState;
}

describe("plan status fail-closed on oversupply", () => {
  it("does not mark over_target coverage as ready", () => {
    const selected = option([
      coverage({
        coveragePercent: 1023,
        deliveredAmount: 2046,
        status: "over_target",
        totalExposureAmount: 2046,
        upperLimitAmount: 350,
        percentOfUpperLimit: 585
      })
    ]);
    const status = planStatus({
      guidance: [],
      questions: [],
      selected,
      state: state(),
      unmetRequirements: []
    });
    assert.notEqual(status, "ready");
  });

  it("blocks exposure above the magnesium UL", () => {
    const selected = option([
      coverage({
        coveragePercent: 1023,
        deliveredAmount: 2046,
        percentOfUpperLimit: 585,
        status: "upper_limit_risk",
        totalExposureAmount: 2046,
        upperLimitAmount: 350
      })
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: state()
    });
    assert.equal(
      guidance.some((item) => item.action === "block" && item.code === "dose_review_required"),
      true
    );
    const status = planStatus({
      guidance,
      questions: [],
      selected,
      state: state(),
      unmetRequirements: []
    });
    assert.equal(status, "blocked");
  });

  it("keeps exact UL as needs_input rather than ready", () => {
    const selected = option([
      coverage({
        coveragePercent: 175,
        deliveredAmount: 350,
        percentOfUpperLimit: 100,
        requestedAmount: 200,
        status: "upper_limit_risk",
        totalExposureAmount: 350,
        upperLimitAmount: 350
      })
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: state()
    });
    assert.equal(
      guidance.some((item) => item.action === "acknowledge" && item.code === "dose_review_required"),
      true
    );
    const status = planStatus({
      guidance,
      questions: [{ choices: [], prompt: "ack", promptKey: "x", questionId: "q_safety_ack" }],
      selected,
      state: state(),
      unmetRequirements: []
    });
    assert.equal(status, "needs_input");
  });
});
