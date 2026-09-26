import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { livePost } from './helpers/live-mcp.ts';

test('LIVE-LAT-TIMING-01 separates response headers from a deliberately pending response body', async () => {
  let release!: () => void, headers!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const opened = new Promise<void>(resolve => { headers = resolve; });
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.flushHeaders(); headers();
    await hold;
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const pending = livePost(`http://127.0.0.1:${address.port}/api/mcp`, {}, { accept: 'application/json' });
    await opened; await delay(30); release();
    const response = await pending;
    assert.equal(response.status, 200); assert.equal(response.structured.ok, true);
    assert.ok(Number.isFinite(response.preHeaderMs) && response.preHeaderMs >= 0);
    assert.ok(Number.isFinite(response.bodyMs) && response.bodyMs > 0);
    assert.equal(response.bodyMs, response.ms - response.preHeaderMs);
  } finally {
    release(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

import { assertMcpSuccess } from "./helpers/mcp-success.ts";
const envelope = (result: unknown) => ({ jsonrpc: "2.0", id: 1, result });

test("LIVE-SUCCESS-01 preserves real info, plan and tool-list payloads", () => {
  for (const tool of ["info", "plan"] as const) {
    const business = { ok: true, ...(tool === "plan" ? { status: "processing", planHandle: "returned-handle" } : { buildId: "current" }) };
    assert.strictEqual(assertMcpSuccess(envelope({ isError: false, structuredContent: business }), tool), business);
  }
  const listing = { tools: [{ name: "info" }, { name: "plan" }] };
  assert.strictEqual(assertMcpSuccess(envelope(listing), "tools/list"), listing);
});
test("LIVE-SUCCESS-02 HTTP 200 JSON-RPC error envelopes never count as measured successes", () => {
  const failure = { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid params" } };
  for (const tool of ["info", "plan", "tools/list"] as const) assert.throws(() => assertMcpSuccess(failure, tool));
});
test("LIVE-SUCCESS-03 tool errors cannot masquerade as successful info or plan calls", () => {
  for (const tool of ["info", "plan"] as const) {
    assert.throws(() => assertMcpSuccess(envelope({ isError: true, structuredContent: { ok: true } }), tool));
    assert.throws(() => assertMcpSuccess(envelope({ isError: false, structuredContent: { ok: false, error: { reasonCode: "invalid_request" } } }), tool));
  }
});
test("LIVE-SUCCESS-04 malformed or absent business payloads fail closed", () => {
  for (const result of [null, [], {}, { structuredContent: {} }, { structuredContent: [] }])
    for (const tool of ["info", "plan"] as const) assert.throws(() => assertMcpSuccess(envelope(result), tool));
  assert.throws(() => assertMcpSuccess({ jsonrpc: "1.0", result: { structuredContent: { ok: true } } }, "info"));
});
test("LIVE-SUCCESS-05 tool discovery requires an actual nonempty named tool list", () => {
  for (const result of [{}, { tools: [] }, { tools: {} }, { tools: [null] }, { tools: [{}] }, { tools: [{ name: "" }] }])
    assert.throws(() => assertMcpSuccess(envelope(result), "tools/list"));
});
