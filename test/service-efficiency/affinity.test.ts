import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { afterEach, test } from "node:test";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { MATCH_WORKER_PROTOCOL } from "../../lib/agentic/plan/match-worker-protocol.ts";
import { captureReferenceJobIdentity } from "../../lib/agentic/catalogue/reference-job.ts";
import { matcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
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

test("LOCK-AFF-04 the real child cannot expire a session before its parent acknowledges durable state", { timeout: 10_000 }, async () => {
  const request = await input();
  const worker = new Worker(`require("node:module").register(${JSON.stringify(new URL("../../scripts/ts-path-loader.mjs", import.meta.url).href)});
    const original = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === 60000 ? 5 : ms, ...args);
    import(${JSON.stringify(new URL("../../workers/mcp-matcher.ts", import.meta.url).href)})
      .then(() => require('node:worker_threads').parentPort.postMessage({ready:true}));`, {
    eval: true, execArgv: ["--experimental-strip-types", "--import", resolve("scripts/register-ts-path-loader.mjs")]
  });
  try {
    assert.deepEqual((await once(worker, "message"))[0], { ready: true });
    const send = async (message: unknown) => { const reply = once(worker, "message"); worker.postMessage(message); return (await reply)[0]; };
    const first = await send({ ...request, protocol: MATCH_WORKER_PROTOCOL, kind: "session-start", sessionId: "ack-owner", chunk: { chunkBudget: 1 },
      referenceIdentity: captureReferenceJobIdentity(request.snapshot.runtimeRevision, true), ceilings: matcherSafetyCeilings(), safetyUnavailable: false });
    assert.equal(first.result?.value.done, false, JSON.stringify(first));
    await new Promise(resolve => setTimeout(resolve, 30));
    const next = await send({ protocol: MATCH_WORKER_PROTOCOL, kind: "session-continue", sessionId: "ack-owner",
      expectedAttempts: first.result.value.expansionAttempts, chunkBudget: 1 });
    assert.equal(next.error, undefined, JSON.stringify(next));
    assert.equal(next.result.value.expansionAttempts, first.result.value.expansionAttempts + 1);
  } finally { await worker.terminate(); }
});
