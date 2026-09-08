import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline } from "../mcp-payload/fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
function fixture() {
  const plan = structuredClone(baseline.cases[0].plan); assert.ok(plan.options?.[0]?.advice?.length);
  const template = plan.options[0].advice[0];
  plan.optionId = plan.options[0].optionId; plan.compactDecision = { ...plan.compactDecision!, highlightedAlternativeOptionId: null };
  plan.options = [plan.options[0]]; plan.safetyGuidance = [];
  plan.options[0].advice = Array.from({ length: 8 }, (_, i) => ({ ...template, guidanceId: `distinct-${i}`, ruleId: `ul:measured:${i}`, kind: "dose_review" as const, code: "dose_review_required", nutrientName: `Nutrient ${i}`, exposure: 110 + i, threshold: 100, unit: "mg", severity: "high" as const, message: `Nutrient ${i}: ${110 + i} mg exceeds 100 mg.` }));
  return plan;
}
test("conversation_has_at_most_five_advice_rows", () => {
  const plan = fixture(), result = projectPlan(plan, { responseView: "conversation" });
  assert.ok(result.advice.length <= 5); assert.ok(result.advice.length > 0);
  const lines = result.advice.map(row => row.message).join(" ");
  for (let i = 0; i < 8; i++) { assert.ok(lines.includes(`Nutrient ${i}`)); assert.ok(lines.includes(String(110 + i))); }
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"] });
  assert.ok(details.ok); assert.deepEqual(details.options[0].advice, plan.options![0].advice);
  assert.ok(result.options[0].adviceIds.every(id => result.advice.some(row => row.adviceId === id)));
});
test("incomplete_information_appears_once", () => {
  const plan = fixture(); const row = plan.options![0].advice![0];
  plan.options![0].advice!.push(...["diet", "medications"].map(id => ({ ...row, guidanceId: id, kind: "incomplete_information" as const, code: "incomplete_information", threshold: null, message: `${id} unknown`, uncertaintyCodes: [id] })));
  const result = projectPlan(plan, { responseView: "conversation" });
  const incomplete = result.advice.filter(row => row.kind === "incomplete_information"); assert.equal(incomplete.length, 1); assert.ok(result.planAdviceIds.includes(incomplete[0].adviceId));
  assert.deepEqual(incomplete[0].uncertaintyCodes, ["diet", "medications"]); assert.ok(result.advice.length <= 5);
});
test("dose_review_with_no_threshold_is_not_high_severity", () => {
  const plan = fixture(); plan.options![0].advice = [{ ...plan.options![0].advice![0], threshold: null, messageKey: "guidance.references_unknown", ruleId: "ul:missing:d3" }];
  const result = projectPlan(plan, { responseView: "conversation" }); assert.equal(result.advice.length, 1);
  assert.equal(result.advice[0].kind, "incomplete_information"); assert.equal(result.advice[0].severity, "info");
});
test("advice_messages_have_no_float_junk", () => {
  const plan = fixture(); plan.options![0].advice![0].message = "Exposure 0.30000000000000004 mg; reference 0.2 mg.";
  const result = projectPlan(plan, { responseView: "conversation" });
  assert.doesNotMatch(result.advice.map(row => row.message).join(" "), /\d+\.\d{13,}/);
});
