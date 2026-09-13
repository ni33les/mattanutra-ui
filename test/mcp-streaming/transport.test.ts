import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { completionResponse, PLAN_STREAM_WAIT_MS, PLAN_STREAM_FINISH_MS } from "../../lib/agentic/mcp/completion-stream.ts";
import { mcpOneShotResponse } from "../../lib/agentic/mcp/transport.ts";
import type { JsonRpcResponse } from "../../lib/agentic/mcp/rpc.ts";

const response = (status: string, revision = 2): JsonRpcResponse => ({ jsonrpc: "2.0", id: "request-2", result: { structuredContent: { ok: true, planHandle: "handle", revision, status }, content: [{ type: "text", text: status }] } });
const processing = response("processing");
function harness(waitMs = 1000) {
  let wake: (() => void) | undefined, closed = 0, reads = 0, state = processing;
  const abort = new AbortController();
  const stream = completionResponse({ initial: processing, signal: abort.signal, waitMs,
    subscribe: notify => { wake = notify; return () => { closed++; wake = undefined; }; },
    read: async () => { reads++; return { response: state, done: state !== processing }; } });
  assert.ok(stream);
  return { stream, abort, finish: (next = response("ready")) => { state = next; wake?.(); }, loseNotification: () => { state = response("ready"); }, counters: () => ({ closed, reads }) };
}
function messages(body: string) { return body.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))); }
test("STREAM-HTTP-01 comments arrive before completion and exactly one result follows the commit signal", async () => {
  const h = harness(), reader = h.stream.body!.getReader(), decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value);
  assert.match(first, /^:/); assert.doesNotMatch(first, /data:/);
  await setImmediate(); const before = h.counters().reads;
  await setImmediate(); assert.equal(h.counters().reads, before, "No periodic status reads");
  h.finish(); let body = first;
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; body += decoder.decode(chunk.value); }
  assert.deepEqual(messages(body), [response("ready")]); assert.equal(h.counters().closed, 1);
});
test("STREAM-HTTP-02 completion before the first check cannot be lost", async () => {
  const h = harness(); h.finish(); assert.deepEqual(messages(await h.stream.text()), [response("ready")]);
});
test("STREAM-HTTP-03 failure and newer pending revisions use one coherent result", async () => {
  for (const value of [response("failed"), response("processing", 3)]) {
    const h = harness(); h.finish(value); assert.deepEqual(messages(await h.stream.text()), [value]);
  }
});
test("STREAM-HTTP-04 lost notifications are recovered by the boundary read", async () => {
  const h = harness(15); await setImmediate(); h.loseNotification();
  assert.deepEqual(messages(await h.stream.text()), [response("ready")]); assert.equal(h.counters().closed, 1);
});
test("STREAM-HTTP-05 unfinished work returns the original processing envelope at the boundary", async () => {
  const h = harness(15); assert.deepEqual(messages(await h.stream.text()), [processing]); assert.equal(h.counters().closed, 1);
});
test("STREAM-HTTP-06 disconnect releases observation without cancelling matching", async () => {
  const h = harness(); const reader = h.stream.body!.getReader(); await reader.read(); await reader.cancel();
  assert.equal(h.counters().closed, 1); assert.equal(h.abort.signal.aborted, false);
});
test("STREAM-HTTP-07 capacity failure returns to ordinary processing without reading", () => {
  const stream = completionResponse({ initial: processing, signal: new AbortController().signal, subscribe: () => null,
    read: async () => { assert.fail("Capacity fallback cannot perform extra reads"); } });
  assert.equal(stream, null);
});
test("STREAM-HTTP-08 JSON-only and text-result clients preserve complete response content", async () => {
  assert.deepEqual(await mcpOneShotResponse("application/json", processing).json(), processing);
  const textOnly = { ...response("ready"), result: { content: [{ type: "text", text: JSON.stringify({ status: "ready", revision: 2 }) }] } };
  const h = harness(); h.finish(textOnly); assert.deepEqual(messages(await h.stream.text()), [textOnly]);
});
test("STREAM-HTTP-09 heartbeats contain no interim result and the final read has reserved time", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const h = harness(14_000), reader = h.stream.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /^:/);
  await setImmediate();
  t.mock.timers.tick(5_000);
  assert.equal(new TextDecoder().decode((await reader.read()).value), ": waiting\n\n");
  h.finish();
  const body = new TextDecoder().decode((await reader.read()).value);
  assert.deepEqual(messages(body), [response("ready")]);
  assert.equal((await reader.read()).done, true);
  assert.equal(PLAN_STREAM_WAIT_MS, 15_000); assert.equal(PLAN_STREAM_FINISH_MS, 1_000);
});
test("STREAM-HTTP-10 request abort closes observers and ignores late completion", async () => {
  const h = harness(), reader = h.stream.body!.getReader(); await reader.read();
  h.abort.abort(); h.finish();
  assert.equal((await reader.read()).done, true); assert.equal(h.counters().closed, 1);
});
test("STREAM-HTTP-11 a failed status dependency returns recoverable processing and releases observation", async () => {
  let closed = 0;
  const stream = completionResponse({ initial: processing, signal: new AbortController().signal,
    subscribe: () => () => { closed++; }, read: async () => { throw new Error("Temporary read failure"); } });
  assert.ok(stream); assert.deepEqual(messages(await stream.text()), [processing]); assert.equal(closed, 1);
});
