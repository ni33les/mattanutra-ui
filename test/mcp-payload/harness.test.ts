import assert from "node:assert/strict";
import { test } from "node:test";
import { measureCall, measureJourney, validateInventory } from "../../scripts/mcp-payload/measure.mjs";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";

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
