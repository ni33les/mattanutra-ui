import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMcp721Proof, MCP721_STAGES } from "../../scripts/mcp-721-proof.mjs";
import { payloadHash } from "../../scripts/mcp-payload/proof.mjs";

test("M721-DEPLOY-01 scoped release proof rejects missing, changed and wrong-environment evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "mcp721-proof-"));
  const expected = { sourceSha256: "source", sourceCommit: "commit", releaseBase: "base", contractSha256: "contract", inventorySha256: "inventory", inputSha256: "inputs" };
  const save = (name: string, value: unknown) => writeFileSync(join(root, name), JSON.stringify(value));
  const execution = { passed: true, files: 1, cases: 1, failures: [] };
  const reports = { "tests.json": { passed: true, execution, missing: [] }, "build.json": { buildSha256: "build", nextBuildId: "id" },
    "source-after.json": { sha256: "source" }, "inventory.json": { files: [{ file: "one.test.ts", expectedCases: 1 }] } };
  for (const [name, value] of Object.entries(reports)) save(name, value);
  const proof = { version: "dev-mcp-721-1", environment: "dev", scope: "mcp_721_alignment_and_routines", contractVersion: "7.2.1", ...expected,
    passed: true, stages: MCP721_STAGES.map(label => ({ label, passed: true })), artifacts: Object.entries(reports).map(([file, value]) => ({ file, sha256: payloadHash(JSON.stringify(value)) })) };
  const path = join(root, "attestation.json"); save("attestation.json", proof);
  assert.doesNotThrow(() => checkMcp721Proof(path, expected));
  for (const patch of [{ environment: "uat" }, { passed: false }, { sourceCommit: "stale" }, { stages: proof.stages.slice(1) }, { artifacts: proof.artifacts.slice(1) }]) {
    save("attestation.json", { ...proof, ...patch }); assert.throws(() => checkMcp721Proof(path, expected));
  }
  save("attestation.json", proof); save("tests.json", { passed: false }); assert.throws(() => checkMcp721Proof(path, expected));
});

test("M721-DEPLOY-02 source hygiene rejects focused, skipped and empty cases without matching assertion text", async () => {
  const { testSourceHygiene } = await import("../../scripts/test-execution-proof.mjs");
  assert.ok(testSourceHygiene('test.only("bad",()=>{});', "fixture.ts").length);
  assert.ok(testSourceHygiene('test("bad",{skip:true},()=>{});', "fixture.ts").length);
  assert.ok(testSourceHygiene('test("bad",()=>{});', "fixture.ts").length);
  assert.deepEqual(testSourceHygiene('test("good",()=>{assert.equal("test.only", "test.only");});', "fixture.ts"), []);
});
