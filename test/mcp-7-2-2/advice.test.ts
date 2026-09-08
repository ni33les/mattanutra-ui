import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline } from "../mcp-payload/fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";

function fixture() {
  const plan = structuredClone(baseline.cases[0].plan); assert.ok(plan.options?.[0].advice?.length);
  const template = plan.options[0].advice[0];
  const advice = (id: string, amount: number) => ({ ...template, guidanceId: id, ruleId: id, kind: "dose_review" as const,
    code: "dose_review_required", exposure: amount, threshold: 100, severity: "high" as const, message: `${id}: ${amount} exceeds 100.` });
  plan.options = ["selected", "highlight", "background"].map((optionId, i) => ({ ...structuredClone(plan.options![0]), optionId, advice: [advice(optionId, 150 + i)] }));
  plan.optionId = "selected"; plan.compactDecision = { ...plan.compactDecision!, highlightedAlternativeOptionId: "highlight" };
  plan.safetyGuidance = [];
  return { plan, advice };
}
test("test_conversation_advice_capped_to_selected_and_highlighted", () => {
  const { plan } = fixture(); const result = projectPlan(plan, { responseView: "conversation" });
  assert.deepEqual(result.advice.map(row => row.ruleId), ["selected", "highlight"]); assert.ok(result.advice.length <= 5);
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"] });
  assert.ok(details.ok); assert.deepEqual(details.options[2].advice, plan.options![2].advice);
  const selected = projectPlan({ ...plan, optionId: "background" }, { responseView: "conversation" });
  assert.ok(selected.advice.some(row => row.ruleId === "background"));
});
test("test_incomplete_information_is_plan_level_once", () => {
  const { plan, advice } = fixture();
  for (const [i, option] of plan.options!.entries()) option.advice!.push({ ...advice(`missing-${i}`, 0), code: "incomplete_information", kind: "incomplete_information", threshold: null,
    uncertaintyCodes: [`intake_unknown:${i}`], message: "Intake is unknown.", productIds: [`prd_${i}`] });
  plan.safetyGuidance = [plan.options![0].advice![1]];
  const result = projectPlan(plan, { responseView: "conversation" });
  const rows = result.advice.filter(row => row.kind === "incomplete_information"); assert.equal(rows.length, 1);
  assert.ok(result.planAdviceIds.includes(rows[0].adviceId));
  assert.deepEqual(rows[0].uncertaintyCodes, ["intake_unknown:0", "intake_unknown:1"]);
});
test("test_dose_review_without_threshold_is_not_high_severity", () => {
  const { plan, advice } = fixture();
  plan.options![0].advice = [{ ...advice("ul:missing:d3", 50), threshold: null, nutrientName: "Vitamin D3" }];
  const result = projectPlan(plan, { responseView: "conversation" });
  const missing = result.advice.find(row => row.threshold === null)!; assert.ok(missing);
  assert.equal(missing.kind, "incomplete_information"); assert.equal(missing.severity, "info");
  assert.ok(result.advice.some(row => row.threshold === 100 && row.severity === "high"));
});
test("test_no_float_junk_in_messages", () => {
  const { plan, advice } = fixture(); plan.options![0].advice = [{ ...advice("measured", 0.1 + 0.2), threshold: 0.2 }];
  const result = projectPlan(plan, { responseView: "conversation" });
  assert.match(result.advice[0].message, /0\.3 exceeds/); assert.doesNotMatch(result.advice[0].message, /30000000000000004/);
  assert.equal(result.advice[0].exposure, 0.1 + 0.2, "Formatting must not change numerical evidence");
});
