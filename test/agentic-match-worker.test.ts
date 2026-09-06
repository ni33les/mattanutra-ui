import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { MatchWorkerPool, MatcherUnavailableError } from "../lib/agentic/plan/match-worker-pool.ts";

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
