import assert from "node:assert/strict";
import { test } from "node:test";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
test("PAY-TRANSPORT-05 concise text headlines preserve refunds and distinguish payment from delivery", () => {
  const refunded = toolResult({ ok: true, responseView: "status", orderReference: "MN-1", orderStatus: "completed", paymentStatus: "refunded", fulfilment: { status: "shipped" } });
  assert.match(refunded.content[0].text, /refunded/); assert.doesNotMatch(refunded.content[0].text, /and paid/);
  const paid = toolResult({ ok: true, responseView: "status", orderReference: "MN-2", orderStatus: "completed", paymentStatus: "paid", fulfilment: { status: "shipped" } });
  assert.match(paid.content[0].text, /paid/); assert.match(paid.content[0].text, /shipped/); assert.doesNotMatch(paid.content[0].text, /completed and paid/);
  const translated = toolResult({ ok: true, responseView: "conversation", orderReference: "MN-2", paymentStatus: "paid", message: "ชำระเงินแล้ว" });
  assert.equal(translated.content[0].text, "ชำระเงินแล้ว");
  const failed = toolResult({ ok: true, responseView: "status", planHandle: "cap_example", revision: 2, status: "ready", operationStatus: "failed" });
  assert.match(failed.content[0].text, /failed/);
  assert.deepEqual(JSON.parse(refunded.content[1].text), refunded.structuredContent);
});
