import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationalDecision } from "../lib/agentic/value/operational-decision.ts";
import { safetyQuestions, planStatus } from "../lib/agentic/plan/safety.ts";
import type { CanonicalPlanState, StackOption } from "../lib/agentic/plan/types.ts";
const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: [], optimization: "balanced", pinnedOptionId: null, profile: { ageYears: 35, lifeStage: "adult" }, requirements: {}, safetyAcknowledgement: null, targets: [{ name: "Magnesium", supplementId: "sup_mag", amount: 200, unit: "mg" }] };
const empty = { basket: [], coverage: [{ supplementId: "sup_mag", name: "Magnesium", requestedAmount: 200, currentAmount: 0, deliveredAmount: 0, remainingGap: 200, totalExposureAmount: 0, coveragePercent: 0, status: "uncovered", unit: "mg" }] } as unknown as StackOption;
describe("v5 conversation has no automatic health or gap decision gates", () => {
  it("zero coverage and partial coverage both remain advice without a required gap acknowledgement", () => {
    for (const delivered of [0, 1, 50]) {
      const selected = { ...empty, coverage: [{ ...empty.coverage[0], deliveredAmount: delivered, remainingGap: 200 - delivered, coveragePercent: delivered / 2, status: delivered ? "partial" : "uncovered" }] } as StackOption;
      assert.deepEqual(safetyQuestions({ guidance: [], locale: "en", selected, shownRevision: 1, state, unmetRequirements: [] }), []);
    }
  });
  it("does not ask an algae question when the dietary requirement already determines source", () => {
    assert.deepEqual(safetyQuestions({ guidance: [], locale: "en", selected: null, shownRevision: 1, state: { ...state, requirements: { dietaryPreference: "plant_based" }, targets: [{ name: "Omega-3", supplementId: "sup_omega3", amount: 250, unit: "mg" }] } }), []);
  });
  it("offers review_options when the closest recommendation is empty and a purchase alternative exists", () => {
    const status = planStatus({ guidance: [], questions: [], selected: empty, state, unmetRequirements: [] });
    assert.equal(status, "no_purchase");
    assert.deepEqual(operationalDecision({ status, hasSelectedOption: false, hasPurchaseOptions: true }), { status: "no_purchase", nextAction: "review_options", purchaseEligible: false });
  });
  it("preserves a material explicitly conditional customer decision", () => {
    const questions = safetyQuestions({ guidance: [], locale: "en", selected: empty, shownRevision: 1, state: { ...state, targets: [{ ...state.targets[0], importance: "conditional", prerequisite: { status: "unknown", reasonCode: "customer_target_confirmation" } }] } });
    assert.equal(questions.length, 1); assert.equal(questions[0].questionId, "q_prerequisite_sup_mag");
  });
});
