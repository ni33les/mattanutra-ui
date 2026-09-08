import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readAxValidationProof, AX_STAGES, AX_ARTIFACTS } from "../../scripts/ax-validation-proof.mjs";

test("AXR-DEPLOY-01 DEV work-package proofs reject stale source, wrong environment, missing stages and altered artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ax-proof-test-"));
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    const identity = { sourceSha256: "a".repeat(64), releaseBaseCommit: "b".repeat(40), contractSha256: "c".repeat(64), inputSha256: "d".repeat(64), inventorySha256: "e".repeat(64) };
    const proof = { version: "dev-ax-refinement-1", environment: "dev", scope: "dev_ax_refinement_and_direct_consumers", contractVersion: "7.0.0", ...identity,
      passed: true, unchangedSource: true, stages: AX_STAGES.map(label => ({ label, passed: true })),
      artifacts: AX_ARTIFACTS.map(file => { const text = JSON.stringify({ passed: true, value: file }); writeFileSync(join(dir, file), text); return { file, sha256: hash(text) }; }) };
    const path = join(dir, "attestation.json");
    const save = (value: unknown) => writeFileSync(path, JSON.stringify(value)); save(proof);
    assert.equal(readAxValidationProof(path, identity).passed, true);
    assert.throws(() => readAxValidationProof(path, { ...identity, sourceSha256: "f".repeat(64) }), /source|identity/);
    save({ ...proof, environment: "uat" }); assert.throws(() => readAxValidationProof(path, identity), /DEV/);
    save({ ...proof, stages: proof.stages.slice(1) }); assert.throws(() => readAxValidationProof(path, identity), /stage/);
    save(proof); writeFileSync(join(dir, AX_ARTIFACTS[0]), "altered"); assert.throws(() => readAxValidationProof(path, identity), /artifact/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("AXR-DEPLOY-02 scoped verification is explicit and DEV-only while ordinary deployment retains full verification", () => {
  const dev = readFileSync(new URL("../../scripts/deploy-dev.mjs", import.meta.url), "utf8");
  assert.match(dev, /--ax-refinement-attestation/); assert.match(dev, /verify:dev/); assert.match(dev, /readAxValidationProof/);
  const uat = readFileSync(new URL("../../scripts/deploy-uat.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(uat, /readAxValidationProof|ax-refinement-attestation/);
});
