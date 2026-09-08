import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPayloadProof, compiledBuildIdentity, PAYLOAD_STAGES, PAYLOAD_ARTIFACTS, payloadHash } from "../../scripts/mcp-payload/proof.mjs";

test("PAY-AX-02 deployment rejects missing, altered, stale and wrong-environment package evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "payload-proof-"));
  const expected = { contractVersion: "7.2.0", sourceSha256: "s", releaseBaseCommit: "b", contractSha256: "c", inventorySha256: "i", inputSha256: "f" };
  const save = (file: string, data: unknown) => writeFileSync(join(directory, file), JSON.stringify(data));
  const execution = { passed: true, files: 1, cases: 1, failures: [] };
  const fixtures: Record<string, unknown> = {
    "source-before.json": { sha256: "s" }, "source-after.json": { sha256: "s" },
    "test-results-a.json": { passed: true, unchangedSource: true, sourceSha256: "s", execution, missingIds: [] },
    "test-results-b.json": { passed: true, unchangedSource: true, sourceSha256: "s", execution, missingIds: [] },
    "semantic-comparison.json": { passed: true, comparisons: Array.from({ length: 18 }, (_, i) => ({ file: `journey-${i}.json`, identical: true, sha256: "a".repeat(64) })) },
    "stage-results.json": { passed: true }, "inventory.json": { files: [{ expectedCases: 1 }] },
    "report.json": { rows: Array.from({ length: 18 }, () => ({ wholeReduction: .65, responseReduction: .65 })) }
  };
  for (const file of PAYLOAD_ARTIFACTS) save(file, fixtures[file] ?? {});
  const proof = { version: "dev-mcp-payload-1", environment: "dev", contractVersion: "7.2.0", scope: "mcp_payload_and_direct_readers", ...expected,
    passed: true, unchangedSource: true, stages: PAYLOAD_STAGES.map(label => ({ label, passed: true })), artifacts: PAYLOAD_ARTIFACTS.map(file => ({ file, sha256: payloadHash(readFileSync(join(directory, file))) })) };
  const path = join(directory, "attestation.json");
  save("attestation.json", proof); assert.doesNotThrow(() => readPayloadProof(path, expected));
  for (const patch of [{ contractVersion: "7.1.0" }, { environment: "uat" }, { version: "dev-ax-refinement-1" }, { sourceSha256: "stale" }, { stages: proof.stages.slice(1) }, { artifacts: proof.artifacts.slice(1) }, { passed: false }]) {
    save("attestation.json", { ...proof, ...patch }); assert.throws(() => readPayloadProof(path, expected));
  }
  save("attestation.json", proof); save("semantic-comparison.json", { passed: false });
  assert.throws(() => readPayloadProof(path, expected), /changed|altered/);
});

test("PAY-AX-03 compiled build identity rejects changed executable bytes even with the same BUILD_ID", () => {
  const root = mkdtempSync(join(tmpdir(), "payload-build-"));
  writeFileSync(join(root, "BUILD_ID"), "build-1"); writeFileSync(join(root, "app.js"), "original code");
  const original = compiledBuildIdentity(root);
  mkdirSync(join(root, "cache")); writeFileSync(join(root, "cache", "runtime"), "cache only");
  assert.equal(compiledBuildIdentity(root), original);
  writeFileSync(join(root, "app.js"), "altered code"); assert.notEqual(compiledBuildIdentity(root), original);
});
