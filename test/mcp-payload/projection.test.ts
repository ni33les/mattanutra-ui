import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline, bytes } from "./fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import { AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from "../../lib/agentic/contract/index.ts";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";

const sections = ["request", "products", "coverage", "advice", "score", "economics"] as const;
test("PAY-VIEW-01 eighteen frozen decisions retain all choices, doses, amounts, unknowns and foreground advice below 40% bytes", () => {
  let originalBytes = 0, conciseBytes = 0;
  for (const { plan, caseId } of baseline.cases) {
    const compact = projectPlan(plan, { responseView: "conversation" });
    assert.equal(compact.ok, true); assert.ok("options" in compact);
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, compact), [], caseId);
    assert.deepEqual(compact.options.map(row => row.optionId), plan.options!.map(row => row.optionId));
    assert.equal(compact.selectedOptionId, plan.optionId);
    assert.equal(compact.highlightedAlternativeOptionId, plan.compactDecision?.highlightedAlternativeOptionId ?? null);
    assert.deepEqual(compact.operationalDecision, plan.operationalDecision);
    assert.ok(!("basket" in compact)); assert.ok(!("doseFit" in compact)); assert.ok(!("orderSchedule" in compact));
    for (const [i, option] of compact.options.entries()) {
      const old = plan.options![i];
      assert.deepEqual(Object.keys(option).sort(), ["coveragePercent", "optionId", "reason", "roles", "stackSummary"]);
      assert.deepEqual(option.stackSummary, old.stackSummary);
      assert.equal(option.coveragePercent, old.coveragePercent);
      const foreground = option.optionId === compact.selectedOptionId || option.optionId === compact.highlightedAlternativeOptionId;
      const inline = compact.advice.filter(row => row.optionIds.includes(option.optionId));
      if (!foreground) assert.deepEqual(inline, []);
      else for (const finding of old.advice ?? []) assert.ok(inline.some(row => row.guidanceIds.includes(finding.guidanceId)), finding.ruleId);
      const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["products", "coverage", "advice"], optionIds: [option.optionId] });
      assert.ok(details.ok);
      for (const key of ["basket", "coverage", "advice"] as const) assert.deepEqual(details.options[0][key], old[key]);

    }
    originalBytes += bytes(toolResult(plan)); conciseBytes += bytes(toolResult(compact));
  }
  assert.ok(conciseBytes <= originalBytes * .4, `${conciseBytes}/${originalBytes}`);
});

test("PAY-VIEW-02 batch details return exact stored sections and reject unknown options and stale revisions", () => {
  const plan = { ...baseline.cases[0].plan, originalRequest: baseline.cases[0].request };
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: [...sections] });
  assert.ok(details.ok && "options" in details && "originalRequest" in details);
  assert.deepEqual(details.originalRequest, plan.originalRequest);
  for (const [i, row] of details.options.entries()) for (const key of ["basket", "coverage", "advice", "doseFit", "economics"] as const) assert.deepEqual(row[key], plan.options![i][key]);
  assert.deepEqual(details.orderSchedule, plan.orderSchedule);
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, details), []);
  const subset = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: [plan.options![1].optionId] });
  assert.ok(subset.ok && "options" in subset); assert.equal(subset.options.length, 1); assert.ok(!("basket" in subset.options[0]));
  assert.equal(projectPlan(plan, { responseView: "details", expectedRevision: plan.revision + 1, sections: ["advice"] }).ok, false);
  assert.equal(projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: ["opt_unknown"] }).ok, false);
  assert.strictEqual(projectPlan(plan, {}), plan);
});

test("PAY-VIEW-03 advice with identical rule IDs but different exposure, source or uncertainty stays distinct", () => {
  const plan = structuredClone(baseline.cases[0].plan);
  plan.optionId = plan.options![0].optionId;
  const first = plan.options![0].advice![0];
  plan.options![0].advice!.push({ ...first, exposure: 999, threshold: 100, authorityUrl: "https://example.org/reference", uncertainty: "Different measured exposure" });
  const compact = projectPlan(plan, { responseView: "conversation" });
  assert.ok(compact.ok && "advice" in compact && "options" in compact);
  const ids = compact.advice.filter(row => row.optionIds.includes(compact.options[0].optionId)).flatMap(row => row.guidanceIds);
  assert.ok(ids.includes(first.guidanceId));
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: [compact.options[0].optionId] });
  assert.ok(details.ok); const advice = details.options[0].advice!;
  assert.equal(advice.length, plan.options![0].advice!.length);
  assert.deepEqual(advice, plan.options![0].advice);
  assert.ok(advice.some(row => row.exposure === 999 && row.threshold === 100));
});

test("PAY-VIEW-04 plan-wide advice survives empty and processing decisions without a product option", () => {
  const plan = structuredClone(baseline.cases[0].plan);
  plan.options = []; plan.basket = []; plan.status = "processing";
  assert.ok(plan.safetyGuidance!.length > 0);
  const compact = projectPlan(plan, { responseView: "conversation" });
  const planFlags = compact.advice.filter(row => compact.planAdviceIds.includes(row.adviceId));
  for (const finding of plan.safetyGuidance!) assert.ok(planFlags.some(row => row.guidanceIds.includes(finding.guidanceId)));
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"] });
  assert.ok(details.ok); assert.deepEqual(details.safetyGuidance, plan.safetyGuidance);
  assert.ok(compact.planAdviceIds.length > 0);
});
