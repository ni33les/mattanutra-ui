import { createHash } from "node:crypto";
import { readFileSync, realpathSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const PAYLOAD_STAGES = ["isolated-schema-a", "isolated-schema-b", "scoped-tests-a", "scoped-tests-b", "semantic-equality", "typecheck", "release-diff-lint", "production-build", "unchanged-source-and-inputs"];
export const PAYLOAD_ARTIFACTS = ["source-before.json", "source-after.json", "inventory.json", "inputs.json", "test-results-a.json", "test-results-b.json", "semantic-comparison.json", "release-lint.json", "build-identity.json", "stage-results.json", "report.json"];
export const payloadHash = value => createHash("sha256").update(value).digest("hex");
export function payloadInputIdentity(root = process.cwd()) {
  const files = ["test/fixtures/mcp-payload/manifest.json", "test/fixtures/mcp-payload/baseline.json.gz", "test/fixtures/mcp-payload/journeys-manifest.json", "test/fixtures/mcp-payload/journeys.json.gz",
    "test/fixtures/ax-refinement/six-profiles.json", "test/fixtures/ax-refinement/dev-corrections.json", "test/fixtures/matcher-experiments/anna-dev.json"];
  return files.map(file => ({ file, sha256: payloadHash(readFileSync(resolve(root, file))) }));
}
export function payloadExpectedIdentity(sourceSha256, releaseBaseCommit, root = process.cwd()) {
  const { contractVersion } = JSON.parse(readFileSync(resolve(root, "public/.well-known/mcp.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(contractVersion)) throw new Error("Invalid published contract version");
  return { sourceSha256, releaseBaseCommit, contractVersion, contractSha256: payloadHash(readFileSync(resolve(root, `contract/mcp/${contractVersion}/schema.json`))),
    inventorySha256: payloadHash(readFileSync(resolve(root, "test/mcp-payload/impact.json"))), inputSha256: payloadHash(JSON.stringify(payloadInputIdentity(root))) };
}
export function readPayloadProof(file, expected) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  if (proof.version !== "dev-mcp-payload-1" || proof.environment !== "dev" ||
    proof.scope !== "mcp_payload_and_direct_readers" || proof.passed !== true || proof.unchangedSource !== true) throw new Error("Incomplete or non-DEV MCP payload work-package proof");
  for (const field of ["sourceSha256", "releaseBaseCommit", "contractVersion", "contractSha256", "inventorySha256", "inputSha256"]) {
    if (!expected[field] || proof[field] !== expected[field]) throw new Error(`MCP payload proof identity changed: ${field}`);
  }
  if (!Array.isArray(proof.stages) || proof.stages.some(row => row.passed !== true) || PAYLOAD_STAGES.some(label => proof.stages.filter(row => row.label === label && row.passed).length !== 1)) throw new Error("MCP payload proof is missing a passing stage");
  if (!Array.isArray(proof.artifacts) || PAYLOAD_ARTIFACTS.some(file => proof.artifacts.filter(row => row.file === file).length !== 1)) throw new Error("MCP payload proof is missing required artifacts");
  const directory = realpathSync(dirname(resolve(file)));
  for (const row of proof.artifacts) {
    const path = realpathSync(resolve(directory, row.file));
    if (isAbsolute(row.file) || relative(directory, path).startsWith("..") || path === directory || payloadHash(readFileSync(path)) !== row.sha256) throw new Error(`MCP payload proof artifact changed: ${row.file}`);
  }
  const json = name => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
  for (const name of ["source-before.json", "source-after.json"]) if (json(name).sha256 !== expected.sourceSha256) throw new Error("MCP payload source artifact identity changed");
  for (const name of ["test-results-a.json", "test-results-b.json"]) {
    const result = json(name);
    if (result.passed !== true || result.unchangedSource !== true || result.sourceSha256 !== expected.sourceSha256 || result.missingIds?.length !== 0 ||
      result.execution?.passed !== true || !(result.execution.cases > 0) || !(result.execution.files > 0) || result.execution.failures?.length !== 0) throw new Error(`MCP payload execution evidence is incomplete: ${name}`);
  }
  const inventory = json("inventory.json");
  if (!Array.isArray(inventory.files) || !inventory.files.length) throw new Error("MCP payload inventory is empty");
  const expectedCases = inventory.files.reduce((sum, row) => sum + row.expectedCases, 0);
  for (const name of ["test-results-a.json", "test-results-b.json"]) {
    const result = json(name);
    if (result.execution.files !== inventory.files.length || result.execution.cases !== expectedCases) throw new Error("MCP payload execution does not cover the complete inventory");
  }
  const comparisons = json("semantic-comparison.json");
  if (comparisons.passed !== true || comparisons.comparisons?.length !== 18 || new Set(comparisons.comparisons.map(row => row.file)).size !== 18 || comparisons.comparisons.some(row => row.identical !== true)) throw new Error("MCP payload paired semantic comparison is incomplete");
  const report = json("report.json");
  if (report.rows?.length !== 18 || report.rows.some(row => !(row.wholeReduction >= .6) || !(row.responseReduction >= .6))) throw new Error("MCP payload size evidence is incomplete or below the agreed target");
  if (json("stage-results.json").passed !== true) throw new Error("MCP payload stage evidence did not pass");
  return proof;
}

export function compiledBuildIdentity(root = ".next") {
  const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter(row => row.isFile() || row.isSymbolicLink())
    .map(row => relative(root, resolve(row.parentPath, row.name))).filter(file => !file.startsWith("cache/") && !file.startsWith("trace") && !file.startsWith("diagnostics/"))
    .sort();
  if (!files.includes("BUILD_ID")) throw new Error("Compiled build is incomplete");
  return payloadHash(JSON.stringify(files.map(file => {
    const path = resolve(root, file);
    let link; try { link = readlinkSync(path); } catch { /* ordinary artifact */ }
    return { file, sha256: payloadHash(link ?? readFileSync(path)) };
  })));
}
