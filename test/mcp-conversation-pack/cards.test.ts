import assert from "node:assert/strict";
import { test } from "node:test";
import { d3Fixture } from "./helpers.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import { validateToolIssues, AGENTIC_OUTPUT_SCHEMAS } from "../../lib/agentic/contract/index.ts";

test("test_conversation_omits_advice_bodies", () => {
  const plan = d3Fixture(), before = structuredClone(plan);
  const conversation = projectPlan(plan, { responseView: "conversation" });
  assert.ok(conversation.advice.length > 0);
  for (const row of conversation.advice) {
    assert.deepEqual(Object.keys(row).sort(), ["adviceId", "guidanceIds", "kind", "optionIds", "severity"]);
  }
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"] });
  assert.ok(details.ok); assert.ok(details.options.some(option => option.advice?.some(row => row.message.length > 160)));
  for (const [i, option] of details.options.entries()) assert.deepEqual(option.advice, before.options![i].advice);
  assert.deepEqual(plan, before, "Presentation cannot rewrite stored advice");
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, conversation), []);
});

test("test_conversation_options_are_cards_not_baskets", () => {
  const plan = d3Fixture(), conversation = projectPlan(plan, { responseView: "conversation" });
  assert.equal(conversation.options.length, 3);
  const optionIds = conversation.options.map(option => option.optionId);
  assert.deepEqual(optionIds, plan.options!.map(option => option.optionId));
  for (const [i, card] of conversation.options.entries()) {
    assert.deepEqual(Object.keys(card).sort(), ["coveragePercent", "optionId", "reason", "roles", "stackSummary"]);
    assert.deepEqual(card.stackSummary, plan.options![i].stackSummary);
    assert.equal(card.coveragePercent, plan.options![i].coveragePercent);
    assert.deepEqual(card.roles, plan.options![i].roles);
    assert.ok(card.reason.length <= 160);
  }
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["products", "coverage"], optionIds });
  assert.ok(details.ok); assert.equal(details.options.length, 3);
  for (const [i, option] of details.options.entries()) {
    assert.deepEqual(option.basket, plan.options![i].basket); assert.deepEqual(option.coverage, plan.options![i].coverage);
    assert.ok(!("advice" in option));
  }
});

test("test_conversation_highlighted_option_has_no_high_product_data_wall", () => {
  const plan = d3Fixture(), highlighted = plan.compactDecision!.highlightedAlternativeOptionId;
  const original = plan.options!.find(option => option.optionId === highlighted); assert.ok(original);
  assert.equal(original.stackSummary.supplyDays, null);
  assert.ok(original.advice!.some(row => row.kind === "product_data" && row.severity === "high" && row.message.length > 160));
  const conversation = projectPlan(plan, { responseView: "conversation" });
  assert.equal(conversation.options.find(option => option.optionId === highlighted)!.stackSummary.supplyDays, null);
  assert.ok(conversation.advice.every(row => !("message" in row) && !("findings" in row)));
  const details = projectPlan(plan, { responseView: "details", expectedRevision: plan.revision, sections: ["advice"], optionIds: [highlighted!] });
  assert.ok(details.ok); assert.equal(details.options.length, 1); assert.deepEqual(details.options[0].advice, original.advice);
});
