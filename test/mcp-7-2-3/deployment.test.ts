import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMcp721Proof, MCP721_STAGES } from "../../scripts/mcp-721-proof.mjs";
import { payloadHash } from "../../scripts/mcp-payload/proof.mjs";

test("M723-DEPLOY-01 scoped release proof rejects missing, changed and wrong-environment evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "mcp721-proof-"));
  const expected = { sourceSha256: "source", sourceCommit: "commit", releaseBase: "base", contractSha256: "contract", inventorySha256: "inventory", inputSha256: "inputs" };
  const save = (name: string, value: unknown) => writeFileSync(join(root, name), JSON.stringify(value));
  const execution = { passed: true, files: 1, cases: 1, failures: [] };
  const reports = { "tests.json": { passed: true, execution, missing: [] }, "build.json": { buildSha256: "build", nextBuildId: "id" },
    "source-after.json": { sha256: "source" }, "inventory.json": { files: [{ file: "one.test.ts", expectedCases: 1 }] } };
  for (const [name, value] of Object.entries(reports)) save(name, value);
  const proof = { version: "dev-mcp-723-1", environment: "dev", scope: "mcp_723_refinement_and_conversation", contractVersion: "7.2.3", ...expected,
    passed: true, stages: MCP721_STAGES.map(label => ({ label, passed: true })), artifacts: Object.entries(reports).map(([file, value]) => ({ file, sha256: payloadHash(JSON.stringify(value)) })) };
  const path = join(root, "attestation.json"); save("attestation.json", proof);
  assert.doesNotThrow(() => checkMcp721Proof(path, expected, "723"));
  for (const patch of [{ environment: "uat" }, { passed: false }, { sourceCommit: "stale" }, { stages: proof.stages.slice(1) }, { artifacts: proof.artifacts.slice(1) }]) {
    save("attestation.json", { ...proof, ...patch }); assert.throws(() => checkMcp721Proof(path, expected, "723"));
  }
  save("attestation.json", proof); save("tests.json", { passed: false }); assert.throws(() => checkMcp721Proof(path, expected, "723"));
});
