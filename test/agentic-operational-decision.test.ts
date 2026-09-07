import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationalDecision } from "../lib/agentic/value/operational-decision.ts";
import { buildCompactDecision } from "../lib/agentic/value/compact-decision.ts";
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
    optionId: "opt_advice_fixture", basket: [], coverage: [], coveragePercent: 0, dailyPills: 0,
    matcherVersion: "fixture", snapshotId: "fixture", totalPriceMinor: 0, reason: "fixture",
    safety: { assessedConditionCodes: [], assessedMedicationCodes: [], guidance }
  };
}

describe("one operational decision", () => {
  it("concise copy counts unresolved targets instead of claiming their names are covered", () => {
    const selected = { optionId: "opt_partial_fixture", basket: [], coverage: [
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
});
