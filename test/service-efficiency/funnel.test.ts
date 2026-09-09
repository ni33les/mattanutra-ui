import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFunnelJson, pollFunnelStatus } from "../../lib/funnel-polling.ts";

test("EFF-FUNNEL-01 JSON polling consumes the original body once and retains cancellation", async () => {
  const fetch = globalThis.fetch; let copies = 0;
  globalThis.fetch = async () => { const response = new Response(JSON.stringify({ ready: true }));
    response.arrayBuffer = async () => { copies++; throw new Error("Redundant body copy"); }; return response; };
  try {
    assert.deepEqual(await fetchFunnelJson("https://fixture.invalid"), { status: 200, data: { ready: true } }); assert.equal(copies, 0);
    globalThis.fetch = async () => new Response(new ReadableStream({ start() {} }));
    const abort = new AbortController(), result = fetchFunnelJson("https://fixture.invalid", { signal: abort.signal });
    abort.abort(); await assert.rejects(result, { name: "AbortError" });
  } finally { globalThis.fetch = fetch; }
});

test("EFF-FUNNEL-02 page subscribers share reads while keeping independent completion and cancellation", async () => {
  let calls = 0, release!: (value: number) => void;
  const read = (signal: AbortSignal) => { calls++; return new Promise<number>((resolve, reject) => {
    release = resolve; signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }); };
  const a = new AbortController(), b = new AbortController();
  const one = pollFunnelStatus({ subscriptionKey: "assessment:1:en", signal: a.signal, read, ready: n => n === 1 });
  const two = pollFunnelStatus({ subscriptionKey: "assessment:1:en", signal: b.signal, read, ready: n => n === 2, intervalMs: 1 });
  const rejected = assert.rejects(one, { name: "AbortError" });
  void two.catch(() => {});
  try { assert.equal(calls, 1); a.abort(); release(2); assert.equal((await two).value, 2); await rejected; }
  finally { a.abort(); b.abort(); release?.(2); await Promise.allSettled([one, two, rejected]); }
});

test("EFF-FUNNEL-03 hidden tabs sleep on visibility events without interval wakeups", async () => {
  const events = new EventTarget(), abort = new AbortController(); let timers = 0, reads = 0;
  const visibility = { hidden: true, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const set = globalThis.setTimeout;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => { timers++; return set(...args); }) as typeof setTimeout;
  const result = pollFunnelStatus({ visibility, signal: abort.signal, read: async () => { reads++; return true; }, ready: value => value });
  try {
    assert.equal(timers, 0); assert.equal(reads, 0);
    visibility.hidden = false; events.dispatchEvent(new Event("visibilitychange")); assert.equal((await result).status, "ready");
  } finally { globalThis.setTimeout = set; abort.abort(); await result.catch(() => {}); }
});
