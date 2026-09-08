import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { payloadHash } from "./mcp-payload/proof.mjs";

export const MCP721_BASE = "22f3ce60f17158c68a251abe4070f582dd39253a";
export const MCP721_STAGES = ["affected-tests", "typecheck", "release-diff-lint", "production-build", "unchanged-source-and-inputs"];
export function mcp721Identity(sourceSha256, sourceCommit) {
  const inventory = readFileSync("test/mcp-7-2-1/impact.json");
  const inputs = JSON.parse(inventory).inputs.map(file => ({ file, sha256: payloadHash(readFileSync(file)) }));
  return { sourceSha256, sourceCommit, releaseBase: MCP721_BASE,
    contractSha256: payloadHash(readFileSync("contract/mcp/7.2.1/schema.json")), inventorySha256: payloadHash(inventory), inputSha256: payloadHash(JSON.stringify(inputs)) };
}
export function checkMcp721Proof(file, expected) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(proof.version, "dev-mcp-721-1"); assert.equal(proof.environment, "dev");
  assert.equal(proof.scope, "mcp_721_alignment_and_routines"); assert.equal(proof.contractVersion, "7.2.1"); assert.equal(proof.passed, true);
  for (const [key, value] of Object.entries(expected)) { assert.ok(value); assert.equal(proof[key], value, `Changed ${key}`); }
  assert.deepEqual(proof.stages, MCP721_STAGES.map(label => ({ label, passed: true })));
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
  return proof;
}
