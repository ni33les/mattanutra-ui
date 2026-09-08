import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline } from "../mcp-payload/fixtures.ts";
import { speakableMessage } from "../../lib/agentic/presentation/conversation-advice.ts";
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
  const ids = result.advice.flatMap(row => row.guidanceIds);
  for (let i = 0; i < 8; i++) assert.ok(ids.includes(`distinct-${i}`));
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"] });
  assert.ok(details.ok); assert.deepEqual(details.options[0].advice, plan.options![0].advice);
  assert.equal(details.options[0].advice!.length, 8);
  const other = structuredClone(plan.options![0]); other.optionId = "highlighted";
  other.advice = [{ ...other.advice![0], guidanceId: "highlighted-finding", exposure: 299, message: "Nutrient 0: 299 mg exceeds 100 mg." }];
  plan.options!.push(other); plan.compactDecision!.highlightedAlternativeOptionId = other.optionId;
  const together = projectPlan(plan, { responseView: "conversation" });
  const specific = together.advice.find(row => row.guidanceIds.includes("highlighted-finding"));
  assert.ok(specific); assert.deepEqual(specific.optionIds, ["highlighted"]);
  for (const locale of ["th", "zh-CN"]) {
    const localized = projectPlan({ ...plan, locale }, { responseView: "conversation" });
    assert.ok(localized.advice.length <= 5); assert.deepEqual(localized.advice, together.advice);
    assert.ok(localized.advice.every(row => !("message" in row) && !("findings" in row)));
  }
});
test("incomplete_information_appears_once", () => {
  const plan = fixture(); const row = plan.options![0].advice![0];
  plan.options![0].advice!.push(...["diet", "medications"].map(id => ({ ...row, guidanceId: id, kind: "incomplete_information" as const, code: "incomplete_information", threshold: null, message: `${id} unknown`, uncertaintyCodes: [id] })));
  const result = projectPlan(plan, { responseView: "conversation" });
  const incomplete = result.advice.filter(row => row.kind === "incomplete_information"); assert.equal(incomplete.length, 1); assert.ok(result.planAdviceIds.includes(incomplete[0].adviceId));
  assert.deepEqual(incomplete[0].guidanceIds, ["diet", "medications"]); assert.ok(result.advice.length <= 5);
});
test("dose_review_with_no_threshold_is_not_high_severity", () => {
  const plan = fixture(); plan.options![0].advice = [{ ...plan.options![0].advice![0], threshold: null, messageKey: "guidance.references_unknown", ruleId: "ul:missing:d3" }];
  const result = projectPlan(plan, { responseView: "conversation" }); assert.equal(result.advice.length, 1);
  assert.equal(result.advice[0].kind, "incomplete_information"); assert.equal(result.advice[0].severity, "info");
});
test("advice_messages_have_no_float_junk", () => {
  const plan = fixture(); plan.options![0].advice![0].message = "Exposure 0.30000000000000004 mg; reference 0.2 mg.";
  const message = speakableMessage(plan.options![0].advice![0].message);
  assert.doesNotMatch(message, /\d+\.\d{13,}/); assert.match(message, /0\.3 mg/);
});
