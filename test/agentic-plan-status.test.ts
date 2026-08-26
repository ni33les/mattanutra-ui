import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicSafetyGuidance } from "../lib/agentic/public-mapper.ts";
import { evaluateSafety, planStatus, safetyQuestions } from "../lib/agentic/plan/safety.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
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
        incidentalNutrients: [],
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
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
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
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
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

  it("closes a bound review acknowledgement at exact UL with zero remaining gap", () => {
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
    const selected = option([
      coverage({
        coveragePercent: 175,
        deliveredAmount: 350,
        percentOfUpperLimit: 100,
        remainingGap: 0,
        requestedAmount: 350,
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
    const ackIds = guidance
      .filter((item) => item.action === "acknowledge")
      .map((item) => item.guidanceId);
    const acked = {
      ...state(),
      safetyAcknowledgement: {
        confirmed: true as const,
        guidanceIds: ackIds,
        revision: 1
      }
    };
    const questions = safetyQuestions({
      guidance,
      locale: "en",
      selected,
      shownRevision: 1,
      state: acked
    });
    assert.equal(
      questions.some((item) => item.questionId === "q_safety_ack"),
      false
    );
    assert.equal(
      questions.some((item) => item.questionId.startsWith("q_gap_")),
      false
    );
    const status = planStatus({
      guidance,
      questions,
      selected,
      state: acked,
      unmetRequirements: []
    });
    assert.equal(status, "ready");
    resetMatcherSafetyCeilings();
  });

  it("stamps catalog band id and version onto public UL guidance", () => {
    const bandId = "8c2b0d1a-4f3e-4a91-9b77-2c6d8e0f1a23";
    setMatcherSafetyCeilings([
      {
        bandId,
        bandVersion: 7,
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
    const selected = option([
      coverage({
        coveragePercent: 200,
        currentAmount: 400,
        deliveredAmount: 0,
        percentOfUpperLimit: 114,
        requestedAmount: 200,
        status: "upper_limit_risk",
        totalExposureAmount: 400,
        upperLimitAmount: 350
      })
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: state()
    });
    const dose = guidance.find(
      (item) => item.action === "block" && item.code === "dose_review_required"
    );
    assert.ok(dose);
    assert.equal(dose.ruleId, bandId);
    assert.equal(dose.rulesVersion, "7");
    assert.equal(dose.exposure, 400);
    assert.equal(dose.threshold, 350);
    const published = publicSafetyGuidance(dose);
    assert.equal(published.ruleId, bandId);
    assert.equal(published.rulesVersion, "7");
    resetMatcherSafetyCeilings();
  });

  it("lists current-intake contributors on a magnesium UL block", () => {
    setMatcherSafetyCeilings([
      {
        bandId: "8c2b0d1a-4f3e-4a91-9b77-2c6d8e0f1a23",
        bandVersion: 7,
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
    const selected = option([
      coverage({
        coveragePercent: 200,
        currentAmount: 400,
        deliveredAmount: 0,
        percentOfUpperLimit: 114,
        requestedAmount: 200,
        status: "upper_limit_risk",
        totalExposureAmount: 400,
        upperLimitAmount: 350
      })
    ]);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: state()
    });
    const dose = guidance.find(
      (item) => item.action === "block" && item.code === "dose_review_required"
    );
    assert.ok(dose);
    assert.equal(dose.nutrientName, "Magnesium");
    assert.equal(dose.exposure, 400);
    assert.equal(dose.threshold, 350);
    assert.deepEqual(dose.contributors, [
      {
        amount: 400,
        productName: "Magnesium",
        source: "current",
        unit: "mg"
      }
    ]);
    const published = publicSafetyGuidance(dose);
    assert.deepEqual(published.contributors, [
      {
        amount: 400,
        productName: "Magnesium",
        source: "current",
        unit: "mg"
      }
    ]);
    resetMatcherSafetyCeilings();
  });
});
