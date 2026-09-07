import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const VALIDATION_CLIENT_LOCALES = ["en", "th", "zh-CN"];
export const REQUIRED_VALIDATION_STAGES = [
  "prepare-assets", "administration-schema", "web-schema", "matcher-runtime-schema", "runtime-schema", "public-catalogue-fixtures", "typecheck", "changed-lint", "production-build", "browser-fixtures", "data-fingerprints-before", "test-full",
  "matcher-two-runs", ...["a", "b"].flatMap(run => VALIDATION_CLIENT_LOCALES.flatMap(locale => [`docs-client-${run}-${locale}`, `fixture-settlement-${run}-${locale}`, `docs-client-${run}-${locale}-paid`])),
  "documented-client-non-latency-equality", "full-suite-results", "matcher-results", "data-fingerprints-after", "unchanged-schema-and-catalogue"
];
export const REQUIRED_VALIDATION_ARTIFACTS = ["source-before.json", "source-after.json", "stage-results.json", "build-identity.json", "release-lint.json", "test-inventory.json", "data-before.json", "data-after.json", "public-catalogue-fixtures.json",
  "candidate-identity.json", "full-suite/results.json", "matcher/results.json", "client-comparison.json",
  ...["a", "b"].flatMap(run => VALIDATION_CLIENT_LOCALES.flatMap(locale => [`fixture-settlement-${run}-${locale}.json`, `client-${run}-${locale}/receipt.json`, `client-${run}-${locale}/semantic.json`, `client-${run}-${locale}-paid/receipt.json`, `client-${run}-${locale}-paid/semantic.json`]))];

/** Reuse complete evidence only for byte-identical source; a commit alone is insufficient. */
export function readDevValidationProof(file, sourceSha256) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  if (proof.version !== "dev-advisory-validation-2" || proof.contractVersion !== "5.0.0" || !/^[a-f0-9]{40}$/.test(proof.releaseBaseCommit ?? "") || ["releaseLintSha256", "testInventorySha256", "databaseSchemaSha256", "catalogueSha256"].some(key => !/^[a-f0-9]{64}$/.test(proof[key] ?? "")) || proof.environment !== "dev" ||
      proof.candidateOrigin !== "http://127.0.0.1:3100" || proof.passed !== true ||
      proof.unchangedSource !== true || proof.sourceSha256 !== sourceSha256 ||
      proof.buildId !== sourceSha256.slice(0, 40) || !proof.schemaChecksum) {
    throw new Error("DEV validation evidence is failed, incomplete, or belongs to different source.");
  }
  if (!Array.isArray(proof.steps) || proof.steps.some(step => step.passed !== true) ||
      REQUIRED_VALIDATION_STAGES.some(label => proof.steps.filter(step => step.label === label && step.passed === true).length !== 1)) {
    throw new Error("DEV validation evidence is missing a required passing stage.");
  }
  const directory = dirname(resolve(file));
  if (!Array.isArray(proof.artifacts) || !proof.artifacts.length) throw new Error("DEV validation artifact manifest is missing.");
  if (REQUIRED_VALIDATION_ARTIFACTS.some(name => !proof.artifacts.some(item => item.file === name))) throw new Error("DEV validation evidence omitted required artifacts.");
  for (const item of proof.artifacts) {
    const path = resolve(directory, item.file), local = relative(directory, path);
    if (isAbsolute(item.file) || local.startsWith("..") || !local) throw new Error("DEV validation artifact path is outside its evidence directory.");
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== item.sha256) throw new Error(`DEV validation artifact changed: ${item.file}`);
  }
  for (const name of ["full-suite/results.json", "matcher/results.json", "client-comparison.json", "stage-results.json"]) {
    const result = JSON.parse(readFileSync(resolve(directory, name), "utf8"));
    if (result.passed !== true) throw new Error(`DEV validation stage did not pass: ${name}`);
  }
  const json = name => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const lint = json("release-lint.json"), inventory = json("test-inventory.json");
  const { sha256: inventoryHash, ...inventoryContent } = inventory;
  if (lint.baseCommit !== proof.releaseBaseCommit || lint.sha256 !== proof.releaseLintSha256 || hash(lint.files) !== lint.sha256 ||
      inventoryHash !== proof.testInventorySha256 || hash(inventoryContent) !== inventoryHash || !inventory.node?.length || !inventory.browser?.length || !inventory.mcp?.length) {
    throw new Error("DEV validation release or test inventory identity is inconsistent.");
  }
  const dataBefore = json("data-before.json"), dataAfter = json("data-after.json");
  if ([dataBefore, dataAfter].some(data => data.schemaSha256 !== proof.databaseSchemaSha256 || data.catalogueSha256 !== proof.catalogueSha256 || !data.tables?.length || hash(data.tables) !== data.catalogueSha256)) {
    throw new Error("DEV validation schema or catalogue identity changed.");
  }
  const comparison = json("client-comparison.json");
  if (!Array.isArray(comparison.comparisons) || comparison.comparisons.length !== VALIDATION_CLIENT_LOCALES.length * 2 ||
      VALIDATION_CLIENT_LOCALES.some(locale => ["checkout", "-paid"].some(phase => comparison.comparisons.filter(row => row.locale === locale && row.phase === phase && row.identical === true).length !== 1))) {
    throw new Error("DEV validation omitted a language or payment phase from client equality.");
  }
  return proof;
}
