#!/usr/bin/env node
/** Scoped DEV gate. Importing this module never starts tests. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBatch, sourceManifest } from "./run-full-test-suite.mjs";
import { nodeExecutionProof } from "./test-execution-proof.mjs";
import { experimentHygiene } from "./run-matcher-experiment-tests.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FAMILIES = { REL: 5, ALT: 3, DATA: 3, NOP: 2, ADV: 3, TERM: 2, SPEC: 2, REG: 3, HYG: 2, SRCH: 6, DEPLOY: 2 };
export const REQUIRED_AX_IDS = Object.entries(FAMILIES).flatMap(([family, count]) => Array.from({ length: count }, (_, i) => `AXR-${family}-${String(i + 1).padStart(2, "0")}`));
const hash = value => createHash("sha256").update(value).digest("hex");

export function validateImpact(impact) {
  assert.equal(impact.version, "ax-refinement-impact-1");
  assert.equal(impact.scope, "dev_ax_refinement_and_direct_consumers");
  assert.equal(impact.fullSuite, "deferred_by_explicit_user_scope");
  assert.deepEqual(impact.requirements.map(row => row.id).sort(), [...REQUIRED_AX_IDS].sort(), "The requirement inventory changed");
  const files = impact.files.map(row => row.file);
  assert.equal(new Set(files).size, files.length, "Duplicate test files");
  for (const row of impact.files) {
    assert.match(row.file, /^test\/[\w./-]+\.test\.ts$/);
    assert.ok(!row.file.includes(".."));
    assert.ok(row.reason?.length > 30, "Every selected test needs an impact reason");
  }
  for (const row of impact.requirements) assert.ok(files.includes(row.file), `Unmapped requirement ${row.id}`);
  return impact;
}

export function validateSelection(selected, executed) {
  assert.deepEqual([...executed].sort(), [...selected].sort(), "Selected and executed test files differ");
}

/** No broad identity stripping or array sorting: callers normalize only their
 * explicitly declared protocol metadata before this canonical comparison. */
export function semanticValue(value) {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, semanticValue(value[key])]));
  return value;
}

export async function main(args = process.argv.slice(2)) {
  let slice, output, list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--slice") slice = args[++i];
    else if (args[i] === "--output") output = args[++i];
    else if (args[i] === "--list") list = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const impact = validateImpact(JSON.parse(readFileSync(resolve(ROOT, "test/ax-refinement/impact.json"), "utf8")));
  if (list) { console.log(JSON.stringify(impact, null, 2)); return impact; }
  const selected = impact.files.filter(row => !slice || row.slice === slice);
  assert.ok(selected.length, `No tests declared for ${slice}`);
  const files = selected.map(row => row.file);
  for (const file of files) assert.ok(existsSync(resolve(ROOT, file)), `Required test not implemented: ${file}`);
  const hygiene = files.flatMap(file => experimentHygiene(readFileSync(resolve(ROOT, file), "utf8"), file));
  assert.deepEqual(hygiene, [], hygiene.join("\n"));
  if (selected.some(row => row.database)) {
    assert.ok(process.env.TEST_DB_URL, "Scoped database tests require an isolated TEST_DB_URL; never skip them");
    const db = new URL(process.env.TEST_DB_URL);
    assert.equal(db.hostname, "127.0.0.1");
    assert.match(db.pathname, /^\/mattanutra_lock_review[_-]/);
    assert.ok(db.port && db.port !== "5432", "Use a dedicated PostgreSQL port");
  }
  const evidence = resolve(output ?? `/tmp/mattanutra-ax-${Date.now()}`);
  const local = relative(ROOT, evidence);
  assert.ok(isAbsolute(evidence) && local.startsWith(".."), "Evidence must be outside the checkout");
  assert.ok(!existsSync(evidence), "Evidence directory must be new");
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const save = (name, data) => writeFileSync(resolve(evidence, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const before = sourceManifest();
  save("source-before.json", before); save("inventory.json", { ...impact, selected: files, sha256: hash(JSON.stringify(impact)) });
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  Object.assign(env, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", AGENTIC_PAYMENT_PROVIDER: "mock", NODE_OPTIONS: "--max-old-space-size=2300", AX_REFINEMENT_EVIDENCE_DIR: evidence });
  if (process.env.TEST_DB_URL) Object.assign(env, { TEST_DB_URL: process.env.TEST_DB_URL, DB_URL: process.env.TEST_DB_URL, DB_WORKER_URL: process.env.TEST_DB_URL, DB_POOL_MAX: "2" });
  const result = await runBatch("node-ax", ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", ...files], env, evidence);
  const events = readFileSync(resolve(evidence, "node-ax-events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const execution = nodeExecutionProof(files, events);
  const names = events.filter(event => event.passed === true && !event.skip && !event.todo).map(event => event.name ?? "");
  const missingIds = impact.requirements.filter(row => files.includes(row.file) && !names.some(name => name.includes(row.id))).map(row => row.id);
  const after = sourceManifest();
  save("source-after.json", after);
  const proof = { version: "ax-refinement-test-proof-1", scope: impact.scope, slice: slice ?? "complete_package", sourceSha256: before.sha256, unchangedSource: before.sha256 === after.sha256, execution, missingIds, result,
    passed: result.passed && execution.passed && missingIds.length === 0 && before.sha256 === after.sha256 };
  save("results.json", proof);
  console.log(JSON.stringify({ evidence, passed: proof.passed, cases: execution.cases, missingIds }));
  if (!proof.passed) process.exitCode = 1;
  return proof;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
