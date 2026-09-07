import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const REQUIRED_VALIDATION_STAGES = [
  "prepare-assets", "typecheck", "changed-lint", "production-build", "browser-fixtures", "test-full",
  "matcher-two-runs", "docs-client-a", "fixture-settlement-a", "docs-client-a-paid", "docs-client-b", "fixture-settlement-b", "docs-client-b-paid",
  "documented-client-non-latency-equality", "full-suite-results", "matcher-results"
];

/** Reuse complete evidence only for byte-identical source; a commit alone is insufficient. */
export function readDevValidationProof(file, sourceSha256) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  if (proof.version !== "dev-advisory-validation-1" || proof.environment !== "dev" ||
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
  const requiredArtifacts = ["source-before.json", "source-after.json", "stage-results.json", "build-identity.json",
    "candidate-identity.json", "full-suite/results.json", "matcher/results.json", "client-comparison.json",
    "fixture-settlement-a.json", "fixture-settlement-b.json"];
  if (requiredArtifacts.some(name => !proof.artifacts.some(item => item.file === name))) throw new Error("DEV validation evidence omitted required artifacts.");
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
  return proof;
}
