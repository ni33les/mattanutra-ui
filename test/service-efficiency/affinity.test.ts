import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, test } from "node:test";
import type { Worker } from "node:worker_threads";
import { ThreadPool } from "../../lib/thread-pool.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";
import { matchPlan } from "../../lib/agentic/plan/matching.ts";
import { input } from "./support.ts";
import { uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";

afterEach(uninstallGoldCatalogue);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
class FakeWorker extends EventEmitter {
  threadId = 1; posts: unknown[] = [];
  ref() {} unref() {}
  postMessage(value: unknown) { this.posts.push(value); }
  async terminate() { if (this.threadId !== -1) { this.threadId = -1; this.emit("exit"); } return 0; }
}

test("LOCK-AFF-01 waiting work can replace only a durably acknowledged idle session", async () => {
  const worker = new FakeWorker(), pool = new ThreadPool(() => worker as unknown as Worker, 1, 2);
  const pending: Promise<unknown>[] = [];
  try {
    const first = pool.run("first", undefined, 1000, { affinity: "owner" }); pending.push(first);
    await tick(); worker.emit("message", { result: "checkpoint" }); await first;
    const next = pool.run("next", undefined, 1000); pending.push(next);
    await tick(); assert.deepEqual(worker.posts, ["first"], "unacknowledged resident state remains recoverable");
    pool.acknowledgeAffinity("owner", "release-owner");
    await tick(); assert.deepEqual(worker.posts, ["first", "release-owner", "next"]);
    worker.emit("message", { result: "done" }); assert.equal(await next, "done");
  } finally { const settled = Promise.allSettled(pending); await pool.close(); await settled; }
});

test("LOCK-AFF-02 eviction resumes the acknowledged cursor without losing or repeating attempts", async () => {
  const request = await input(), expected = matchPlan(request), pool = new MatchWorkerPool(1);
  try {
    let reply = await pool.runResidentChunk("owner", request, { chunkBudget: 1 });
    assert.equal(reply.done, false); const attempts = reply.expansionAttempts;
    pool.acknowledgeResidentSession("owner");
    const other = await pool.runResidentChunk("other", request, { chunkBudget: 1 });
    assert.equal(other.expansionAttempts, attempts); pool.closeResidentSession("other");
    reply = await pool.runResidentChunk("owner", request, { checkpoint: reply.checkpoint, chunkBudget: 1 });
    assert.equal(reply.inputTransferred, true); assert.equal(reply.expansionAttempts, attempts + 1);
    while (!reply.done) reply = await pool.runResidentChunk("owner", request, { checkpoint: reply.checkpoint, chunkBudget: 4000 });
    assert.deepEqual(reply.result, expected);
  } finally { await pool.close(); }
});

test("LOCK-AFF-03 idle expiry cannot discard an unacknowledged checkpoint", async () => {
  const request = await input(), pool = new MatchWorkerPool(1, 4, 20);
  try {
    const reply = await pool.runResidentChunk("owner", request, { chunkBudget: 1 });
    await new Promise(resolve => setTimeout(resolve, 60));
    const next = await pool.runResidentChunk("owner", request, { checkpoint: reply.checkpoint, chunkBudget: 1 });
    assert.equal(next.inputTransferred, false, "expiry starts only after durable acknowledgement");
  } finally { await pool.close(); }
});
