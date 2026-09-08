import assert from "node:assert/strict";
import { test } from "node:test";
import { assessPreferences } from "../../lib/matcher/preferences.ts";
import { publicPlanFields, publicSafetyGuidance } from "../../lib/agentic/public-mapper.ts";
import { buildCompactDecision } from "../../lib/agentic/value/compact-decision.ts";
import type { SafetyGuidance } from "../../lib/agentic/plan/types.ts";
import { choice } from "./choice-fixtures.ts";

function finding(code: SafetyGuidance["code"]): SafetyGuidance {
  return { code, action: "review", guidanceId: `gdn:${code}`, ruleId: "frozen-rule", rulesVersion: "frozen-reference",
    severity: code === "duplicate_or_overlap" ? "info" : "high", message: "Preserved rule advice.", messageKey: `guidance.${code}`,
    productIds: ["product"], supplementIds: ["a"], nutrientName: "A", sourceScope: "supplemental", exposure: 400,
    threshold: 350, comparator: "gt", unit: "mg", contributors: [{ productId: "product", productName: "Product", amount: 400, unit: "mg", source: "selected" }],
    authorityUrl: "https://example.test/frozen-reference", evidence: ["frozen-evidence"], uncertainty: "Diet remains unknown.", uncertaintyCodes: ["unknown_diet"] };
}
test("AXR-ADV-01 classifies rule families explicitly while preserving their exposure and source evidence", () => {
  for (const [code, kind] of [["dose_review_required", "dose_review"], ["continued_dose_increased", "dose_review"],
    ["duplicate_or_overlap", "overlap"], ["medication_interaction", "interaction"], ["incomplete_information", "incomplete_information"],
    ["unverified_product_facts", "product_data"], ["audience_mismatch", "other"]] as const) {
    const source = finding(code), selected = { ...choice("product", [100]), safety: { assessedConditionCodes: [], assessedMedicationCodes: [], guidance: [source] } };
    const mapped = publicSafetyGuidance(source), compact = buildCompactDecision({ status: "ready", selected });
    assert.equal(mapped.kind, kind); assert.equal(compact.advice[0]!.kind, kind);
    for (const field of ["ruleId", "rulesVersion", "exposure", "threshold", "authorityUrl", "severity", "uncertainty", "evidence"] as const) {
      assert.deepEqual(mapped[field], source[field]); assert.deepEqual(compact.advice[0]![field], source[field]);
    }
    assert.equal(mapped.acknowledgementStatus, "not_required");
    assert.equal(compact.operationalDecision.purchaseEligible, true);
  }
});

test("AXR-ADV-02 incomplete pill totals expose a verified lower bound consistently in every public projection", () => {
  const selected = choice("mixed", [100], 1, 100, 3);
  const basket = selected.basket.map((item, index) => ({ ...item, dailyPills: [3, 1, 0][index]!, pillCountKnown: index < 2 }));
  const result = publicPlanFields({ status: "ready", selected: { ...selected, basket }, alternatives: [], basket, coverage: selected.coverage,
    questions: [], safetyGuidance: [], changeSummary: [], unmetRequirements: [], summary: "Available with advice.",
    requestSnapshot: { locale: "en", targets: [], currentSupplements: [], requirements: { maxDailyPills: 1 } } });
  for (const rows of [result.preferenceAssessment!, result.compactDecision!.preferenceAssessment!, result.options![0]!.preferenceAssessment!]) {
    const pills = rows.find(row => row.kind === "daily_pills")!;
    assert.equal(pills.actual, null); assert.equal(pills.actualLowerBound, 4); assert.equal(pills.complete, false);
    assert.equal(pills.status, "unknown"); assert.equal(pills.delta, null); assert.equal(pills.percent, null); assert.equal(pills.prominent, true);
    assert.match(pills.message, /at least 4.*total.*unknown/i);
  }
  assert.equal(result.operationalDecision.purchaseEligible, true);
});

test("AXR-ADV-02 lower-bound prominence uses the exact strict 20% boundary and does not invent negative or zero totals", () => {
  for (const [preferred, lower, prominent] of [[1, 1.2, false], [1, 1.200001, true], [0, 0, false], [0, .01, true]] as const) {
    for (const locale of ["en", "th", "zh-CN"]) {
      const row = assessPreferences({ maxDailyPills: preferred }, { dailyPills: null, dailyPillsLowerBound: lower, productCount: 2, firstOrderGoodsPriceMinor: 100, currency: "THB" }, locale)[1]!;
      assert.equal(row.actualLowerBound, lower); assert.equal(row.prominent, prominent); assert.equal(row.actual, null); assert.equal(row.percent, null);
      assert.equal(row.message.includes("plan.preference."), false);
    }
  }
});

test("AXR-ADV-03 advice is visible on a selectable option without health acknowledgement", () => {
  const selected = { ...choice("selected", [100]), safety: { assessedConditionCodes: ["atrial_fibrillation"], assessedMedicationCodes: ["apixaban"], guidance: [finding("medication_interaction")] } };
  const result = publicPlanFields({ status: "ready", selected, alternatives: [], basket: selected.basket, coverage: selected.coverage,
    questions: [], safetyGuidance: selected.safety.guidance, changeSummary: [], unmetRequirements: [], summary: "Advice remains visible." });
  assert.equal(result.acknowledgementStatus, "not_required"); assert.equal(result.operationalDecision.purchaseEligible, true);
  assert.ok(result.compactDecision!.advice.some(row => row.kind === "interaction"));
  assert.ok(result.options![0]!.advice!.some(row => row.kind === "interaction"));
});
