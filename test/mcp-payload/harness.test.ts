import assert from "node:assert/strict";
import { test } from "node:test";
import { measureCall, measureJourney, validateInventory } from "../../scripts/mcp-payload/measure.mjs";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
import { semanticJourney } from "../../scripts/mcp-payload/semantic.mjs";

test("PAY-BASE-01 measures UTF-8 and both MCP representations without dropping envelope overhead", () => {
  const request = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "info", arguments: { locale: "th" } } };
  const data = { summary: "ผลลัพธ์ 建议", nextAction: "poll_plan", planHandle: "opaque" };
  const response = { jsonrpc: "2.0", id: 1, result: toolResult(data) };
  const measured = measureCall({ request, response });
  assert.equal(measured.responseBytes, Buffer.byteLength(JSON.stringify(response)));
  assert.equal(measured.structuredBytes, Buffer.byteLength(JSON.stringify(data)));
  assert.ok(measured.responseBytes > measured.structuredBytes * 2);
  assert.equal(measured.requestBytes, Buffer.byteLength(JSON.stringify(request)));
});

test("PAY-BASE-02 journey totals include discovery, polls and explicit detail requests", () => {
  const calls = ["tools/list", "tools/call", "resources/read"].map(method => ({ request: { method }, response: { result: { text: "数据" } } }));
  const report = measureJourney(calls);
  assert.equal(report.calls, 3);
  assert.equal(report.responseBytes, calls.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.response)), 0));
  assert.throws(() => measureJourney([]), /empty/i);
});

test("PAY-BASE-03 missing, duplicate or unexecuted scoped cases cannot pass", () => {
  const manifest = [{ file: "test/mcp-payload/harness.test.ts", reason: "Measures all response and discovery bytes", cases: ["PAY-BASE-01"] }];
  assert.throws(() => validateInventory([], [], []), /empty/i);
  assert.throws(() => validateInventory(manifest, [], []), /missing/i);
  assert.throws(() => validateInventory([...manifest, ...manifest], [manifest[0].file], ["PAY-BASE-01"]), /duplicate/i);
  assert.throws(() => validateInventory(manifest, [manifest[0].file], []), /unexecuted/i);
  assert.doesNotThrow(() => validateInventory(manifest, [manifest[0].file], ["PAY-BASE-01"]));
});

test("PAY-BASE-04 normalizes only generated support identities while preserving content and identity relationships", () => {
  const fixture = (digit: string) => {
    const first = `${digit.repeat(8)}-0000-0000-0000-000000000001`, second = `${digit.repeat(8)}-0000-0000-0000-000000000002`;
    const value = { caseReference: `tkt_${digit.repeat(12)}`, messageId: first,
      orderContext: { paymentStatus: "paid", stateVersion: 2 },
      thread: [{ id: first, body: "Recorded", sequence: 1 }, { id: second, body: "Payment confirmed", sequence: 2 }] };
    return { outcomes: [{ calls: [{ request: { params: { name: "support" } }, response: { result: toolResult(value) } }], optionId: "opt_original" }] };
  };
  const a = fixture("a"), b = fixture("b");
  assert.deepEqual(semanticJourney(a), semanticJourney(b));
  assert.notEqual(a.outcomes[0].calls[0].response.result.structuredContent.caseReference, b.outcomes[0].calls[0].response.result.structuredContent.caseReference, "Raw evidence remains unchanged");
  for (const mutation of [
    (row: typeof b) => { row.outcomes[0].optionId = "opt_changed"; },
    (row: typeof b) => { row.outcomes[0].calls[0].response.result.structuredContent.thread[0].body = "Altered message"; },
    (row: typeof b) => { row.outcomes[0].calls[0].response.result.structuredContent.orderContext.paymentStatus = "unpaid"; },
    (row: typeof b) => { const wire = row.outcomes[0].calls[0].response.result.structuredContent; wire.messageId = wire.thread[1].id; }
  ]) {
    const changed = fixture("b"); mutation(changed);
    const result = changed.outcomes[0].calls[0].response.result;
    result.content.at(-1)!.text = JSON.stringify(result.structuredContent);
    assert.notDeepEqual(semanticJourney(a), semanticJourney(changed));
  }
  const broken = fixture("b"); broken.outcomes[0].calls[0].response.result.content.at(-1)!.text = "{}";
  assert.throws(() => semanticJourney(broken), /representations/);
});
