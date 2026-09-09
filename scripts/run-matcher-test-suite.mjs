#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullTestInventory, isolatedDatabasePreflight, runBatch, sourceManifest, testSourceHygiene } from "./run-full-test-suite.mjs";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";
import { unclassifiedMatcherConsumers } from "./matcher-test-inventory.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function startHttpCandidate(env, evidence) {
  // The HTTP application is a separate runtime. Inheriting node:test's marker
  // would activate in-process catalogue stubs instead of the isolated DB reader.
  const applicationEnv = { ...env };
  delete applicationEnv.NODE_TEST_CONTEXT;
  const log = createWriteStream(join(evidence, "mcp-http.log"), { flags: "wx", mode: 0o600 });
  const child = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./scripts/register-matcher-http-loader.mjs", "scripts/serve-matcher-test-http.ts"],
    { cwd: ROOT, env: applicationEnv, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", "ipc"] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  const closed = new Promise(done => child.once("close", done));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); } catch { /* already exited */ }
      await Promise.race([closed, new Promise(done => setTimeout(done, 5000))]);
      if (child.exitCode === null && child.signalCode === null) { try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* already exited */ } await closed; }
    }
    await new Promise(done => log.end(done));
  };
  try {
    const identity = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Local MCP route adapter readiness exceeded 60 seconds; inspect mcp-http.log")), 60_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Local MCP route adapter exited ${code}; inspect mcp-http.log`)); });
      child.once("message", message => { clearTimeout(timer); if (message?.ready) done(message); else reject(new Error("Invalid local MCP readiness message")); });
    });
    if (identity.buildId !== env.AGENTIC_BUILD_ID || !/^http:\/\/127\.0\.0\.1:\d+$/.test(identity.origin)) throw new Error("Local MCP adapter source/origin identity mismatch");
    writeFileSync(join(evidence, "mcp-http-identity.json"), JSON.stringify(identity, null, 2), { flag: "wx" });
    return { identity, stop };
  } catch (error) { await stop(); throw error; }
}

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
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const common = { ...isolatedValidationEnvironment(process.env), AGENTIC_BUILD_ID: sourceCommit, DB_URL: process.env.TEST_DB_URL, DB_WORKER_URL: process.env.TEST_DB_URL,
    MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", NODE_ENV: "test", DB_POOL_IDLE_TIMEOUT_SECONDS: "1" };
  const args = ["--test", "--test-timeout=300000", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs"];
  const prerequisites = await runBatch("catalogue-prerequisites", ["scripts/matcher-fixture-prerequisites.mjs", join(evidence, "catalogue-prerequisites.json")], common, evidence);
  if (!prerequisites.passed) throw new Error("Maintained MCP catalogue/reference prerequisites are incomplete; inspect catalogue-prerequisites.log");
  const fixture = await runBatch("public-catalogue-fixtures", ["scripts/seed-matcher-public-fixtures.mjs", join(evidence, "public-catalogue-fixtures.json")], common, evidence);
  if (!fixture.passed) throw new Error("Public matcher fixture preparation failed");
  const fingerprints = await runBatch("catalogue-inputs", ["scripts/validation-data-fingerprints.mjs", join(evidence, "catalogue-inputs.json")], common, evidence);
  if (!fingerprints.passed) throw new Error("Frozen catalogue/schema fingerprint evidence is missing");
  const server = await startHttpCandidate(common, evidence);
  common.MCP_URL = `${server.identity.origin}/api/mcp`;
  common.MCP_ISOLATED_CANDIDATE = "1";
  common.NEXT_PUBLIC_SITE_URL = server.identity.origin;
  common.SITE_URL = server.identity.origin;
  const results = [prerequisites, fixture, fingerprints];
  try {
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
  const result = { results, sourceCommit, sourceSha256: before.sha256, inventorySha256, unchangedSource, identicalNonLatency,
    passed: unchangedSource && identicalNonLatency !== false && results.every(row => row.passed) };
  writeFileSync(join(evidence, "results.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ evidence, passed: result.passed, unchangedSource, identicalNonLatency }));
  if (!result.passed) process.exitCode = 1;
  } finally { await server.stop(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
