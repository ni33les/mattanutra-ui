#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullTestInventory, isolatedDatabasePreflight, runBatch, sourceManifest, testSourceHygiene } from "./run-full-test-suite.mjs";
import { unclassifiedMatcherConsumers } from "./matcher-test-inventory.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Complete maintained MCP + matcher consumer gate; no browser server/build needed. */
async function main() {
  process.chdir(ROOT);
  const all = fullTestInventory();
  const inventory = { version: 1, groups: all.matcherGroups, files: all.mcp, integration: all.mcp.filter(file => all.integration.includes(file)) };
  if (process.argv.includes("--list")) { console.log(JSON.stringify(inventory, null, 2)); return; }
  const problems = isolatedDatabasePreflight(process.env);
  if (!inventory.files.length || !inventory.integration.length || Object.values(inventory.groups).some(files => !files.length)) problems.push("Matcher inventory unexpectedly omitted a subsystem");
  problems.push(...unclassifiedMatcherConsumers(ROOT, all.node, inventory.files).map(file => `Unclassified matcher consumer: ${file}`));
  for (const file of inventory.files) problems.push(...testSourceHygiene(readFileSync(join(ROOT, file), "utf8"), file));
  if (problems.length) throw new Error(problems.join("\n"));
  const evidence = resolve(process.env.MATCHER_TEST_EVIDENCE_DIR ?? `/tmp/mattanutra-matcher-suite-${Date.now()}`);
  if (evidence === ROOT || evidence.startsWith(`${ROOT}/`)) throw new Error("Matcher evidence must be outside the checkout");
  mkdirSync(evidence, { recursive: true });
  const before = sourceManifest();
  const inventorySha256 = createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
  for (const [name, data] of [["inventory", { ...inventory, sha256: inventorySha256 }], ["source-before", before]]) writeFileSync(join(evidence, `${name}.json`), JSON.stringify(data, null, 2), { flag: "wx" });
  const common = { ...process.env, DB_URL: process.env.TEST_DB_URL, DB_WORKER_URL: process.env.TEST_DB_URL,
    MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", NODE_ENV: "test", DB_POOL_IDLE_TIMEOUT_SECONDS: "1" };
  const args = ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs"];
  const results = [];
  const runs = process.argv.includes("--twice") ? ["a", "b"] : ["a"];
  for (const run of runs) {
    results.push(await runBatch(`node-matcher-${run}`, [...args, ...inventory.files.filter(file => !inventory.integration.includes(file))],
      { ...common, DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1" }, evidence));
    results.push(await runBatch(`node-matcher-postgres-${run}`, [...args, ...inventory.integration],
      { ...common, DB_POOL_MAX: "6", DB_WORKER_POOL_MAX: "6" }, evidence));
  }
  let identicalNonLatency = null;
  if (runs.length === 2) {
    const canonical = run => ["node-matcher", "node-matcher-postgres"].flatMap(batch => readFileSync(join(evidence, `${batch}-${run}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.stringify(JSON.parse(line)))).sort();
    const a = canonical("a"), b = canonical("b");
    identicalNonLatency = JSON.stringify(a) === JSON.stringify(b);
    for (const [run, data] of [["a", a], ["b", b]]) writeFileSync(join(evidence, `canonical-${run}.json`), JSON.stringify(data.map(row => JSON.parse(row)), null, 2), { flag: "wx" });
  }
  const after = sourceManifest(), unchangedSource = before.sha256 === after.sha256;
  writeFileSync(join(evidence, "source-after.json"), JSON.stringify(after, null, 2), { flag: "wx" });
  const result = { results, sourceSha256: before.sha256, inventorySha256, unchangedSource, identicalNonLatency,
    passed: unchangedSource && identicalNonLatency !== false && results.every(row => row.passed) };
  writeFileSync(join(evidence, "results.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ evidence, passed: result.passed, unchangedSource, identicalNonLatency }));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
