import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSafety, planStatus, safetyQuestions } from "../lib/agentic/plan/safety.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import type { CoverageRow, StackOption } from "../lib/agentic/plan/types.ts";

function vitaminCOption(): StackOption {
  const c = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Vitamin C");
  assert.ok(c);
  const row: CoverageRow = {
    coveragePercent: 100,
    currentAmount: 0,
    deliveredAmount: 500,
    name: "Vitamin C",
    percentOfUpperLimit: null,
    remainingGap: 0,
    requestedAmount: 500,
    status: "covered",
    supplementId: c.supplementId,
    totalExposureAmount: 500,
    unit: "mg",
    upperLimitAmount: 2000
  };
  return {
    basket: [
      {
        availabilityAsOf: "2026-08-25T00:00:00.000Z",
        contributionSupplementIds: [c.supplementId],
        currency: "THB",
        dailyPills: 1,
        deliveryWindow: null,
        fixture: true,
        form: "tablet",
        imageUrl: null,
        incidentalNutrientNames: [],
        incidentalNutrients: [],
        incompleteCommercialFacts: false,
        lineTotalMinor: 100,
        pillsPerServing: 1,
        productId: "prd_c",
        productName: "Vitamin C 500",
        quantity: 1,
        requestedNutrientNames: ["Vitamin C"],
        retailerSku: "G-C-500",
        sellerId: "seller",
        sellerName: "QA",
        servingsPerDay: 1,
        source: "fixture",
        stockStatus: "in_stock",
        unitPriceMinor: 100
      }
    ],
    coverage: [row],
    coveragePercent: 100,
    dailyPills: 1,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_c",
    reason: "test",
    snapshotId: "snap_c",
    totalPriceMinor: 100
  };
}

describe("Phase 3 unknown leftover blocks ready", () => {
  it("keeps vitamin C plus an unknown target as needs_input until the leftover is accepted", () => {
    const selected = vitaminCOption();
    const c = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Vitamin C");
    assert.ok(c);
    const state = aug25PlanState({
      leftovers: [
        {
          amount: 100,
          name: "Unobtainium",
          note: "not_in_catalogue",
          reason: "not_in_catalogue",
          severity: "high",
          unit: "mg"
        }
      ],
      targets: [
        {
          amount: 500,
          name: "Vitamin C",
          supplementId: c.supplementId,
          unit: "mg"
        }
      ]
    });
    const guidance = evaluateSafety({ locale: "en", selected, state });
    const questions = safetyQuestions({
      guidance,
      locale: "en",
      selected,
      shownRevision: 1,
      state,
      unmetRequirements: []
    });
    const status = planStatus({
      guidance,
      questions,
      selected,
      state,
      unmetRequirements: []
    });
    assert.equal(status, "needs_input");
    assert.ok(questions.some((item) => item.questionId.includes("Unobtainium")));

    const accepted = {
      ...state,
      acceptedGaps: [{ revision: 1, supplementId: "leftover:Unobtainium" }]
    };
    const after = planStatus({
      guidance: evaluateSafety({ locale: "en", selected, state: accepted }),
      questions: [],
      selected,
      state: accepted,
      unmetRequirements: []
    });
    assert.equal(after, "ready");
  });
});
