import assert from "node:assert/strict";
import { test } from "node:test";
import { baseline } from "../mcp-payload/fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";

test("test_conversation_text_is_not_a_json_clone", () => {
  const value = projectPlan(baseline.cases[0].plan, { responseView: "conversation" });
  const result = toolResult(value);
  assert.deepEqual(result.structuredContent, value);
  assert.equal(result.content.length, 1);
  assert.ok(!result.content.some(row => row.text === JSON.stringify(value)));
  assert.match(result.content[0].text, /Next:/);
  const full = toolResult(baseline.cases[0].plan);
  assert.equal(full.content.at(-1)!.text, JSON.stringify(baseline.cases[0].plan));
});
test("test_status_payload_under_2kb", () => {
  const value = { ok: true, responseView: "status", planHandle: `cap_${"x".repeat(650)}`, revision: 2,
    status: "processing", operationStatus: "failed", nextActions: ["retry"], resultVersion: "v".repeat(64), unchanged: false };
  const result = toolResult(value);
  assert.ok(Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: 1, result })) < 2000);
  assert.equal(result.content.length, 1); assert.match(result.content[0].text, /failed/);
  for (const [payment, fulfilment] of [["paid", "processing"], ["refunded", "failed"]]) {
    const order = toolResult({ ok: true, responseView: "status", orderHandle: "order", status: "processing", paymentState: payment, fulfilmentStatus: fulfilment, nextActions: ["poll_order"] });
    assert.match(order.content[0].text, new RegExp(payment));
    assert.match(order.content[0].text, new RegExp(fulfilment));
  }
});
