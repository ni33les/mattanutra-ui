#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloneIsolatedDatabase, fullTestInventory, isolatedDatabasePreflight, runBatch, runNodePair, sourceManifest, testSourceHygiene } from "./run-full-test-suite.mjs";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";
import { normalizePublishedClientResult } from "./published-client-semantics.mjs";
import { unclassifiedMatcherConsumers } from "./matcher-test-inventory.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function startHttpCandidate(env, evidence) {
  // The HTTP application is a separate runtime. Inheriting node:test's marker
  // would activate in-process catalogue stubs instead of the isolated DB reader.
  const applicationEnv = { ...env };
  delete applicationEnv.NODE_TEST_CONTEXT;
  // This loopback adapter models the production reverse proxy. Individual
  // test processes have stable client IPs; public rate limits remain unchanged.
  applicationEnv.TRUST_PROXY = "1";
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

export async function runMatcherBatches({ common, evidence, inventory, args, runs, environments = {},
  start = startHttpCandidate, batch = runBatch }) {
  const results = [];
  for (const run of runs) {
    results.push(...await runNodePair({ common: environments[run] ?? common, evidence, args,
      files: inventory.files, integration: inventory.integration,
      unitLabel: `node-matcher-${run}`, postgresLabel: `node-matcher-postgres-${run}`,
      httpLabel: `http-${run}`, start, batch }));
  }
  return results;
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
  // This is the file/container ceiling. Named journey, operation and D3
  // deadlines remain stricter; 18 serialized locale journeys exceed five minutes.
  const args = ["--test", "--test-timeout=600000", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs"];
  const prerequisites = await runBatch("catalogue-prerequisites", ["scripts/matcher-fixture-prerequisites.mjs", join(evidence, "catalogue-prerequisites.json")], common, evidence);
  if (!prerequisites.passed) throw new Error("Maintained MCP catalogue/reference prerequisites are incomplete; inspect catalogue-prerequisites.log");
  const fixture = await runBatch("public-catalogue-fixtures", ["scripts/seed-matcher-public-fixtures.mjs", join(evidence, "public-catalogue-fixtures.json")], common, evidence);
  if (!fixture.passed) throw new Error("Public matcher fixture preparation failed");
  const fingerprints = await runBatch("catalogue-inputs", ["scripts/validation-data-fingerprints.mjs", join(evidence, "catalogue-inputs.json")], common, evidence);
  if (!fingerprints.passed) throw new Error("Frozen catalogue/schema fingerprint evidence is missing");
  const runs = process.argv.includes("--twice") ? ["a", "b"] : ["a"];
  const environments = {}, initialInputs = {}, preparations = [];
  // Both clones are created from the same prepared state before either run starts.
  for (const run of runs) {
    const database = await cloneIsolatedDatabase(common.TEST_DB_URL, `${evidence}:${run}`);
    const semanticOutput = join(evidence, `semantic-${run}`);
    mkdirSync(semanticOutput, { recursive: true });
    environments[run] = { ...common, TEST_DB_URL: database, DB_URL: database, DB_WORKER_URL: database,
      MCP_EVIDENCE_IMAGES_OUTPUT: semanticOutput, "MCP_simple-plan_EVIDENCE_DIR": semanticOutput };
    const fingerprint = await runBatch(`initial-inputs-${run}`, ["scripts/validation-data-fingerprints.mjs", join(evidence, `initial-inputs-${run}.json`)], environments[run], evidence);
    preparations.push(fingerprint);
    if (!fingerprint.passed) throw new Error(`Missing independent initial state: ${run}`);
    const data = JSON.parse(readFileSync(join(evidence, `initial-inputs-${run}.json`), "utf8"));
    initialInputs[run] = { database: new URL(database).pathname, schemaSha256: data.schemaSha256, catalogueSha256: data.catalogueSha256 };
  }
  if (runs.length === 2 && (initialInputs.a.database === initialInputs.b.database ||
      initialInputs.a.schemaSha256 !== initialInputs.b.schemaSha256 || initialInputs.a.catalogueSha256 !== initialInputs.b.catalogueSha256)) throw new Error("Acceptance runs do not have independent identical initial inputs");
  writeFileSync(join(evidence, "independent-initial-state.json"), JSON.stringify(initialInputs, null, 2), { flag: "wx" });
  const results = [prerequisites, fixture, fingerprints, ...preparations,
    ...await runMatcherBatches({ common, environments, evidence, inventory, args, runs })];
  let identicalNonLatency = null;
  if (runs.length === 2) {
    const canonical = run => ["node-matcher", "node-matcher-postgres"].flatMap(batch => readFileSync(join(evidence, `${batch}-${run}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.stringify(JSON.parse(line)))).sort();
    const a = canonical("a"), b = canonical("b");
    identicalNonLatency = JSON.stringify(a) === JSON.stringify(b);
    for (const [run, data] of [["a", a], ["b", b]]) writeFileSync(join(evidence, `canonical-${run}.json`), JSON.stringify(data.map(row => JSON.parse(row)), null, 2), { flag: "wx" });
  }
  // Test outcomes alone are not business-semantic evidence. Require full stored
  // real-catalogue and documented-client payloads, with the existing normalizer.
  const semanticFiles = ["real-plan-journey.json", "documented-inventory-run.json"];
  let semanticComparison;
  try {
    const semantic = Object.fromEntries(runs.map(run => [run, semanticFiles.map(file => ({ file,
      result: normalizePublishedClientResult(JSON.parse(readFileSync(join(evidence, `semantic-${run}`, file), "utf8"))) }))]));
    semanticComparison = { files: semanticFiles, runs: runs.length, passed: runs.length === 1 || JSON.stringify(semantic.a) === JSON.stringify(semantic.b) };
    for (const run of runs) writeFileSync(join(evidence, `business-canonical-${run}.json`), JSON.stringify(semantic[run], null, 2), { flag: "wx" });
  } catch (error) { semanticComparison = { files: semanticFiles, runs: runs.length, passed: false, error: error.message }; }
  const after = sourceManifest(), unchangedSource = before.sha256 === after.sha256;
  writeFileSync(join(evidence, "source-after.json"), JSON.stringify(after, null, 2), { flag: "wx" });
  const result = { results, sourceCommit, sourceSha256: before.sha256, inventorySha256, unchangedSource, identicalNonLatency, semanticComparison, initialInputs,
    passed: unchangedSource && semanticComparison.passed && identicalNonLatency !== false && results.every(row => row.passed) };
  writeFileSync(join(evidence, "results.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ evidence, passed: result.passed, unchangedSource, identicalNonLatency }));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
