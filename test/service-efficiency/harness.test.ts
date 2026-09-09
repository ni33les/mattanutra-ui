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

test("EFF-PACK-04 release proof rejects a false repeated-semantic claim", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const { checkMcp721Proof, packageStages } = await import("../../scripts/mcp-721-proof.mjs");
  const { payloadHash } = await import("../../scripts/mcp-payload/proof.mjs");
  const root = mkdtempSync(join(tmpdir(), "eff-proof-"));
  const identity = { sourceSha256: "source", sourceCommit: "commit", releaseBase: "base", contractSha256: "contract", inventorySha256: "inventory", inputSha256: "inputs", schemaSha256: "schema", workerProtocolSha256: "worker" };
  const execution = { passed: true, files: 1, cases: 1, failures: [] };
  const reports = { "tests.json": { passed: true, execution, missing: [] }, "build.json": { buildSha256: "build", nextBuildId: "id", sourceCommit: "commit" },
    "source-after.json": { sha256: "source" }, "inventory.json": { files: [{ file: "fixture.test.ts", expectedCases: 1 }], browser: [{ expectedCases: 1 }], benchmarks: ["d3"] },
    "schema.json": { passed: true, schemaSha256: "schema" }, "browser-results.json": { passed: true, execution },
    "benchmark-comparison.json": { passed: true, reproducible: true, controlCommit: "base", candidateCommit: "commit", runs: ["a", "b"].map(run => ({ run, comparison: { passed: true, rows: [{ id: "d3", identical: true, semanticSha256: run }] } })) } };
  try {
    for (const [file, value] of Object.entries(reports)) writeFileSync(join(root, file), JSON.stringify(value));
    writeFileSync(join(root, "attestation.json"), JSON.stringify({ version: "dev-mcp-efficiency-1", environment: "dev", scope: "core_service_efficiency_and_funnel", contractVersion: "7.2.4", ...identity,
      passed: true, stages: packageStages("efficiency").map(label => ({ label, passed: true })), artifacts: Object.entries(reports).map(([file, value]) => ({ file, sha256: payloadHash(JSON.stringify(value)) })) }));
    assert.throws(() => checkMcp721Proof(join(root, "attestation.json"), identity, "efficiency"));
  } finally { rmSync(root, { recursive: true }); }
});


test("EFF-PACK-05 matching comparisons require queue and execution timing with complete probe counts", async () => {
  const { compareBenchmarkRuns } = await import("../../scripts/service-efficiency/benchmark-proof.mjs");
  const row = { id: "concurrent", inputSha256: "a".repeat(64), semantic: { attempts: 8000 },
    measurements: { wallMs: 100, cpuMs: 80, maxRssBytes: 1000, inputTransfers: 2, inputBytes: 100, checkpointBytes: 500, checkpointFrames: 2 } };
  assert.throws(() => compareBenchmarkRuns([row], [row], ["concurrent"]), /queue|dispatch/i);
});
