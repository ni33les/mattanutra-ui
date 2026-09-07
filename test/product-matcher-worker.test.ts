import assert from "node:assert/strict";
import { it } from "node:test";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import { ProductMatcherPool } from "../workers/product-matcher-pool.ts";
import { ThreadPoolUnavailableError } from "../lib/thread-pool.ts";
import { setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { productMatchWorkItem } from "./helpers/product-match-work-item.ts";

it("ANNA-REF-WORKER-03 product jobs reject live catalogue work without reviewed reference identity", async () => {
  const pool = new ProductMatcherPool(1);
  try {
    setMatcherSafetyCeilings([], { runtimeRevision: 77, fingerprint: "a".repeat(64) });
    await assert.rejects(pool.match({ ...productMatchWorkItem(), catalogueRevision: 77 }), /reference.*identity/i);
  } finally { await pool.close(); }
});

function withoutTimings(value: unknown) {
  return JSON.parse(JSON.stringify(value, (key, child: unknown) => key === "timingMs" ? undefined : child));
}

it("preserves product matching while keeping timers responsive", async () => {
  setMatcherSafetyCeilings([]);
  const pool = new ProductMatcherPool(1);
  try {
    const item = productMatchWorkItem();
    const expected = await executeTaskWorkItem(item);
    let completed = false;
    const started = performance.now();
    const running = pool.match(item).then(result => {completed = true; return result;});
    await new Promise(resolve => setTimeout(resolve, 0));
    const timerMs = Math.round(performance.now() - started);
    assert.equal(completed, false, "the timer must run while matching is still in flight");
    const actual = await running;
    assert.deepEqual(withoutTimings(actual), withoutTimings(expected));
    console.info("product_worker_responsiveness", {timerMs, taskMs: Math.round(performance.now() - started)});
  } finally { await pool.close(); }
});

it("bounds product jobs, cancels active work, and recovers capacity", async () => {
  const pool = new ProductMatcherPool(1, 1);
  try {
    const item = productMatchWorkItem();
    const controller = new AbortController();
    const active = assert.rejects(pool.match(item, controller.signal), {name: "AbortError"});
    const queued = pool.match(item);
    await assert.rejects(pool.match(item), ThreadPoolUnavailableError);
    controller.abort();
    await active;
    assert.ok(await queued);
  } finally { await pool.close(); }
});
