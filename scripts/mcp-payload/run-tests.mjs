import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBatch, sourceManifest } from "../run-full-test-suite.mjs";
import { experimentHygiene } from "../run-matcher-experiment-tests.mjs";
import { nodeExecutionProof } from "../test-execution-proof.mjs";
import { validateInventory } from "./measure.mjs";
export const RELEASE_BASE = "23b4e4cd7c2838af09a6aa8555d36f9402e08158";
export function impactInventory() {
  const impact = JSON.parse(readFileSync("test/mcp-payload/impact.json", "utf8"));
  assert.equal(impact.releaseBase, RELEASE_BASE); assert.equal(impact.scope, "mcp_payload_and_direct_readers");
  const declared = impact.files.map(row => row.file);
  const discovered = ["test/mcp-payload", "test/mcp-agent-surface"].flatMap(directory =>
    readdirSync(directory, { recursive: true }).filter(file => file.endsWith(".test.ts")).map(file => `${directory}/${file}`));
  for (const file of discovered) assert.ok(declared.includes(file), `Undeclared scoped test: ${file}`);
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", RELEASE_BASE, "--", "test"], { encoding: "utf8" }).trim().split("\n").filter(file => file.endsWith(".test.ts"));
  for (const file of changed) assert.ok(declared.includes(file), `Changed test omitted from scope: ${file}`);
  for (const file of declared) assert.ok(existsSync(file), `Missing test: ${file}`);
  validateInventory(impact.files, declared, impact.files.flatMap(row => row.cases));
  return impact;
}
export async function main(args = process.argv.slice(2)) {
  let slice, output, list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--slice") slice = args[++i]; else if (args[i] === "--output") output = args[++i]; else if (args[i] === "--list") list = true; else throw new Error(`Unknown argument ${args[i]}`);
  }
  const impact = impactInventory();
  if (list) { console.log(JSON.stringify(impact, null, 2)); return; }
  const selected = impact.files.filter(row => !slice || row.slice === slice); assert.ok(selected.length, "Empty scoped selection");
  const files = selected.map(row => row.file);
  const hygiene = files.flatMap(file => experimentHygiene(readFileSync(file, "utf8"), file)); assert.deepEqual(hygiene, []);
  if (selected.some(row => row.database)) {
    assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is required, never skipped");
    const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55439"); assert.match(url.pathname, /^\/mattanutra_lock_review_payload_/);
  }
  const evidence = resolve(output ?? `/tmp/mcp-payload-${Date.now()}`);
  assert.ok(isAbsolute(evidence) && relative(process.cwd(), evidence).startsWith("..") && !existsSync(evidence));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const save = (name, value) => writeFileSync(resolve(evidence, name), JSON.stringify(value, null, 2), { flag: "wx" });
  const before = sourceManifest(); save("source-before.json", before); save("inventory.json", { ...impact, selected: files });
  const safe = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  Object.assign(safe, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", AGENTIC_PAYMENT_PROVIDER: "mock", NODE_OPTIONS: "--max-old-space-size=2300", MCP_PAYLOAD_EVIDENCE_DIR: evidence });
  const runs = [], events = [];
  for (const database of [false, true]) {
    const group = selected.filter(row => Boolean(row.database) === database).map(row => row.file); if (!group.length) continue;
    const label = database ? "node-postgres" : "node-memory", env = database ? { ...safe, TEST_DB_URL: process.env.TEST_DB_URL, DB_URL: process.env.TEST_DB_URL, DB_WORKER_URL: process.env.TEST_DB_URL, DB_POOL_MAX: "2" } : safe;
    runs.push(await runBatch(label, ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", ...group], env, evidence));
    events.push(...readFileSync(resolve(evidence, `${label}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
  }
  const execution = nodeExecutionProof(files, events), missingIds = [];
  for (const row of selected) {
    const actual = events.filter(event => event.file === row.file && event.type !== "suite");
    if (actual.length !== row.expectedCases) missingIds.push(`${row.file}: expected ${row.expectedCases}, executed ${actual.length}`);
    for (const id of row.cases) if (!actual.some(event => event.passed && event.name.includes(id))) missingIds.push(id);
  }
  const after = sourceManifest(); save("source-after.json", after);
  const proof = { scope: impact.scope, sourceSha256: before.sha256, unchangedSource: before.sha256 === after.sha256, execution, missingIds, runs,
    passed: runs.every(row => row.passed) && execution.passed && !missingIds.length && before.sha256 === after.sha256 };
  save("results.json", proof); console.log(JSON.stringify({ evidence, passed: proof.passed, cases: execution.cases, missingIds }));
  if (!proof.passed) process.exitCode = 1;
  return proof;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
