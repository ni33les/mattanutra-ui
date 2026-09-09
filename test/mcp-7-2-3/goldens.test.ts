import { startMemoryTaskExecutor } from "../helpers/completed-mcp-client.ts";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { installCatalogue, goldens } from "./helpers.ts";
import { runtime, rpc, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import type { PlanSuccessWire, PlanConversationWire } from "../../lib/agentic/contract/outputs.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
const app = runtime("m723-goldens");
const results: Record<string, { create: Record<string, unknown>; conversation: PlanConversationWire; full: PlanSuccessWire; elapsedMs: number }> = {};
let stopWorker: (() => Promise<void>) | undefined;
before(async () => {
  stopWorker = startMemoryTaskExecutor(app);
  await installCatalogue(); useLiveServiceClock();
  for (const [name, request] of Object.entries(goldens)) {
    const start = performance.now();
    const create = await rpc(app, "plan", { operation: "create", idempotencyKey: `m723-golden-request-${name}`, searchEffort: "standard", request });
    let result = create;
    while (result.status === "processing" && performance.now() - start < 15000) {
      await delay(1000); result = await rpc(app, "plan", { operation: "get", planHandle: create.planHandle, responseView: "status" });
    }
    const conversation = await rpc(app, "plan", { operation: "get", planHandle: create.planHandle });
    const elapsedMs = performance.now() - start;
    const full = await rpc(app, "plan", { operation: "get", planHandle: create.planHandle, responseView: "full" });
    assert.equal(full.ok, true, JSON.stringify(full)); assert.equal(full.status, "ready");
    results[name] = { create, conversation: conversation as unknown as PlanConversationWire, full: full as unknown as PlanSuccessWire, elapsedMs };
  }
});
after(async () => {
  await stopWorker?.();
  if (process.env.MCP_723_EVIDENCE_DIR) writeFileSync(`${process.env.MCP_723_EVIDENCE_DIR}/exact-goldens.json`, JSON.stringify({ requests: goldens, results }, null, 2), { flag: "wx" });
  resetPlanCreateInflightForTests(); uninstallRealCatalogue();
});
test("d3_2000_selected_is_one_product_and_at_most_two_pills", () => {
  const { full } = results.d3, selected = full.options!.find(row => row.optionId === full.optionId)!;
  assert.equal(selected.basket!.length, 1); assert.equal(selected.basket![0].productName, "Blackmores Vitamin D3 1000 IU");
  assert.equal(selected.basket![0].servingsPerDay, 2); assert.equal(selected.stackSummary.totalDailyPills, 2); assert.equal(selected.doseFit!.total, 0);
});
test("highlighted_alternative_is_a_different_option", () => {
  for (const { conversation: value, full } of Object.values(results)) {
    assert.ok(value.options.length > 1, "An alternative must actually exist");
    assert.ok(value.highlightedAlternativeOptionId && value.highlightedAlternativeOptionId !== value.selectedOptionId);
    assert.ok(value.options.some(row => row.optionId === value.highlightedAlternativeOptionId));
    assert.ok(full.options!.some(row => row.optionId === value.highlightedAlternativeOptionId && row.purchaseEligible));
  }
});
test("k2_plus_d3_does_not_require_a_calcium_stack_when_a_simpler_option_exists", () => {
  const { full, conversation } = results.k2_d3;
  const simpler = full.options!.find(row => row.purchaseEligible && row.basket?.length === 1 && row.coverage?.some(c => c.name === "Vitamin D3" && c.coveragePercent === 100) && row.coverage?.some(c => c.name === "Vitamin K2" && c.remainingGap > 0));
  assert.ok(simpler, "The frozen catalogue must return the D3-only choice with an explicit K2 gap");
  const selected = full.options!.find(row => row.optionId === full.optionId)!;
  assert.ok(selected.basket!.length === 1 || (/1.product/i.test(conversation.summary) && /K2/.test(conversation.summary) && /D3/.test(conversation.summary) && /90\s*mcg/.test(conversation.summary)), "An incidental stack must disclose the one-product alternative and its exact missing K2 amount in summary");
});
test("locks_omit_views_status_speed_and_unassessed_context", async () => {
  for (const { create, conversation } of Object.values(results)) {
    assert.equal(create.responseView, "conversation"); assert.equal(conversation.responseView, "conversation");
    const status = await rpc(app, "plan", { operation: "get", planHandle: conversation.planHandle, responseView: "status" });
    const same = await rpc(app, "plan", { operation: "get", planHandle: conversation.planHandle, responseView: "status", knownResultVersion: status.resultVersion });
    assert.equal(same.unchanged, true); assert.ok(Buffer.byteLength(JSON.stringify(same)) < 2000);
  }
  assert.ok(results.d3.elapsedMs <= 15000);
  for (const locale of ["en", "th", "zh-CN"]) {
    const projected = projectPlan({ ...results.d3.full, locale }, { responseView: "conversation" });
    assert.ok(Buffer.byteLength(JSON.stringify(projected)) < 20000);
    assert.ok(Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: 1, result: toolResult(projected) })) < 22000);
    assert.ok(projected.advice.length <= 5);
    assert.equal(projected.advice.filter(row => row.kind === "incomplete_information").length, 1);
    assert.deepEqual(projected.options.map(row => row.optionId), results.d3.full.options!.map(row => row.optionId));
  }
  const detail = await rpc(app, "plan", { operation: "get", planHandle: results.k2_d3.conversation.planHandle, responseView: "details", expectedRevision: results.k2_d3.conversation.revision, sections: ["advice"] });
  assert.ok(detail.safetyGuidance.length, "Detailed advice must remain accessible through the public tool");
  assert.ok(results.k2_d3.conversation.advice.every(row => !("message" in row)));
  const text = detail.safetyGuidance.map(row => row.message).join(" ");
  assert.match(text, /apixaban/); assert.match(text, /atrial_fibrillation/); assert.match(text, /not (?:been )?assessed/);
});
