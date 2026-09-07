import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { observeBenchmark, observeLatency, nonLatencyBenchmarkEvidence } from "./helpers/latency-observation.ts";
import { scoreUncachedPlanBenchmark } from "../lib/agentic/qa/latency-score.ts";

describe("v4 observational latency acceptance", () => {
  it("warns on slow completed measurements, but rejects missing or invalid measurements", () => {
    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = value => { warnings.push(value); };
    try {
      observeLatency(6000, 5000, "fixture");
      observeBenchmark({ passed: false, failureStage: "P95" }, "fixture");
      assert.equal(warnings.length, 2);
      assert.throws(() => observeLatency(NaN, 5000, "fixture"));
      assert.throws(() => observeBenchmark({ passed: false, failureStage: "SAMPLE_COUNT" }, "fixture"));
      const invalid = scoreUncachedPlanBenchmark({ budgets: { p50BudgetMs: 100, p95BudgetMs: 200 }, cacheMode: "uncached", concurrency: 1, n: 1, samples: [-1] });
      assert.equal(invalid.failureStage, "INVALID_SAMPLE");
      assert.throws(() => observeBenchmark(invalid, "fixture"));
    } finally { console.warn = original; }
  });
  it("acceptance equality preserves sample counts and build identity across timing warnings", () => {
    const left = { buildId: "candidate", snapshotId: "catalogue", fixed: { n: 30, passed: true, failureStage: "NONE" } };
    const right = { ...left, fixed: { n: 30, passed: false, failureStage: "P95" } };
    assert.deepEqual(nonLatencyBenchmarkEvidence(left), nonLatencyBenchmarkEvidence(right));
    assert.notDeepEqual(nonLatencyBenchmarkEvidence(left), nonLatencyBenchmarkEvidence({ ...right, fixed: { ...right.fixed, n: 29 } }));
    assert.notDeepEqual(nonLatencyBenchmarkEvidence(left), nonLatencyBenchmarkEvidence({ ...right, buildId: "different" }));
  });
});
