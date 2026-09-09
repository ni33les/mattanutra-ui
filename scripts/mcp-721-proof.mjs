import { compareBenchmarkRuns } from "./service-efficiency/benchmark-proof.mjs";
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { payloadHash } from "./mcp-payload/proof.mjs";
import { validateRolloutBinding, verifyLockExecution } from "./service-efficiency/rollout-proof.mjs";
import {validateUatResources} from "./service-efficiency/runtime-resources.mjs";

export const MCP721_BASE = "22f3ce60f17158c68a251abe4070f582dd39253a";
export const MCP_PACKAGES = {
  "efficiency": { version: "7.2.4", directory: "test/service-efficiency", base: "a28f3b27d6bde5a21803fa5e33622e89ce2a708d", scope: "core_service_efficiency_and_funnel" },
  "conversation": { version: "7.2.4", directory: "test/mcp-conversation-pack", base: "1c169407ba0f3fed3a19871afa87ce0bdeecf949", scope: "mcp_conversation_payload" },
  "721": { version: "7.2.1", directory: "test/mcp-7-2-1", base: MCP721_BASE, scope: "mcp_721_alignment_and_routines" },
  "724": { version: "7.2.4", directory: "test/mcp-tool-card", base: "fab0e5a0c0d3b6d593404c4fe13e3849b7da752b", scope: "mcp_tool_card_publication" },
  "723": { version: "7.2.3", directory: "test/mcp-7-2-3", base: "380a1dd08ededd7dfcf25aef45ab3c4649b65b2b", scope: "mcp_723_refinement_and_conversation" },
  "722": { version: "7.2.2", directory: "test/mcp-7-2-2", base: "391ba2beafc01a49d119a85b5f632a8a6f737944", scope: "mcp_722_open_points" }
};
export const MCP721_STAGES = ["affected-tests", "typecheck", "release-diff-lint", "production-build", "unchanged-source-and-inputs"];
export function packageStages(packageId) {
  return packageId === "efficiency" ? ["isolated-schema", "affected-tests", "lock-register-verification", "typecheck", "release-diff-lint", "production-build", "affected-browser-tests", "repeated-baseline-comparison", "unchanged-source-and-inputs"] : MCP721_STAGES;
}
export function mcp721Identity(sourceSha256, sourceCommit, packageId = "721") {
  const definition = MCP_PACKAGES[packageId]; assert.ok(definition, "Unknown work package");
  const inventory = readFileSync(`${definition.directory}/impact.json`);
  const inputs = JSON.parse(inventory).inputs.map(file => ({ file, sha256: payloadHash(readFileSync(file)) }));
  return { ...(packageId === "efficiency" ? { deploymentBases: JSON.parse(inventory).deploymentBases,
    lockRegisterSha256: payloadHash(readFileSync("test/service-efficiency/lock-register.json")),
    schemaSha256: payloadHash(readFileSync("scripts/service-efficiency-schema.sql")), workerProtocolSha256: payloadHash(readFileSync("lib/agentic/plan/match-worker-protocol.ts")) } : {}), sourceSha256, sourceCommit, releaseBase: definition.base,
    contractSha256: payloadHash(readFileSync(`contract/mcp/${definition.version}/schema.json`)), inventorySha256: payloadHash(inventory), inputSha256: payloadHash(JSON.stringify(inputs)) };
}
export function checkMcp721Proof(file, expected, packageId = "721") {
  const definition = MCP_PACKAGES[packageId]; assert.ok(definition, "Unknown work package");
  const proof = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(proof.version, `dev-mcp-${packageId}-1`); assert.equal(proof.environment, "dev");
  assert.equal(proof.scope, definition.scope); assert.equal(proof.contractVersion, definition.version); assert.equal(proof.passed, true);
  for (const [key, value] of Object.entries(expected)) { assert.ok(value); assert.deepEqual(proof[key], value, `Changed ${key}`); }
  assert.deepEqual(proof.stages, packageStages(packageId).map(label => ({ label, passed: true })));
  const root = realpathSync(dirname(resolve(file)));
  assert.ok(Array.isArray(proof.artifacts) && proof.artifacts.length > 0);
  assert.equal(new Set(proof.artifacts.map(row => row.file)).size, proof.artifacts.length);
  for (const row of proof.artifacts) {
    const path = realpathSync(resolve(root, row.file));
    assert.ok(!isAbsolute(row.file) && path !== root && !relative(root, path).startsWith(".."));
    assert.equal(payloadHash(readFileSync(path)), row.sha256, `Altered artifact: ${row.file}`);
  }
  const json = name => { assert.ok(proof.artifacts.some(row => row.file === name), `Missing ${name}`); return JSON.parse(readFileSync(resolve(root, name), "utf8")); };
  const tests = json("tests.json"), inventory = json("inventory.json"), build = json("build.json");
  assert.equal(tests.passed, true); assert.equal(tests.execution.passed, true); assert.deepEqual(tests.execution.failures, []); assert.deepEqual(tests.missing, []);
  assert.ok(inventory.files.length > 0); assert.equal(tests.execution.files, inventory.files.length);
  assert.equal(tests.execution.cases, inventory.files.reduce((sum, row) => sum + row.expectedCases, 0));
  assert.ok(tests.execution.cases > 0 && build.buildSha256 && build.nextBuildId);
  assert.equal(json("source-after.json").sha256, expected.sourceSha256);
  if (packageId === "efficiency") {
    const register = json("lock-register.json"), events = json("executed-cases.json");
    assert.equal(payloadHash(readFileSync(resolve(root, "lock-register.json"))), expected.lockRegisterSha256);
    assert.deepEqual(json("lock-register-verification.json"), verifyLockExecution(register, events));
    validateRolloutBinding(json("rollout.json"), expected, "dev", expected.deploymentBases.dev);
    validateRolloutBinding(json("rollout.json"), expected, "uat", expected.deploymentBases.uat);
    const browser = json("browser-results.json"), benchmark = json("benchmark-comparison.json"), schema = json("schema.json");
    assert.equal(browser.passed, true); assert.equal(browser.execution.passed, true); assert.deepEqual(browser.execution.failures, []);
    assert.equal(browser.execution.cases, inventory.browser.reduce((sum, row) => sum + row.expectedCases, 0));
    assert.equal(benchmark.passed, true); assert.equal(benchmark.reproducible, true);
    assert.equal(benchmark.controlCommit, expected.releaseBase); assert.equal(benchmark.candidateCommit, expected.sourceCommit);
    assert.deepEqual(benchmark.runs.map(row => row.run), ["a", "b"]);
    for (const run of benchmark.runs) {
      assert.equal(run.comparison.passed, true);
      assert.deepEqual(run.comparison.rows.map(row => row.id).sort(), [...inventory.benchmarks].sort());
      assert.ok(run.comparison.rows.every(row => row.identical === true && row.semanticSha256));
    }
    assert.deepEqual(benchmark.runs[0].comparison.rows.map(row => [row.id, row.semanticSha256]), benchmark.runs[1].comparison.rows.map(row => [row.id, row.semanticSha256]));
    for (const run of benchmark.runs) {
      const rows = label => inventory.benchmarks.map(id => json(`benchmarks/${run.run}-${id}-${label}.json`));
      for(const value of [...rows("control"),...rows("candidate")]) validateUatResources(value.measurements.resources);
      assert.deepEqual(compareBenchmarkRuns(rows("control"), rows("candidate"), inventory.benchmarks), run.comparison);
    }
    assert.equal(schema.passed, true); assert.equal(schema.schemaSha256, expected.schemaSha256);
    assert.equal(build.sourceCommit, expected.sourceCommit);
  }
  return proof;
}
