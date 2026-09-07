import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { MatchWorkerPool, MatcherUnavailableError } from "../lib/agentic/plan/match-worker-pool.ts";
import { captureReferenceJobIdentity, validateReferenceJobIdentity, checkedReferenceCompletion } from "../lib/agentic/catalogue/reference-job.ts";
import { matcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";

beforeEach(installGoldCatalogue);
afterEach(uninstallGoldCatalogue);
async function input() {
  const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot,
    request: { destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
      profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
      targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }, { name: "Magnesium", amount: 200, unit: "mg" }] }
  });
  assert.ok("state" in normalized);
  return { snapshot, state: normalized.state };
}

describe("MCP matcher worker pool", () => {
  it("ANNA-REF-WORKER-01 rejects a reference epoch that differs from the product snapshot", async () => {
    const pool = new MatchWorkerPool(1);
    try {
      const job = await input();
      setMatcherSafetyCeilings(matcherSafetyCeilings(), { runtimeRevision: 78, fingerprint: "a".repeat(64) });
      await assert.rejects(pool.run({ ...job, snapshot: { ...job.snapshot, runtimeRevision: 77 } }), /reference.*identity|reference.*epoch/i);
    } finally { await pool.close(); }
  });

  it("ANNA-REF-WORKER-02 rejects a live epoch without captured reference identity", async () => {
    const pool = new MatchWorkerPool(1);
    try {
      const job = await input();
      setMatcherSafetyCeilings(matcherSafetyCeilings());
      await assert.rejects(pool.run({ ...job, snapshot: { ...job.snapshot, runtimeRevision: 77 } }), /reference.*identity|reference.*epoch/i);
    } finally { await pool.close(); }
  });

  it("ANNA-REF-WORKER-04 rejects changed reference payloads and result identity", () => {
    setMatcherSafetyCeilings(matcherSafetyCeilings(), { runtimeRevision: 77, fingerprint: "a".repeat(64) });
    const identity = captureReferenceJobIdentity(77);
    const ceilings = matcherSafetyCeilings();
    assert.doesNotThrow(() => validateReferenceJobIdentity(identity, ceilings, 77));
    assert.throws(() => validateReferenceJobIdentity(identity, [...ceilings, { subjectId: "mutated", name: "Vitamin D3", maxAmount: 1000, maxUnit: "mcg" }], 77), /worker input/);
    assert.throws(() => validateReferenceJobIdentity({ ...identity, runtimeRevision: 76 }, ceilings, 77), /worker input/);
    assert.throws(() => checkedReferenceCompletion({ value: "result", referenceIdentity: { ...identity, fingerprint: "b".repeat(64) } }, identity), /worker result/);
    assert.equal(checkedReferenceCompletion({ value: "result", referenceIdentity: identity }, identity), "result");
  });

  it("preserves matching and safety results across the worker boundary", async () => {
    const pool = new MatchWorkerPool(1);
    try {
      const job = await input();
      const expected = matchPlan(job);
      assert.deepEqual(await pool.run(job), expected);
      assert.deepEqual(await pool.run(job), expected);
    } finally { await pool.close(); }
  });

  it("bounds its queue, cancels active work, and recovers capacity", async () => {
    const pool = new MatchWorkerPool(1, 1);
    try {
      const job = await input();
      const controller = new AbortController();
      const first = pool.run(job, controller.signal);
      const rejected = assert.rejects(first, { name: "AbortError" });
      const second = pool.run(job);
      await assert.rejects(pool.run(job), MatcherUnavailableError);
      controller.abort();
      await rejected;
      assert.ok((await second).selected);
    } finally { await pool.close(); }
  });

  it("expires queued work while the HTTP event loop remains responsive", async () => {
    const pool = new MatchWorkerPool(1);
    try {
      const job = await input();
      const active = pool.run(job);
      const queued = pool.run(job, undefined, 5);
      await assert.rejects(queued, MatcherUnavailableError);
      assert.ok((await active).selected);
    } finally { await pool.close(); }
  });
});
