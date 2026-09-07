import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { readDevValidationProof, REQUIRED_VALIDATION_STAGES, REQUIRED_VALIDATION_ARTIFACTS } from "../scripts/dev-validation-proof.mjs";

function evidence() {
  const directory = mkdtempSync(join(tmpdir(), "dev-validation-proof-"));
  const source = "a".repeat(64);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const lint = { baseCommit: "b".repeat(40), files: ["matcher.ts"], sha256: hash(["matcher.ts"]) };
  const inventoryContent = { node: ["test/matcher.test.ts"], mcp: ["test/matcher.test.ts"], browser: ["test/e2e/matcher.spec.ts"] };
  const inventory = { ...inventoryContent, sha256: hash(inventoryContent) };
  const tables = [{ table: "products", rows: 1, sha256: source }];
  const data = { tables, schemaSha256: source, catalogueSha256: hash(tables) };
  const comparison = { passed: true, comparisons: ["resources", "tools_only"].flatMap(discovery => ["en", "th", "zh-CN"].flatMap(locale => ["checkout", "-paid"].map(phase => ({ discovery, locale, phase, identical: true })))) };
  const named: Record<string, unknown> = { "release-lint.json": lint, "test-inventory.json": inventory, "data-before.json": data, "data-after.json": data, "client-comparison.json": comparison };
  const artifacts = REQUIRED_VALIDATION_ARTIFACTS.map(file => {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(named[file] ?? { passed: true }));
    return { file, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  });
  const proof = { version: "dev-advisory-validation-3", contractVersion: "6.0.0", releaseBaseCommit: "b".repeat(40), releaseLintSha256: lint.sha256, testInventorySha256: inventory.sha256, databaseSchemaSha256: data.schemaSha256, catalogueSha256: data.catalogueSha256, environment: "dev", candidateOrigin: "http://127.0.0.1:3100",
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
    fixture.proof.steps = REQUIRED_VALIDATION_STAGES.map(label => ({ label, passed: label !== "docs-client-b-zh-CN-paid" }));
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /required passing stage/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});


it("V5-GATE-04 rejects internally inconsistent inventory and incomplete locale evidence even when rehashed", () => {
  for (const target of ["test-inventory.json", "client-comparison.json", "data-after.json"]) {
    const fixture = evidence();
    try {
      const path = join(fixture.directory, target), data = JSON.parse(readFileSync(path, "utf8"));
      if (target === "test-inventory.json") data.mcp = [];
      if (target === "client-comparison.json") data.comparisons = data.comparisons.filter((row: { locale: string }) => row.locale !== "zh-CN");
      if (target === "data-after.json") data.schemaSha256 = "c".repeat(64);
      writeFileSync(path, JSON.stringify(data));
      fixture.proof.artifacts.find(row => row.file === target)!.sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /identity|language/);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});


it("ANNA-GATE-01 rejects obsolete proofs and missing tools-only equality even when remaining evidence is rehashed", () => {
  for (const obsolete of [true, false]) {
    const fixture = evidence();
    try {
      if (obsolete) fixture.proof.version = "dev-advisory-validation-2";
      else {
        const path = join(fixture.directory, "client-comparison.json");
        const comparison = JSON.parse(readFileSync(path, "utf8"));
        comparison.comparisons = comparison.comparisons.filter((row: { discovery: string }) => row.discovery !== "tools_only");
        writeFileSync(path, JSON.stringify(comparison));
        fixture.proof.artifacts.find(row => row.file === "client-comparison.json")!.sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /incomplete|language/);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});
