import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { matchPlan } from "../../lib/agentic/plan/matching.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";

afterEach(uninstallGoldCatalogue);
async function input() {
  installGoldCatalogue(); const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
    destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
    profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
    targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }, { name: "Magnesium", amount: 200, unit: "mg" }]
  } });
  assert.ok("state" in normalized); return { snapshot, state: normalized.state };
}

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
