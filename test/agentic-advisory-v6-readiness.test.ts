import assert from "node:assert/strict";
import { test } from "node:test";
import { unmetRequirementsFor } from "../lib/agentic/plan/matching.ts";
import { safetyQuestions, planStatus } from "../lib/agentic/plan/safety.ts";
import type { CanonicalPlanState, StackOption } from "../lib/agentic/plan/types.ts";

test("ADV6-PLAN-01 numerical preferences cannot create a mandatory question or prevent readiness", () => {
  const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: [], optimization: "balanced", pinnedOptionId: null, profile: { ageYears: 35, lifeStage: "adult" }, requirements: { maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 }, safetyAcknowledgement: null, targets: [] };
  const selected = { basket: [{ productId: "one" }], coverage: [], totalPriceMinor: 100, dailyPills: 3 } as unknown as StackOption;
  const unmet = unmetRequirementsFor({ state, option: selected });
  assert.deepEqual(unmet, []);
  assert.deepEqual(unmetRequirementsFor({ state, option: null }), []);
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const questions = safetyQuestions({ guidance: [], locale, selected, shownRevision: 1, state, unmetRequirements: ["maxPriceMinor", "maxDailyPills", "maxProductCount"] });
    assert.deepEqual(questions, []);
    assert.equal(planStatus({ guidance: [], questions, selected, state, unmetRequirements: unmet }), "ready");
  }
});

test("ADV6-PLAN-02 retention preserves identity without imposing an exact target-dose requirement", () => {
  const state: CanonicalPlanState = { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [{ name: "A", supplementId: "a", dailyAmount: 10, unit: "mg", productId: "continued" }], destinationCountry: "TH", leftovers: [], locale: "en", medicationCodes: [], optimization: "balanced", pinnedOptionId: null, profile: { ageYears: 35, lifeStage: "adult" }, requirements: { retainProductIds: ["continued"], retainSupplementIds: ["a"] }, safetyAcknowledgement: null, targets: [{ name: "A", supplementId: "a", amount: 100, unit: "mg" }] };
  const selected = { basket: [{ productId: "new" }], coverage: [{ supplementId: "a", status: "partial", currentAmount: 10, deliveredAmount: 20, requestedAmount: 100 }] } as unknown as StackOption;
  assert.deepEqual(unmetRequirementsFor({ state, option: selected }), []);
  const absent = { ...selected, coverage: [{ ...selected.coverage[0], currentAmount: 0, deliveredAmount: 0 }] };
  assert.deepEqual(unmetRequirementsFor({ state: { ...state, currentSupplements: [], requirements: { retainSupplementIds: ["a"] } }, option: absent }), ["retainSupplementIds:a"]);
});
