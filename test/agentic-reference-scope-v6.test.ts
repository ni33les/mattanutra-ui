import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { coverageFor } from "../lib/agentic/plan/matching.ts";
import { resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";

function state(basis: "supplemental" | "total_daily" = "supplemental"): CanonicalPlanState {
  return { acceptedGaps: [], conditionCodes: [], currency: "THB", destinationCountry: "TH", leftovers: [], locale: "en",
    medicationCodes: [], optimization: "fewest_pills", pinnedCandidateKey: null, requirements: {}, safetyAcknowledgement: null,
    profile: { ageYears: 40, lifeStage: "adult", sex: "female" },
    targets: [{ supplementId: "sup_d3", name: "Vitamin D3", amount: 150, unit: "mcg", basis }],
    currentSupplements: [{ supplementId: "sup_d3", name: "Current D3", dailyAmount: 80, unit: "mcg" }],
    intake: [{ id: "diet_d3", supplementId: "sup_d3", name: "Diet D3", source: "diet", certainty: "known", amount: 30, unit: "mcg" }] };
}

test("ANNA-REF-01 an active total reference replaces a retired supplemental reference without losing dietary exposure", () => {
  try {
    setMatcherSafetyCeilings([{ subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "total",
      maxAmount: 100, maxUnit: "mcg", bandId: "total-reference", bandVersion: 7, authorityUrl: "https://fixture.example/reference" }]);
    const [row] = coverageFor(state(), null);
    assert.equal(row.upperLimitAmount, 100); assert.equal(row.sourceScope, "total");
    assert.equal(row.ruleId, "total-reference"); assert.equal(row.rulesVersion, "7");
    assert.equal(row.percentOfUpperLimit, 110);
    assert.equal(row.currentAmount, 80, "A total safety reference does not change the customer's supplemental target arithmetic");
    assert.equal(row.totalExposureAmount, 110);
  } finally { resetMatcherSafetyCeilings(); }
});

test("ANNA-REF-02 reference population and target basis select the appropriate active scope", () => {
  try {
    setMatcherSafetyCeilings([
      { subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "supplemental", maxAmount: 90, maxUnit: "mcg", bandId: "supp-reference" },
      { subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "total", maxAmount: 100, maxUnit: "mcg", bandId: "total-reference" },
      { subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "child_4_8", sourceScope: "total", maxAmount: 75, maxUnit: "mcg", bandId: "child-reference" }
    ]);
    const [supplemental] = coverageFor(state(), null), [total] = coverageFor(state("total_daily"), null);
    assert.equal(supplemental.ruleId, "supp-reference"); assert.equal(supplemental.percentOfUpperLimit, 89);
    assert.equal(total.ruleId, "total-reference"); assert.equal(total.percentOfUpperLimit, 110);
    const child = { ...state("total_daily"), profile: { ageYears: 6, lifeStage: "child" as const, sex: "female" as const } };
    assert.equal(coverageFor(child, null)[0].ruleId, "child-reference");
  } finally { resetMatcherSafetyCeilings(); }
});

test("ANNA-REF-03 unknown diet cannot certify total exposure below an active total reference", () => {
  try {
    setMatcherSafetyCeilings([{ subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "total",
      maxAmount: 100, maxUnit: "mcg", bandId: "total-reference", referenceConfidence: "high" }]);
    const input = { ...state(), intake: [] };
    const coverage = coverageFor(input, null);
    assert.equal(coverage[0].totalExposureAmount, 80);
    assert.equal(coverage[0].totalExposureComplete, false);
    assert.equal(coverage[0].intakeCertainty, "unknown");
    const advice = evaluateSafety({ coverage, locale: "en", selected: null, state: input });
    assert.ok(advice.some(item => item.code === "incomplete_information" && item.uncertaintyCodes?.includes("intake_unknown:sup_d3")));
  } finally { resetMatcherSafetyCeilings(); }
});

test("ANNA-REF-04 internal advice thresholds preserve low confidence and rationale with one active total assessment", () => {
  try {
    setMatcherSafetyCeilings([{ subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "total",
      maxAmount: 100, maxUnit: "mcg", bandId: "internal-reference", bandVersion: 9, referenceConfidence: "low",
      authorityUrl: "https://fixture.example/review", basisRationale: "Internal advisory threshold; no established clinical UL" }]);
    const input = state(), coverage = coverageFor(input, null);
    assert.equal(coverage[0].referenceConfidence, "low");
    assert.match(coverage[0].basisRationale!, /Internal advisory/);
    const advice = evaluateSafety({ coverage, locale: "en", selected: null, state: input });
    const referenceAdvice = advice.filter(item => item.code === "dose_review_required");
    assert.equal(referenceAdvice.length, 1);
    assert.equal(referenceAdvice[0].sourceScope, "total");
    assert.equal(referenceAdvice[0].ruleId, "internal-reference");
    assert.equal(referenceAdvice[0].referenceConfidence, "low");
    assert.equal(referenceAdvice[0].basisRationale, coverage[0].basisRationale);
    assert.ok(referenceAdvice[0].uncertaintyCodes?.includes("reference_unverified"));
    assert.equal(referenceAdvice[0].action, "review", "Health reference advice is never a purchase veto");
  } finally { resetMatcherSafetyCeilings(); }
});

test("ANNA-REF-05 direct advice without coverage still finds an active total reference", () => {
  try {
    setMatcherSafetyCeilings([{ subjectId: "sup_d3", name: "Vitamin D3", lifeStage: "adult", sourceScope: "total",
      maxAmount: 100, maxUnit: "mcg", bandId: "total-reference", referenceConfidence: "high" }]);
    const advice = evaluateSafety({ locale: "en", selected: null, state: state() });
    const threshold = advice.filter(item => item.code === "dose_review_required");
    assert.equal(threshold.length, 1);
    assert.equal(threshold[0].ruleId, "total-reference");
    assert.equal(threshold[0].sourceScope, "total");
    assert.equal(threshold[0].threshold, 100);
    assert.equal(threshold[0].action, "review");
  } finally { resetMatcherSafetyCeilings(); }
});
