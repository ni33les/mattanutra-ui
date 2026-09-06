import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchWithBodyDeadline, pollFunnelStatus, PollHttpError } from "../lib/funnel-polling.ts";

describe("shared funnel polling", () => {
  it("times out a body that never finishes and preserves caller cancellation", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(new ReadableStream({ start() {} }));
    try {
      await assert.rejects(fetchWithBodyDeadline("https://fixture.invalid", {}, 20), { name: "TimeoutError" });
      const abort = new AbortController();
      const waiting = fetchWithBodyDeadline("https://fixture.invalid", { signal: abort.signal }, 1000);
      abort.abort(); await assert.rejects(waiting, { name: "AbortError" });
    } finally { globalThis.fetch = original; }
  });
  it("retries transient failures with only one outstanding request", async () => {
    let active = 0, max = 0, calls = 0;
    const result = await pollFunnelStatus({ signal: new AbortController().signal, intervalMs: 1, foregroundWaitMs: 200,
      read: async () => { active++; max = Math.max(active, max); await new Promise(r => setTimeout(r, 5)); active--; if (++calls < 3) throw new PollHttpError(503, "retry"); return "ready"; }, ready: value => value === "ready" });
    assert.equal(result.status, "ready"); assert.equal(calls, 3); assert.equal(max, 1);
  });
  it("offers recovery on timeout or permanent failure", async () => {
    const pending = await pollFunnelStatus({ signal: new AbortController().signal, intervalMs: 1, foregroundWaitMs: 20, read: async () => false, ready: v => v });
    assert.equal(pending.status, "timeout");
    const failed = await pollFunnelStatus({ signal: new AbortController().signal, read: async () => { throw new PollHttpError(404, "missing"); }, ready: () => false });
    assert.equal(failed.status, "failed");
  });
  it("pauses while hidden without consuming the foreground wait", async () => {
    const events = new EventTarget();
    const visibility = { hidden: true, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    let calls = 0;
    const running = pollFunnelStatus({ visibility, signal: new AbortController().signal, intervalMs: 1, foregroundWaitMs: 20,
      read: async () => { calls++; return true; }, ready: v => v });
    await new Promise(r => setTimeout(r, 40)); assert.equal(calls, 0);
    visibility.hidden = false; events.dispatchEvent(new Event("visibilitychange"));
    assert.equal((await running).status, "ready"); assert.equal(calls, 1);
  });
});
