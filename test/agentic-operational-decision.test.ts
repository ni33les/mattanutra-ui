import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationalDecision } from "../lib/agentic/value/operational-decision.ts";
import { buildCompactDecision } from "../lib/agentic/value/compact-decision.ts";
import { publicPlanFields } from "../lib/agentic/public-mapper.ts";
import type { SafetyGuidance, StackOption } from "../lib/agentic/plan/types.ts";

const adviceFixture: SafetyGuidance = {
  action: "review", code: "dose_review_required", comparator: "gt",
  contributors: [{ productId: "product-a", productName: "Magnesium", amount: 400, unit: "mg", source: "selected" }],
  exposure: 400, guidanceId: "gdn:dose_review_required:magnesium:supplemental:catalogue-band",
  message: "Review the reported amount against the reference limit.", messageKey: "guidance.dose_review_required",
  nutrientName: "Magnesium", productIds: ["product-a"], ruleId: "catalogue-band", rulesVersion: "4.0.0",
  severity: "high", sourceScope: "supplemental", supplementIds: ["magnesium"], threshold: 350, unit: "mg",
  uncertainty: "Some reported intake is estimated.", uncertaintyCodes: ["estimated_intake"], evidence: ["catalogue-band"]
};
function adviceOption(guidance: readonly SafetyGuidance[]): StackOption {
  return {
    candidateKey: "opt_advice_fixture", basket: [{
      availabilityAsOf: "2026-09-07T00:00:00Z", contributionSupplementIds: ["magnesium"], currency: "THB",
      dailyPills: 1, deliveryWindow: null, fixture: true, form: "capsule", imageUrl: null,
      incidentalNutrientNames: [], incidentalNutrients: [], incompleteCommercialFacts: false,
      lineTotalMinor: 100, pillsPerServing: 1, productId: "product-a", productName: "Magnesium 400 mg",
      quantity: 1, requestedNutrientNames: ["Magnesium"], retailerSku: "magnesium-400-fixture",
      sellerId: "fixture", sellerName: "Fixture", servingsPerDay: 1, source: "fixture", stockStatus: "in_stock", unitPriceMinor: 100
    }], coverage: [], coveragePercent: 0, dailyPills: 1,
    matcherVersion: "fixture", snapshotId: "fixture", totalPriceMinor: 100, reason: "fixture",
    safety: { assessedConditionCodes: [], assessedMedicationCodes: [], guidance }
  };
}

