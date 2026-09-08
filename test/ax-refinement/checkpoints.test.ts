import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { matchPlan, planCheckpointInputIdentity } from "../../lib/agentic/plan/matching.ts";
import { setMatcherSafetyCeilings, matcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";

afterEach(uninstallGoldCatalogue);
test("AXR-SRCH-01 worker restart resumes the checkpoint and preserves synchronous results and work counts", async () => {
  installGoldCatalogue();
  const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
    destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
    profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
    targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }, { name: "Magnesium", amount: 200, unit: "mg" }]
  } });
  assert.ok("state" in normalized);
  const input = { snapshot, state: normalized.state }, expected = matchPlan(input);
  let pool = new MatchWorkerPool(1);
  try {
    let reply = await pool.runChunk(input, { chunkBudget: 1 });
    assert.equal(reply.done, false);
    assert.equal(reply.expansionAttempts, 1);
    const checkpoint = JSON.parse(JSON.stringify(reply.checkpoint));
    await pool.close(); pool = new MatchWorkerPool(1);
    reply = await pool.runChunk(input, { checkpoint, chunkBudget: 137 });
    let previous = 1;
    while (!reply.done) {
      assert.ok(reply.expansionAttempts >= previous);
      previous = reply.expansionAttempts;
      reply = await pool.runChunk(input, { checkpoint: reply.checkpoint, chunkBudget: 137 });
    }
    assert.deepEqual(reply.result, expected);
    assert.equal(reply.expansionAttempts, expected.searchSummary!.expansionAttempts);
    await assert.rejects(pool.runChunk({ ...input, state: { ...input.state, locale: "th" } }, { checkpoint, chunkBudget: 137 }), /checkpoint|match_failed/);
  } finally { await pool.close(); }
});

test("AXR-REL-05 compiled facts and checkpoint identities isolate locale, medications, exclusions and reference provenance", async () => {
  installGoldCatalogue();
  const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
    destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
    profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
    targets: [{ name: "Vitamin D3", amount: 10, unit: "mcg" }]
  } });
  assert.ok("state" in normalized);
  const state = normalized.state;
  const original = planCheckpointInputIdentity({ state, snapshot });
  assert.notEqual(planCheckpointInputIdentity({ state: { ...state, locale: "th" }, snapshot }), original);
  assert.notEqual(planCheckpointInputIdentity({ state: { ...state, requirements: { ...state.requirements, excludeProductIds: ["another-product"] } }, snapshot }), original);
  assert.notEqual(planCheckpointInputIdentity({ state: { ...state, medicationCodes: ["apixaban"] }, snapshot }), original);
  const result = matchPlan({ state, snapshot });
  const copy = matchPlan({ state, snapshot });
  assert.deepEqual(copy, result); assert.notEqual(copy, result);
  setMatcherSafetyCeilings(matcherSafetyCeilings(), { runtimeRevision: 99, fingerprint: "provenance-correction-only" });
  assert.notEqual(planCheckpointInputIdentity({ state, snapshot }), original);
});
