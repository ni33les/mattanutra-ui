import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { input } from "./support.ts";
import { uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { matchPlan } from "../../lib/agentic/plan/matching.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";

afterEach(uninstallGoldCatalogue);


test("EFF-SESSION-01 resident continuations transfer no repeated input and preserve complete matcher results", async () => {
  const request = await input(), expected = matchPlan(request), pool = new MatchWorkerPool(1);
  try {
    let reply = await pool.runResidentChunk("session-one", request, { chunkBudget: 1 });
    assert.equal(reply.done, false); assert.ok(reply.checkpoint.cursor instanceof Uint8Array);
    assert.equal(reply.inputTransferred, true);
    while (!reply.done) {
      const previous = reply.expansionAttempts;
      reply = await pool.runResidentChunk("session-one", request, { checkpoint: reply.checkpoint, chunkBudget: 137 });
      assert.equal(reply.inputTransferred, false); assert.ok(reply.expansionAttempts >= previous);
    }
    assert.deepEqual(reply.result, expected);
    assert.equal(reply.expansionAttempts, expected.searchSummary!.expansionAttempts);
  } finally { await pool.close(); }
});

test("EFF-SESSION-02 binary durable checkpoint survives a worker restart with identical output", async () => {
  const request = await input(), expected = matchPlan(request);
  let pool = new MatchWorkerPool(1);
  try {
    let reply = await pool.runResidentChunk("restart", request, { chunkBudget: 1 });
    assert.equal(reply.done, false); const checkpoint = structuredClone(reply.checkpoint);
    await pool.close(); pool = new MatchWorkerPool(1);
    reply = await pool.runResidentChunk("restart", request, { checkpoint, chunkBudget: 4000 });
    assert.equal(reply.inputTransferred, true);
    while (!reply.done) reply = await pool.runResidentChunk("restart", request, { checkpoint: reply.checkpoint, chunkBudget: 4000 });
    assert.deepEqual(reply.result, expected);
  } finally { await pool.close(); }
});

test("EFF-SESSION-03 idle sessions release affinity and recover through the durable checkpoint", async () => {
  const request = await input(), pool = new MatchWorkerPool(1, 16, 20);
  try {
    const first = await pool.runResidentChunk("idle", request, { chunkBudget: 1 }); assert.equal(first.done, false);
    await new Promise(resolve => setTimeout(resolve, 60));
    const resumed = await pool.runResidentChunk("idle", request, { checkpoint: first.checkpoint, chunkBudget: 1 });
    assert.equal(resumed.inputTransferred, true); assert.equal(resumed.expansionAttempts, first.expansionAttempts + 1);
  } finally { await pool.close(); }
});

test("EFF-SESSION-04 worker session protocol rejects incompatible continuations before searching", async () => {
  const { Worker } = await import("node:worker_threads"), { resolve } = await import("node:path");
  const { captureReferenceJobIdentity } = await import("../../lib/agentic/catalogue/reference-job.ts");
  const { matcherSafetyCeilings } = await import("../../lib/matcher/safety-ceilings.ts");
  const request = await input();
  const worker = new Worker(resolve("workers/mcp-matcher.ts"), { execArgv: ["--experimental-strip-types", "--import", resolve("scripts/register-ts-path-loader.mjs")] });
  try {
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); });
    worker.postMessage({ ...request, protocol: 0, kind: "session-start", sessionId: "incompatible", chunk: { chunkBudget: 1 },
      referenceIdentity: captureReferenceJobIdentity(undefined, true), ceilings: matcherSafetyCeilings(), safetyUnavailable: false });
    assert.deepEqual(await reply, { error: "worker_protocol_mismatch" });
  } finally { await worker.terminate(); }
});
