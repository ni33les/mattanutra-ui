import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { infoTool } from "../lib/agentic/info.ts";
import { observeLatency } from "./helpers/latency-observation.ts";

import {
  closeSession,
  createPlan,
  freezeImplCatalogue,
  openSession,
  primaryRequest
} from "./agentic/value/impl-harness.ts";

const WARM_PLAN_P95_MS = 1_500;
const WARM_INFO_P95_MS = 300;

function percentile(values: readonly number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length < 1) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

describe("Customer value speed pack", () => {
  it("warm plan create reaches ready without processing polls", async () => {
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const request = primaryRequest(frozen.freeze);
      await createPlan(session, request);
      const samples: number[] = [];
      const statuses: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const started = performance.now();
        const plan = await createPlan(session, request);
        samples.push(Math.round(performance.now() - started));
        statuses.push(String(plan.status));
      }
      const p95 = percentile(samples, 95);
      assert.equal(
        statuses.every((status) => status !== "processing"),
        true,
        `processing returned: ${statuses.join(",")}`
      );
      assert.equal(
        statuses.every(
          (status) =>
            status === "ready" || status === "needs_input" || status === "no_purchase"
        ),
        true,
        `unexpected status: ${statuses.join(",")}`
      );
      observeLatency(p95, WARM_PLAN_P95_MS, "warm plan p95");
    } finally {
      closeSession();
    }
  });

  it("does not cut the first create short to force a 3s poll", () => {
    const source = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
    assert.match(source, /PLAN_MATCH_RETURN_BUDGET_MS = 3_000/);
    assert.equal(source.includes("sleep(PLAN_MATCH_RETURN_BUDGET_MS)"), false);
    assert.match(source, /PLAN_PROCESSING_POLL_AFTER_SECONDS = 1/);
    assert.match(source, /writeProcessingRevision/);
    assert.match(source, /inflightPlanIdempotency/);
  });

  it("info returns supported markets and records its latency", async () => {
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const started = performance.now();
      const info = await infoTool({ config: session.config });
      assert.equal(info.ok, true);
      assert.ok(info.supportedCountries.length > 0);
      observeLatency(performance.now() - started, WARM_INFO_P95_MS, "info");
    } finally { closeSession(); }
  });

  it("repeat identical request preserves its result and reports warm latency", async () => {
    const matching = readFileSync(new URL("../lib/agentic/plan/matching.ts", import.meta.url), "utf8");
    assert.match(matching, /matchPlanCache/);
    const frozen = await freezeImplCatalogue();
    assert.equal(frozen.usable, true);
    const session = openSession(frozen.freeze);
    try {
      const request = primaryRequest(frozen.freeze);
      const firstStarted = performance.now();
      const first = await createPlan(session, request);
      const firstMs = Math.round(performance.now() - firstStarted);
      const secondStarted = performance.now();
      const second = await createPlan(session, request);
      const secondMs = Math.round(performance.now() - secondStarted);
      assert.equal(first.status, second.status);
      assert.deepEqual(first.coverage, second.coverage);
      assert.deepEqual(first.basket, second.basket);
      observeLatency(secondMs, Math.max(firstMs, 400), "repeat plan compared with first");
    } finally {
      closeSession();
    }
  });
});
