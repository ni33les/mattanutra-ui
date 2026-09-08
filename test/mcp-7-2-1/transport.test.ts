import assert from "node:assert/strict";
import { test } from "node:test";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { createAgenticRuntime } from "../../lib/agentic/runtime.ts";

test("M721-TEXT-01 opt-in removes only conversation/status clones; compatibility and errors remain complete", () => {
  for (const responseView of ["conversation", "status", "full", "details"]) {
    const value = { ok: true, responseView, summary: "Ready with advice", planHandle: "opaque", revision: 1,
      operationalDecision: { nextAction: "confirm" }, advice: [{ message: "Calcium exceeds its reference." }] };
    const compatible = toolResult(value);
    assert.deepEqual(JSON.parse(compatible.content.at(-1)!.text), value);
    const opted = toolResult(value, false, "plan", "structured");
    assert.strictEqual(opted.structuredContent, value);
    assert.equal(opted.content.length, ["conversation", "status"].includes(responseView) ? 1 : 2);
    if (responseView === "conversation") { assert.match(opted.content[0].text, /Calcium exceeds/); assert.match(opted.content[0].text, /confirm/); }
    assert.equal(toolResult(value, true, "plan", "structured").content.length, 2);
  }
});

test("M721-TEXT-02 compact status preserves payment and fulfilment independently", () => {
  const value = { ok: true, responseView: "status", orderReference: "MN-1", paymentStatus: "refunded", fulfilment: { status: "shipped" } };
  const result = toolResult(value, false, "order", "structured");
  assert.equal(result.content.length, 1); assert.match(result.content[0].text, /refunded/); assert.match(result.content[0].text, /shipped/);
  const failure = toolResult({ ok: true, responseView: "status", planHandle: "opaque", revision: 2, status: "ready", operationStatus: "failed" }, false, "plan", "structured");
  assert.match(failure.content[0].text, /failed/);
});

test("M721-TEXT-03 request-scoped capability reaches dispatcher without becoming stored or global state", async () => {
  const app = createAgenticRuntime({ resultContent: "structured" });
  const body = { id: 1, method: "tools/call", params: { name: "order", arguments: { orderHandle: "invalid", responseView: "status" } } };
  const response = await handleJsonRpc(app, body);
  // Even an opted-in host receives complete machine-readable error text.
  assert.equal(response!.result!.isError, true);
  assert.equal((response!.result!.content as unknown[]).length, 2);
  assert.equal(createAgenticRuntime().resultContent, undefined);
  assert.equal(app.resultContent, "structured");
});
