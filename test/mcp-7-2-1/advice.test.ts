import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline } from "../mcp-payload/fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import { adviceKind } from "../../lib/agentic/value/advice-kind.ts";
import { AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from "../../lib/agentic/contract/index.ts";

function fixture() {
  const plan = structuredClone(baseline.cases[0].plan);
  assert.ok(plan.options?.length && plan.options[0].advice?.length);
  const template = plan.options[0].advice[0];
  const finding = (id: string) => ({ ...template, guidanceId: id, ruleId: id, kind: "dose_review" as const,
    exposure: 200, threshold: 100, message: `${id} exceeds 100`, severity: "high" as const });
  plan.options = ["selected", "highlight", "background"].map(optionId => ({ ...structuredClone(plan.options![0]), optionId, advice: [finding(optionId)] }));
  plan.optionId = "selected";
  plan.compactDecision = { ...plan.compactDecision!, highlightedAlternativeOptionId: "highlight" };
  plan.safetyGuidance = [finding("plan-wide")];
  return { plan, finding };
}

test("M721-ADVICE-01 only foreground and plan-wide advice is inline; other options and complete details survive", () => {
  const { plan } = fixture(); const original = structuredClone(plan);
  const result = projectPlan(plan, { responseView: "conversation" });
  assert.deepEqual(result.options.map(row => row.optionId), ["selected", "highlight", "background"]);
  assert.deepEqual(result.advice.flatMap(row => row.guidanceIds).sort(), ["highlight", "plan-wide", "selected"]);
  assert.ok(!result.advice.some(row => row.optionIds.includes("background")));
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: ["background"] });
  assert.ok(details.ok); assert.deepEqual(details.options[0].advice, original.options![2].advice);
  plan.optionId = "background";
  assert.ok(projectPlan(plan, { responseView: "conversation" }).advice.some(row => row.guidanceIds.includes("background")));
  assert.strictEqual(projectPlan(plan, { responseView: "full" }), plan);
});

test("M721-ADVICE-02 missing references collapse without erasing measured excess or interaction facts", () => {
  const { plan, finding } = fixture();
  plan.options![0].advice = [
    ...["calcium", "vitamin_d"].map(name => ({ ...finding(`ul:missing:${name}`), threshold: null, supplementIds: [name], message: "Old missing-reference wording" })),
    finding("actual-excess"), { ...finding("interaction"), kind: "interaction", code: "medication_interaction" }
  ];
  for (const locale of ["en", "th", "zh-CN"]) {
    plan.locale = locale;
    const result = projectPlan(plan, { responseView: "conversation" });
    const missing = result.advice.filter(row => row.kind === "incomplete_information");
    assert.equal(missing.length, 1); assert.equal(missing[0].severity, "info");
    assert.deepEqual(missing[0].guidanceIds, ["ul:missing:calcium", "ul:missing:vitamin_d"]);
    assert.ok(result.advice.some(row => row.guidanceIds.includes("actual-excess") && row.severity === "high"));
    assert.ok(result.advice.some(row => row.guidanceIds.includes("interaction") && row.kind === "interaction"));
    const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: ["selected"] });
    assert.ok(details.ok); assert.deepEqual(details.options[0].advice, plan.options![0].advice);
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, result), []);
  }
  assert.equal(plan.options![0].advice![0].message, "Old missing-reference wording", "Projection cannot rewrite stored evidence");
});

test("M721-ADVICE-03 explicit missing-reference rule classification does not change other dose or interaction rules", () => {
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:missing:d3" }), "incomplete_information");
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:total:d3" }), "dose_review");
  assert.equal(adviceKind({ code: "medication_interaction" }), "interaction");
});
