import assert from "node:assert/strict";
import { test } from "node:test";

test("EFF-PACK-01 benchmark evidence rejects missing runs and semantic changes without hiding dose or work differences", async () => {
  const { compareBenchmarkRuns } = await import("../../scripts/service-efficiency/benchmark-proof.mjs");
  const row = { id: "d3", inputSha256: "a".repeat(64), semantic: { doses: [2], advice: ["review"], attempts: 8000 },
    measurements: { wallMs: 100, cpuMs: 80, maxRssBytes: 1000, inputTransfers: 2, inputBytes: 100, checkpointBytes: 500 } };
  assert.throws(() => compareBenchmarkRuns([row], [], ["d3"]), /missing|inventory/i);
  assert.throws(() => compareBenchmarkRuns([row], [{ ...row, semantic: { ...row.semantic, doses: [3] } }], ["d3"]), /semantic/i);
  assert.throws(() => compareBenchmarkRuns([row], [{ ...row, semantic: { ...row.semantic, attempts: 7999 } }], ["d3"]), /semantic/i);
  const result = compareBenchmarkRuns([row], [{ ...row, measurements: { ...row.measurements, wallMs: 101, inputTransfers: 1 } }], ["d3"]);
  assert.equal(result.passed, true); assert.equal(result.rows[0].candidate.wallMs, 101);
});

test("EFF-PACK-02 DEV efficiency attestation requires browser and repeated benchmark evidence", async () => {
  const { packageStages } = await import("../../scripts/mcp-721-proof.mjs");
  const stages = packageStages("efficiency");
  assert.ok(stages.includes("affected-browser-tests")); assert.ok(stages.includes("repeated-baseline-comparison"));
  assert.ok(stages.includes("isolated-schema"));
  assert.ok(!packageStages("conversation").includes("repeated-baseline-comparison"));
});

test("EFF-PACK-03 scoped runner retains the shared hygiene and execution checks", async () => {
  const { testSourceHygiene, nodeExecutionProof, browserExecutionProof } = await import("../../scripts/test-execution-proof.mjs");
  for (const source of ['test.only("x",()=>{assert.ok(true)})', 'test("x",{skip:true},()=>{assert.ok(true)})', 'test("x",()=>{})'])
    assert.ok(testSourceHygiene(source, "fixture.test.ts").length > 0);
  assert.equal(nodeExecutionProof(["fixture.test.ts"], []).passed, false);
  assert.equal(nodeExecutionProof(["fixture.test.ts"], [{ file: "fixture.test.ts", name: "x", passed: false, type: "test", failureType: "cancelledByParent" }]).passed, false);
  assert.equal(browserExecutionProof(["test/e2e/fixture.spec.ts"], { suites: [] }, { suites: [], stats: {} }).passed, false);
});
