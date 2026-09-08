import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const AX_STAGES = ["isolated-schema-and-corrections-a", "isolated-schema-and-corrections-b", "scoped-tests-a", "scoped-tests-b", "semantic-equality", "linear-control-comparison", "typecheck", "release-diff-lint", "production-build", "unchanged-source-and-inputs"];
export const AX_ARTIFACTS = ["source-before.json", "source-after.json", "inventory.json", "inputs.json", "schema-data.json", "test-results-a.json", "test-results-b.json", "semantic-comparison.json", "linear-comparison.json", "release-lint.json", "build-identity.json", "stage-results.json"];
export const axHash = value => createHash("sha256").update(value).digest("hex");
export function axInputIdentity(root = process.cwd()) {
  const files = ["test/fixtures/ax-refinement/manifest.json", "test/fixtures/ax-refinement/six-profiles.json", "test/fixtures/ax-refinement/catalogue-audit.json", "test/fixtures/ax-refinement/dev-corrections.json",
    "test/fixtures/matcher-experiments/manifest.json", "test/fixtures/matcher-experiments/anna-dev.json", "test/fixtures/matcher-experiments/anna-uat.json"];
  return files.map(file => ({ file, sha256: axHash(readFileSync(resolve(root, file))) }));
}
export function axExpectedIdentity(sourceSha256, releaseBaseCommit, root = process.cwd()) {
  return { sourceSha256, releaseBaseCommit, contractSha256: axHash(readFileSync(resolve(root, "contract/mcp/7.0.0/schema.json"))),
    inventorySha256: axHash(readFileSync(resolve(root, "test/ax-refinement/impact.json"))), inputSha256: axHash(JSON.stringify(axInputIdentity(root))) };
}
export function readAxValidationProof(file, expected) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  if (proof.version !== "dev-ax-refinement-1" || proof.environment !== "dev" || proof.contractVersion !== "7.0.0" ||
    proof.scope !== "dev_ax_refinement_and_direct_consumers" || proof.passed !== true || proof.unchangedSource !== true) throw new Error("Incomplete or non-DEV AX work-package proof");
  for (const field of ["sourceSha256", "releaseBaseCommit", "contractSha256", "inventorySha256", "inputSha256"]) {
    if (!expected[field] || proof[field] !== expected[field]) throw new Error(`AX proof identity changed: ${field}`);
  }
  if (!Array.isArray(proof.stages) || proof.stages.some(row => row.passed !== true) || AX_STAGES.some(label => proof.stages.filter(row => row.label === label && row.passed).length !== 1)) throw new Error("AX proof is missing a passing stage");
  if (!Array.isArray(proof.artifacts) || AX_ARTIFACTS.some(file => proof.artifacts.filter(row => row.file === file).length !== 1)) throw new Error("AX proof is missing required artifacts");
  const directory = realpathSync(dirname(resolve(file)));
  for (const row of proof.artifacts) {
    const path = realpathSync(resolve(directory, row.file));
    if (isAbsolute(row.file) || relative(directory, path).startsWith("..") || path === directory || axHash(readFileSync(path)) !== row.sha256) throw new Error(`AX proof artifact changed: ${row.file}`);
  }
  return proof;
}