describe("one operational decision", () => {
  it("ANNA-AX-09: serialized preference advice preserves unknown pill counts and zero preferences without blocking a valid option", () => {
    const option = adviceOption([adviceFixture]);
    const selected = { ...option, basket: option.basket.map(item => ({ ...item, pillCountKnown: false })) };
    const result = { alternatives: [], basket: selected.basket, selected, status: "ready" as const,
      coverage: [], questions: [], changeSummary: [], unmetRequirements: [], safetyGuidance: [adviceFixture], summary: "Ready with advice.",
      requestSnapshot: { locale: "en", targets: [], currentSupplements: [], medicationCodes: [], conditionCodes: [], requirements: { maxProductCount: 0, maxDailyPills: 2, maxPriceMinor: 100 } } };
    const value = JSON.parse(JSON.stringify(publicPlanFields(result)));
    assert.equal(value.status, "ready");
    assert.equal(value.operationalDecision.purchaseEligible, true);
    assert.deepEqual(value.nextActions, [value.operationalDecision.nextAction]);
    for (const rows of [value.preferenceAssessment, value.options[0].preferenceAssessment, value.compactDecision.preferenceAssessment]) {
      const pill = rows.find((row: { kind: string }) => row.kind === "daily_pills");
      assert.equal(pill.actual, null); assert.equal(pill.delta, null); assert.equal(pill.percent, null); assert.equal(pill.complete, false);
      assert.equal(pill.status, "unknown");
      const count = rows.find((row: { kind: string }) => row.kind === "product_count");
      assert.equal(count.prominent, true); assert.equal(count.preferred, 0); assert.equal(count.actual, 1); assert.equal(count.percent, null);
    }
    assert.equal(value.compactDecision.advice[0].severity, "high");
    assert.equal(value.acknowledgementStatus, "not_required");
  });
  it("ANNA-AX-10: empty-result reason, summary and all recovery projections use the same candidate evidence", () => {
    const option = adviceOption([]);
    const empty = { ...option, basket: [], totalPriceMinor: 0, dailyPills: 0 };
    const matchingDiagnostics = { catalogueListings: 2, catalogueProducts: 2, eligibleListings: 0, eligibleProducts: 0,
      supportedDoseVariants: 0, evaluatedNonemptyBaskets: 0, reasonCode: "no_eligible_products" as const,
      rejectionCounts: [{ reason: "excluded", count: 2 }], targets: [] };
    const value = publicPlanFields({ alternatives: [], basket: [], selected: empty, status: "no_purchase",
      coverage: [{ name: "Magnesium", requestedAmount: 100, currentAmount: 0, deliveredAmount: 0, remainingGap: 100, status: "uncovered", supplementId: "magnesium", unit: "mg", coveragePercent: 0 }],
      questions: [], changeSummary: [], unmetRequirements: [], safetyGuidance: [], summary: "Legacy generic no-purchase copy", matchingDiagnostics });
    assert.equal(value.status, "no_purchase");
    assert.equal(value.reasonCode, "no_eligible_products");
    assert.equal(value.reason, value.summary);
    assert.equal(value.compactDecision?.why, value.summary);
    assert.equal(value.matchingExplanation?.message, value.summary);
    assert.equal(value.operationalDecision.nextAction, "change_request");
    assert.deepEqual(value.nextActions, ["change_request"]);
    assert.equal(value.explanation?.nextActionKey, "plan.next_action.change_request");
    assert.deepEqual(value.compactDecision?.operationalDecision, value.operationalDecision);
  });
  it("concise copy counts unresolved targets instead of claiming their names are covered", () => {
    const selected = { ...adviceOption([]), candidateKey: "opt_partial_fixture", coverage: [
      ...[0, 1, 2, 3].map(index => ({ name: `Known ${index}`, status: "covered" })),
      { name: "Unavailable nutrient", status: "uncovered" }
    ] } as StackOption;
    const compact = buildCompactDecision({ status: "ready", selected });
    assert.match(compact.why, /4 of 5/);
    assert.match(compact.why, /1 remain partial or unresolved/);
    assert.doesNotMatch(compact.why, /covers Unavailable nutrient/);
  });
  it("publishes identical plan and selected-option advice once despite object-key order", () => {
    const duplicate = Object.fromEntries(Object.entries(adviceFixture).reverse()) as SafetyGuidance;
    const result = buildCompactDecision({ status: "ready", selected: adviceOption([duplicate]), safetyGuidance: [adviceFixture] });
    assert.equal(result.advice.length, 1);
    assert.equal(result.advice[0]!.exposure, 400);
    assert.equal(result.advice[0]!.threshold, 350);
    assert.deepEqual(result.advice[0]!.uncertaintyCodes, ["estimated_intake"]);
    assert.equal(result.operationalDecision.purchaseEligible, true);
  });
  it("keeps identical serious advice visible when an empty basket has no purchase action", () => {
    const nonempty = adviceOption([adviceFixture]);
    const empty = buildCompactDecision({ status: "ready", selected: { ...nonempty, basket: [], totalPriceMinor: 0, dailyPills: 0 }, safetyGuidance: [adviceFixture] });
    const purchasable = buildCompactDecision({ status: "ready", selected: nonempty, safetyGuidance: [adviceFixture] });
    assert.deepEqual(empty.advice, purchasable.advice);
    assert.equal(empty.operationalDecision.purchaseEligible, false);
    assert.notEqual(empty.operationalDecision.nextAction, "confirm_with_user");
    assert.equal(empty.status, "no_purchase");
  });
  it("uses one public status for legacy empty recommendations and their purchasable alternatives", () => {
    const nonempty = adviceOption([adviceFixture]);
    const empty = { ...nonempty, candidateKey: "opt_empty", basket: [], totalPriceMinor: 0, dailyPills: 0 };
    for (const alternatives of [[], [nonempty]]) {
      const projected = publicPlanFields({ alternatives, basket: [], selected: empty, status: "ready",
        coverage: [], questions: [], changeSummary: [], unmetRequirements: [], safetyGuidance: [adviceFixture], summary: "Ready to confirm this basket." });
      assert.equal(projected.status, "no_purchase");
      assert.equal(projected.operationalDecision.status, "no_purchase");
      assert.equal(projected.compactDecision?.status, "no_purchase");
      assert.equal(projected.operationalDecision.purchaseEligible, false);
      assert.equal(projected.operationalDecision.nextAction, alternatives.length ? "review_options" : "no_purchase");
      assert.equal(projected.summaryKey, alternatives.length ? "plan.summary.review_options" : "plan.summary.no_purchase");
      assert.notEqual(projected.summary, "Ready to confirm this basket.");
      assert.equal(projected.compactDecision?.advice[0].threshold, 350);
      if (alternatives.length) assert.ok(projected.options?.some(option => option.candidateKey === nonempty.candidateKey && option.purchaseEligible));
    }
    const purchasable = publicPlanFields({ alternatives: [], basket: nonempty.basket, selected: nonempty, status: "ready",
      coverage: [], questions: [], changeSummary: [], unmetRequirements: [], safetyGuidance: [adviceFixture], summary: "Ready with dose advice." });
    assert.equal(purchasable.status, "ready");
    assert.equal(purchasable.compactDecision?.status, "ready");
    assert.equal(purchasable.operationalDecision.purchaseEligible, true);
  });
  it("retains same-rule advice with different exposure, evidence or uncertainty independently of arrival order", () => {
    const changes: Partial<SafetyGuidance>[] = [
      { exposure: 500 }, { threshold: 300 }, { severity: "info" }, { comparator: "gte" },
      { contributors: [{ productId: "product-b", productName: "Other magnesium", amount: 100, unit: "mg", source: "current" }] },
      { uncertaintyCodes: ["intake_unknown"] }, { uncertainty: "Total intake is unknown." },
      { evidence: ["another-reference"] }, { sourceScope: "total" },
      // Distinct underlying products remain separate even when their concise labels coincide.
      { productIds: ["product-b"] }
    ];
    for (const change of changes) {
      const different = { ...adviceFixture, ...change };
      const first = buildCompactDecision({ status: "ready", selected: adviceOption([different, adviceFixture]), safetyGuidance: [adviceFixture] });
      const reversed = buildCompactDecision({ status: "ready", selected: adviceOption([adviceFixture]), safetyGuidance: [different, adviceFixture] });
      assert.equal(first.advice.length, 2, JSON.stringify(change));
      assert.deepEqual(first.advice, reversed.advice, JSON.stringify(change));
      if (change.exposure !== undefined) assert.deepEqual(first.advice.map(row => row.exposure).sort(), [400, 500]);
    }
  });
  it("never asks to confirm a blocked, pending or incomplete plan", () => {
    for (const [status, nextAction] of [["blocked", "change_request"], ["processing", "poll_plan"], ["needs_input", "answer_questions"]] as const) {
      assert.deepEqual(operationalDecision({ status, replenishesLater: true }), { status, nextAction, purchaseEligible: false });
    }
  });
  it("distinguishes a revision repair from an unanswered decision", () => {
    assert.equal(operationalDecision({ status: "needs_input", hasQuestions: false }).nextAction, "change_request");
  });
  it("does not interpret no purchase as checkout eligibility", () => {
    assert.deepEqual(operationalDecision({ status: "no_purchase" }), { status: "no_purchase", nextAction: "no_purchase", purchaseEligible: false });
  });
  it("retains operational confirmation without a health acknowledgement", () => {
    assert.deepEqual(operationalDecision({ status: "ready", hasSelectedOption: true }), { status: "ready", nextAction: "confirm_with_user", purchaseEligible: true });
    assert.equal(operationalDecision({ status: "ready", hasSelectedOption: false }).purchaseEligible, false);
  });
  it("preserves explicit future-replenishment readiness without asking for a current purchase", () => {
    assert.deepEqual(operationalDecision({ status: "ready", hasSelectedOption: false, purchaseRequiredNow: false, replenishesLater: true }),
      { status: "ready", nextAction: "replenish_later", purchaseEligible: false });
    for (const scenario of [{ complete: true, day: 30, status: "ready", next: "replenish_later" },
      { complete: true, day: 120, status: "no_purchase", next: "no_purchase" },
      { complete: false, day: 30, status: "no_purchase", next: "no_purchase" }]) {
      const projected = publicPlanFields({ alternatives: [], basket: [], selected: null, status: "ready", summary: "Legacy schedule",
        coverage: [], questions: [], changeSummary: [], unmetRequirements: [], safetyGuidance: [adviceFixture],
        horizon: { complete: scenario.complete, durationUnknown: false, nextReplenishmentDay: scenario.day, orders: [],
          purchaseRequiredNow: false, reasonCode: "current_inventory_covers_now", snapshotId: "fixture" } });
      assert.equal(projected.status, scenario.status);
      assert.equal(projected.operationalDecision.nextAction, scenario.next);
      assert.deepEqual(projected.compactDecision?.operationalDecision, projected.operationalDecision);
      assert.equal(projected.compactDecision?.status, projected.status);
    }
  });
});
