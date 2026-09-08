import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { matchPlan, matchPlanChunk, planCheckpointInputIdentity } from "../../lib/agentic/plan/matching.ts";
import { setMatcherSafetyCeilings, matcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";
import { deserialize } from "node:v8";
import { inflateSync } from "node:zlib";

afterEach(uninstallGoldCatalogue);
test("AXR-REL-03 recovery accepts a new observation clock but rejects changed catalogue facts", async () => {
  installGoldCatalogue();
  const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
    destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
    profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
    targets: [{ name: "Magnesium", amount: 200, unit: "mg" }]
  } });
  assert.ok("state" in normalized);
  const input = { snapshot, state: normalized.state };
  const first = matchPlanChunk(input, { chunkBudget: 1 }); assert.equal(first.done, false);
  const refreshed = { ...input, snapshot: { ...snapshot, availabilityAsOf: "2026-09-08T03:29:00Z" } };
  assert.equal(planCheckpointInputIdentity(refreshed), first.checkpoint.inputIdentity);
  const resumed = matchPlanChunk(refreshed, { checkpoint: first.checkpoint, chunkBudget: 8000 });
  const uninterrupted = matchPlanChunk(input, { checkpoint: first.checkpoint, chunkBudget: 8000 });
  assert.equal(resumed.expansionAttempts, uninterrupted.expansionAttempts);
  const decoded = (cursor: string) => deserialize(inflateSync(Buffer.from(cursor, "base64")));
  assert.deepEqual(decoded(resumed.checkpoint.cursor), decoded(uninterrupted.checkpoint.cursor));
  // V8 bytes may differ with object sharing. Compare decoded work and complete
  // results, normalizing only the deliberately changed observation timestamp.
  const observationNormalized = (value: unknown): unknown => Array.isArray(value) ? value.map(observationNormalized)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "availabilityAsOf" ? snapshot.availabilityAsOf : observationNormalized(item)])) : value;
  assert.deepEqual(observationNormalized(resumed.result), observationNormalized(uninterrupted.result));
  assert.ok(snapshot.products.length > 0);
  const changed = { ...refreshed, snapshot: { ...refreshed.snapshot, products: refreshed.snapshot.products.map((product, index) => index === 0 ? { ...product, unitPriceMinor: product.unitPriceMinor + 1 } : product) } };
  assert.throws(() => matchPlanChunk(changed, { checkpoint: first.checkpoint, chunkBudget: 1 }), /identity changed/);
});

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
