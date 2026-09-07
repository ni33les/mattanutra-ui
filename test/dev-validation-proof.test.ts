import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { readDevValidationProof, REQUIRED_VALIDATION_STAGES } from "../scripts/dev-validation-proof.mjs";

function evidence() {
  const directory = mkdtempSync(join(tmpdir(), "dev-validation-proof-"));
  const source = "a".repeat(64);
  const artifacts = ["source-before.json", "source-after.json", "stage-results.json", "build-identity.json",
    "candidate-identity.json", "full-suite/results.json", "matcher/results.json", "client-comparison.json",
    "fixture-settlement-a.json", "fixture-settlement-b.json"].map(file => {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ passed: true }));
    return { file, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  });
  const proof = { version: "dev-advisory-validation-1", environment: "dev", candidateOrigin: "http://127.0.0.1:3100",
    passed: true, unchangedSource: true, sourceSha256: source, buildId: source.slice(0, 40), schemaChecksum: "fixture-contract-checksum",
    steps: REQUIRED_VALIDATION_STAGES.map(label => ({ label, passed: true })), artifacts };
  const file = join(directory, "attestation.json");
  writeFileSync(file, JSON.stringify(proof));
  return { directory, source, proof, file };
}

it("reuses a complete validation only for the same source and unchanged evidence", () => {
  const fixture = evidence();
  try {
    assert.equal(readDevValidationProof(fixture.file, fixture.source).passed, true);
    assert.throws(() => readDevValidationProof(fixture.file, "b".repeat(64)), /different source/);
    writeFileSync(join(fixture.directory, "matcher/results.json"), JSON.stringify({ passed: false }));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /artifact changed/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

it("does not accept an overall green claim with missing or failed full-suite stages", () => {
  const fixture = evidence();
  try {
    fixture.proof.steps = fixture.proof.steps.filter(step => step.label !== "test-full");
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /required passing stage/);
    fixture.proof.steps = REQUIRED_VALIDATION_STAGES.map(label => ({ label, passed: label !== "docs-client-b-paid" }));
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /required passing stage/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});
