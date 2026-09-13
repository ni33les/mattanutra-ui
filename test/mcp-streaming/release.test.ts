import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MCP_PACKAGES, packageStages, mcp721Identity, checkMcp721Proof } from "../../scripts/mcp-721-proof.mjs";
import { testSourceHygiene } from "../../scripts/test-execution-proof.mjs";
test("STREAM-RELEASE-01 acceptance is limited to this DEV package with semantic and lock checks", () => {
  assert.equal(MCP_PACKAGES.streaming.version, "11.1.0");
  assert.equal(MCP_PACKAGES.streaming.base, "e588c405473480ef5e0796c6f48d195365d450fc");
  assert.deepEqual(packageStages("streaming"), ["affected-tests", "no-new-locks", "completion-comparison", "typecheck", "release-diff-lint", "production-build", "unchanged-source-and-inputs"]);
});
test("STREAM-RELEASE-02 wrong environment, changed source and incomplete evidence cannot authorize release", () => {
  const identity = mcp721Identity("source", "commit", "streaming");
  const root = mkdtempSync(join(tmpdir(), "stream-proof-")), file = join(root, "proof.json");
  const validHeader = { ...identity, version: "dev-mcp-streaming-1", environment: "dev", scope: MCP_PACKAGES.streaming.scope, contractVersion: "11.1.0", passed: true,
    stages: packageStages("streaming").map(label => ({ label, passed: true })), artifacts: [] };
  try {
    for (const edit of [{ environment: "uat" }, { sourceCommit: "altered" }, { passed: false }, {}]) {
      writeFileSync(file, JSON.stringify({ ...validHeader, ...edit }));
      assert.throws(() => checkMcp721Proof(file, identity, "streaming"));
    }
  } finally { rmSync(root, { recursive: true }); }
});
test("STREAM-RELEASE-03 maintained hygiene detects focused, skipped and unfinished cases", () => {
  for (const source of ["test.only('focused', () => {})", "test.skip('missing', () => {})", "test.todo('unfinished')"]) {
    assert.ok(testSourceHygiene(source, "fixture.test.ts").length > 0);
  }
});
