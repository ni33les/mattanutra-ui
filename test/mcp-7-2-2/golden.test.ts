import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { writeFileSync } from "node:fs";
import { installRealCatalogue, uninstallRealCatalogue, runtime } from "../ax-refinement/helpers.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import type { PlanSuccessWire } from "../../lib/agentic/contract/outputs.ts";

const app = runtime("m722-d3");
const request = { locale: "en", destinationCountry: "TH", optimization: "lowest_cost", profile: {}, requirements: {}, currentSupplements: [],
  targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "total_daily" }] };
let full: PlanSuccessWire, conversation: Record<string, unknown>, elapsedMs: number;
const calls: unknown[] = [];
async function call(args: Record<string, unknown>) {
  const reply = await handleJsonRpc(app, { id: 1, method: "tools/call", params: { name: "plan", arguments: args } });
  assert.ok(reply?.result, JSON.stringify(reply));
  const value = reply.result.structuredContent as Record<string, unknown>;
  assert.equal(value.ok, true, JSON.stringify(value)); calls.push({ args, reply }); return { reply, value };
}
before(async () => {
  await installRealCatalogue("dev"); useLiveServiceClock();
  const start = performance.now();
  let result = await call({ operation: "create", idempotencyKey: "m722-d3-golden-create", request });
  assert.equal(result.value.responseView, "conversation");
  while (result.value.status === "processing" && performance.now() - start < 15000) {
    await delay(1000); result = await call({ operation: "get", planHandle: result.value.planHandle, responseView: "status" });
  }
  result = await call({ operation: "get", planHandle: result.value.planHandle });
  conversation = result.value; elapsedMs = performance.now() - start;
  assert.equal(conversation.responseView, "conversation"); assert.equal(conversation.status, "ready");
  full = (await call({ operation: "get", planHandle: conversation.planHandle, responseView: "full" })).value as unknown as PlanSuccessWire;
});
after(() => {
  if (process.env.MCP_722_EVIDENCE_DIR) writeFileSync(`${process.env.MCP_722_EVIDENCE_DIR}/golden-d3.json`, JSON.stringify({ request, elapsedMs, calls }, null, 2), { flag: "wx" });
  resetPlanCreateInflightForTests(); uninstallRealCatalogue();
});
test("test_d3_2000_does_not_select_ten_caps_of_an_incidental", () => {
  const selected = full.options!.find(row => row.optionId === full.optionId); assert.ok(selected?.basket?.length);
  assert.equal(selected.basket.length, 1); assert.equal(selected.basket[0].productName, "Blackmores Vitamin D3 1000 IU");
  assert.equal(selected.basket[0].servingsPerDay, 2); assert.equal(selected.doseFit!.total, 0);
  assert.ok(full.options!.some(option => option.basket?.some(row => row.productName.includes("CALPLEX") && row.servingsPerDay === 10)), "Keep the cheaper incidental option selectable");
});
test("test_highlighted_alternative_present_when_alternativeSearch_found", () => {
  assert.ok(conversation.alternativeSearch);
  assert.ok(["found", "incomplete"].includes((conversation.alternativeSearch as { status: string }).status), "A found or still-incomplete fewer-concerns search must not hide available positive-coverage choices");
  const id = conversation.highlightedAlternativeOptionId;
  assert.ok(id && id !== conversation.selectedOptionId);
  assert.ok(full.options!.some(option => option.optionId === id && option.purchaseEligible && option.coveragePercent > 0));
});
test("L4_omit_create_defaults_to_conversation", () => {
  const first = calls[0] as { reply: { result: { structuredContent: { responseView: string } } } };
  assert.equal(first.reply.result.structuredContent.responseView, "conversation");
});
test("L5_omit_get_defaults_to_conversation", () => { assert.equal(conversation.responseView, "conversation"); });
test("L6_status_known_version_is_a_small_envelope", async () => {
  let status = await call({ operation: "get", planHandle: conversation.planHandle, responseView: "status" });
  status = await call({ operation: "get", planHandle: conversation.planHandle, responseView: "status", knownResultVersion: status.value.resultVersion });
  assert.equal(status.value.unchanged, true); assert.ok(Buffer.byteLength(JSON.stringify(status.value)) < 2000);
});
test("L7_standard_D3_reaches_terminal_within_15_seconds", () => {
  assert.ok(elapsedMs < 15000, `Standard took ${elapsedMs}ms`); assert.ok(["ready", "needs_input"].includes(String(conversation.status)));
});
test("D3_payload_and_localized_advice_budget", async () => {
  assert.ok(Buffer.byteLength(JSON.stringify(conversation)) < 20000);
  const response = await call({ operation: "get", planHandle: conversation.planHandle });
  assert.ok(Buffer.byteLength(JSON.stringify(response.reply)) < 22000);
  for (const locale of ["en", "th", "zh-CN"]) {
    const projected = projectPlan({ ...full, locale }, { responseView: "conversation" });
    assert.ok(projected.advice.length <= 5); assert.equal(projected.advice.filter(row => row.kind === "incomplete_information").length, 1);
    assert.deepEqual(projected.options.map(row => row.optionId), full.options!.map(row => row.optionId));
  }
});
