import assert from "node:assert/strict";
import { test } from "node:test";

test("EFF-PACK-01 benchmark evidence rejects missing runs and semantic changes without hiding dose or work differences", async () => {
  const { compareBenchmarkRuns } = await import("../../scripts/service-efficiency/benchmark-proof.mjs");
  const timing = { count: 2, totalMs: 2, p50Ms: 1, p95Ms: 1, maxMs: 1 };
  const row = { id: "d3", inputSha256: "a".repeat(64), semantic: { doses: [2], advice: ["review"], attempts: 8000 },
    measurements: { wallMs: 100, cpuMs: 80, maxRssBytes: 1000, inputTransfers: 2, inputBytes: 100, checkpointBytes: 500, checkpointFrames: 2, queue: timing, execution: timing } };
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
  const register={mechanisms:Array.from({length:39},(_,index)=>({number:index+1,disposition:"retain",cases:[{file:"fixture.test.ts",name:`case-${index+1}`}]}))};
  const events=register.mechanisms.map(row=>({file:"fixture.test.ts",name:`case-${row.number}`,type:"test",passed:true}));
  const {verifyLockExecution}=await import("../../scripts/service-efficiency/rollout-proof.mjs");
  const identity = { deploymentBases:{dev:"d".repeat(40),uat:"e".repeat(40)},lockRegisterSha256:payloadHash(JSON.stringify(register)),sourceSha256: "source", sourceCommit: "c".repeat(40), releaseBase: "base", contractSha256: "contract", inventorySha256: "inventory", inputSha256: "inputs", schemaSha256: "schema", workerProtocolSha256: "worker" };
  const execution = { passed: true, files: 1, cases: 39, failures: [] };
  const reports = { "lock-register.json":register,"executed-cases.json":events,"lock-register-verification.json":verifyLockExecution(register,events),
    "rollout.json":{version:1,environments:["dev","uat"],deploymentBases:identity.deploymentBases,sourceCommit:identity.sourceCommit,lockRegisterSha256:identity.lockRegisterSha256}, "tests.json": { passed: true, execution, missing: [] }, "build.json": { buildSha256: "build", nextBuildId: "id", sourceCommit: identity.sourceCommit },
    "source-after.json": { sha256: "source" }, "inventory.json": { files: [{ file: "fixture.test.ts", expectedCases: 39 }], browser: [{ expectedCases: 39 }], benchmarks: ["d3"] },
    "schema.json": { passed: true, schemaSha256: "schema" }, "browser-results.json": { passed: true, execution },
    "benchmark-comparison.json": { passed: true, reproducible: true, controlCommit: "base", candidateCommit: identity.sourceCommit, runs: ["a", "b"].map(run => ({ run, comparison: { passed: true, rows: [{ id: "d3", identical: true, semanticSha256: run }] } })) } };
  try {
    for (const [file, value] of Object.entries(reports)) writeFileSync(join(root, file), JSON.stringify(value));
    writeFileSync(join(root, "attestation.json"), JSON.stringify({ version: "dev-mcp-efficiency-1", environment: "dev", scope: "core_service_efficiency_and_funnel", contractVersion: "7.2.4", ...identity,
      passed: true, stages: packageStages("efficiency").map(label => ({ label, passed: true })), artifacts: Object.entries(reports).map(([file, value]) => ({ file, sha256: payloadHash(JSON.stringify(value)) })) }));
    assert.throws(() => checkMcp721Proof(join(root, "attestation.json"), identity, "efficiency"), /deep-equal/, "The failure must be the contradictory semantic hashes, not a missing prerequisite");
  } finally { rmSync(root, { recursive: true }); }
});


test("EFF-PACK-05 matching comparisons require queue and execution timing with complete probe counts", async () => {
  const { compareBenchmarkRuns } = await import("../../scripts/service-efficiency/benchmark-proof.mjs");
  const row = { id: "concurrent", inputSha256: "a".repeat(64), semantic: { attempts: 8000 },
    measurements: { wallMs: 100, cpuMs: 80, maxRssBytes: 1000, inputTransfers: 2, inputBytes: 100, checkpointBytes: 500, checkpointFrames: 2 } };
  assert.throws(() => compareBenchmarkRuns([row], [row], ["concurrent"]), /queue|dispatch/i);
  const timing = { count: 2, totalMs: 2, p50Ms: 1, p95Ms: 1, maxMs: 1 };
  const valid = { ...row, measurements: { ...row.measurements, queue: timing, execution: timing } };
  assert.equal(compareBenchmarkRuns([valid], [valid], ["concurrent"]).passed, true);
  assert.throws(() => compareBenchmarkRuns([valid], [{ ...valid, measurements: { ...valid.measurements, queue: { ...timing, count: 1 } } }], ["concurrent"]), /incomplete dispatch/i);
});


test("EFF-PACK-06 database benchmarks exclude background setup queries and retain lazy SQL fragments", async () => {
  const moduleUrl = new URL("../../scripts/service-efficiency/database-traffic.mjs", import.meta.url);
  const { existsSync } = await import("node:fs"); assert.ok(existsSync(moduleUrl), "Request-scoped benchmark measurement is required");
  const { measureDatabaseTraffic } = await import(moduleUrl.href);
  const raw = (parts: TemplateStringsArray) => Promise.resolve([{ text: parts.join("") }]);
  const measured = measureDatabaseTraffic(raw);
  let release!: () => void; const signal = new Promise<void>(resolve => { release = resolve; });
  const background = signal.then(() => measured.sql`select background_setup`);
  await measured.observe(async () => {
    release(); await background;
    await measured.sql`select current_poll`;
  });
  assert.equal(measured.measurements().applicationSelects, 1);
  assert.equal(measured.measurements().sqlStatements, 1);
  assert.equal(measured.measurements().rowBytes, Buffer.byteLength(JSON.stringify([{ text: "select current_poll" }])));
  measured.reset();
  await measured.observe(async () => { const fragment = measured.sql`current_timestamp`; assert.ok(fragment); });
  assert.equal(measured.measurements().sqlStatements, 0);
});
