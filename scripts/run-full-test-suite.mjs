#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recursiveTestFiles, matcherTestInventory, unclassifiedMatcherConsumers } from "./matcher-test-inventory.mjs";
import { nodeExecutionProof, browserExecutionProof, testSourceHygiene } from "./test-execution-proof.mjs";
export { nodeExecutionProof, browserExecutionProof, testSourceHygiene };

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function fullTestInventory(root = ROOT) {
  const node = recursiveTestFiles(root);
  const browser = recursiveTestFiles(root, "test/e2e", ".spec.ts");
  const matcher = matcherTestInventory(node);
  return { node, browser, integration: node.filter(file => file.endsWith(".integration.test.ts")),
    mcp: matcher.files, matcherGroups: matcher.groups };
}

export function sourceManifest() {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\0").filter(Boolean).filter(file => existsSync(join(ROOT, file))).sort();
  const rows = files.map(file => ({ file, sha256: createHash("sha256").update(readFileSync(join(ROOT, file))).digest("hex") }));
  return { files: rows, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}

export function isolatedDatabasePreflight(env) {
  const failures = [];
  let database;
  try { database = new URL(env.TEST_DB_URL); } catch { /* diagnostic below */ }
  if (database?.hostname !== "127.0.0.1" || !/^\/mattanutra_lock_review[a-zA-Z0-9_]*$/.test(database.pathname) ||
      !["postgres:", "postgresql:"].includes(database.protocol) || !database.port || ["80", "443", "3000", "5432"].includes(database.port) || database.search || database.hash) failures.push("TEST_DB_URL must identify the isolated localhost test database");
  if (!env.DB_URL || env.DB_URL !== env.TEST_DB_URL) failures.push("DB_URL must equal TEST_DB_URL; full validation uses the isolated catalogue");
  if (env.DB_WORKER_URL && env.DB_WORKER_URL !== env.TEST_DB_URL) failures.push("DB_WORKER_URL must equal TEST_DB_URL when supplied");
  return failures;
}

export function fullTestPreflight(env, inventory = fullTestInventory()) {
  const failures = isolatedDatabasePreflight(env);
  let app;
  try { app = new URL(env.PLAYWRIGHT_BASE_URL); } catch { /* diagnostic below */ }
  if (app?.origin !== "http://127.0.0.1:3100" || app.username || app.password || app.pathname !== "/" || app.search || app.hash) failures.push("PLAYWRIGHT_BASE_URL must identify the isolated localhost application on port 3100");
  for (const key of ["REVEAL_VISUAL_SMOKE_URL", "MOBILE_UX_CHECKOUT_URL", "MOBILE_UX_ORDER_URL"]) {
    if (!env[key]) failures.push(`${key} must identify a seeded browser fixture`);
    else {
      try { if (new URL(env[key], app).origin !== app?.origin) failures.push(`${key} must use the isolated application`); }
      catch { failures.push(`${key} is not a valid fixture URL`); }
    }
  }
  if (!inventory.node.length || !inventory.browser.length || !inventory.integration.length) failures.push("Full test discovery unexpectedly omitted a suite");
  for (const file of [...inventory.node, ...inventory.browser]) {
    failures.push(...testSourceHygiene(readFileSync(join(ROOT, file), "utf8"), file));
  }
  failures.push(...unclassifiedMatcherConsumers(ROOT, inventory.node, inventory.mcp).map(file => `Unclassified matcher consumer: ${file}`));
  return failures;
}

let interruptedSignal = null;
export async function runBatch(label, args, env, evidence) {
  if (interruptedSignal) return { label, passed: false, interrupted: true, signal: interruptedSignal };
  if (label.startsWith("node-")) args = ["--test-reporter=tap", "--test-reporter-destination=stdout",
    "--test-reporter=./scripts/test-semantic-reporter.mjs", `--test-reporter-destination=${join(evidence, `${label}-events.jsonl`)}`, ...args];
  const output = createWriteStream(join(evidence, `${label}.log`), { flags: "wx", mode: 0o600 });
  const startedAt = new Date().toISOString();
  let tail = "";
  const child = spawn(process.execPath, args, { cwd: ROOT, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  const interrupt = signal => {
    interruptedSignal = signal;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, signal); } catch { /* child may already have exited */ }
  };
  const onTerm = () => interrupt("SIGTERM"), onInt = () => interrupt("SIGINT");
  process.once("SIGTERM", onTerm); process.once("SIGINT", onInt);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    output.write(chunk); tail = (tail + chunk.toString()).slice(-100_000);
  });
  const status = await new Promise(resolve => {
    child.once("error", error => resolve({ code: null, error: error.message }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.removeListener("SIGTERM", onTerm); process.removeListener("SIGINT", onInt);
  await new Promise(resolve => output.end(resolve));
  const skipped = label.startsWith("node-") ? Number(/# skipped (\d+)/.exec(tail)?.[1] ?? 0) : null;
  const todo = label.startsWith("node-") ? Number(/# todo (\d+)/.exec(tail)?.[1] ?? 0) : null;
  const tests = label.startsWith("node-") ? Number(/# tests (\d+)/.exec(tail)?.[1] ?? 0) : null;
  const cancelled = label.startsWith("node-") ? Number(/# cancelled (\d+)/.exec(tail)?.[1] ?? 0) : null;
  let execution = null;
  if (label.startsWith("node-")) {
    try {
      const events = readFileSync(join(evidence, `${label}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(row => JSON.parse(row));
      execution = nodeExecutionProof(args.filter(arg => arg.endsWith(".test.ts")), events);
      if (execution.cases !== tests) { execution.passed = false; execution.failures.push(`TAP case count ${tests} differs from semantic events ${execution.cases}`); }
    } catch (error) { execution = { passed: false, failures: [error.message] }; }
  }
  const passed = status.code === 0 && (tests == null || tests > 0) && !skipped && !todo && !cancelled && (execution?.passed ?? true);
  const result = { label, args, startedAt, finishedAt: new Date().toISOString(), ...status, tests, skipped, todo, cancelled, execution, passed };
  console.log(JSON.stringify(result));
  return result;
}

async function main() {
  process.chdir(ROOT);
  const inventory = fullTestInventory();
  if (process.argv.includes("--list")) { console.log(JSON.stringify(inventory, null, 2)); return; }
  const problems = fullTestPreflight(process.env, inventory);
  if (problems.length) throw new Error(problems.join("\n"));
  const evidence = resolve(process.env.FULL_TEST_EVIDENCE_DIR ?? `/tmp/mattanutra-full-suite-${Date.now()}`);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "inventory.json"), JSON.stringify(inventory, null, 2), { flag: "wx" });
  const before = sourceManifest();
  writeFileSync(join(evidence, "source-before.json"), JSON.stringify(before, null, 2), { flag: "wx" });
  const common = { ...process.env, DB_WORKER_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", NODE_ENV: "test", DB_POOL_IDLE_TIMEOUT_SECONDS: "1" };
  const nodeArgs = ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs"];
  const results = [];
  results.push(await runBatch("node-application", [...nodeArgs, ...inventory.node.filter(file => !inventory.integration.includes(file))],
    { ...common, DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1" }, evidence));
  results.push(await runBatch("node-postgres", [...nodeArgs, ...inventory.integration],
    { ...common, DB_URL: common.TEST_DB_URL, DB_POOL_MAX: "6", DB_WORKER_POOL_MAX: "6" }, evidence));
  results.push(await runBatch("node-mcp-replay", [...nodeArgs, ...inventory.mcp.filter(file => !inventory.integration.includes(file))],
    { ...common, DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1" }, evidence));
  const mcpIntegration = inventory.mcp.filter(file => inventory.integration.includes(file));
  if (mcpIntegration.length) results.push(await runBatch("node-mcp-postgres-replay", [...nodeArgs, ...mcpIntegration],
    { ...common, DB_POOL_MAX: "6", DB_WORKER_POOL_MAX: "6" }, evidence));
  const readEvents = name => readFileSync(join(evidence, `${name}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(row => JSON.parse(row));
  const canonical = rows => rows.filter(row => inventory.mcp.includes(row.file))
    .map(row => JSON.stringify(row)).sort();
  let mcpComparison;
  try {
    const first = canonical([...readEvents("node-application"), ...readEvents("node-postgres")]);
    const second = canonical([...readEvents("node-mcp-replay"), ...(mcpIntegration.length ? readEvents("node-mcp-postgres-replay") : [])]);
    const represented = new Set(second.map(row => JSON.parse(row).file));
    mcpComparison = { label: "all-mcp-non-latency-results", firstResults: first.length, secondResults: second.length,
      files: represented.size, passed: first.length > 0 && inventory.mcp.every(file => represented.has(file)) && JSON.stringify(first) === JSON.stringify(second) };
    writeFileSync(join(evidence, "mcp-canonical-a.json"), JSON.stringify(first.map(row => JSON.parse(row)), null, 2), { flag: "wx" });
    writeFileSync(join(evidence, "mcp-canonical-b.json"), JSON.stringify(second.map(row => JSON.parse(row)), null, 2), { flag: "wx" });
  } catch (error) { mcpComparison = { label: "all-mcp-non-latency-results", passed: false, error: error.message }; }
  results.push(mcpComparison);
  // PostgreSQL cases may advance catalogue epochs while creating/removing their
  // own rows. Generate current browser matches after those cases have finished.
  results.push(await runBatch("browser-fixtures-refresh", ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/seed-browser-fixtures.ts", join(evidence, "browser-fixtures-refreshed.json")], common, evidence));
  const browserEnv = { ...common };
  try {
    const fixtures = JSON.parse(readFileSync(join(evidence, "browser-fixtures-refreshed.json"), "utf8"));
    for (const key of ["REVEAL_VISUAL_SMOKE_URL", "MOBILE_UX_REVEAL_URL", "MOBILE_UX_CHECKOUT_URL", "MOBILE_UX_ORDER_URL"]) {
      if (!fixtures[key] || new URL(fixtures[key]).origin !== new URL(common.PLAYWRIGHT_BASE_URL).origin) throw new Error(`Invalid refreshed browser fixture: ${key}`);
      browserEnv[key] = fixtures[key];
    }
  } catch (error) { results.push({ label: "browser-fixture-identity", passed: false, error: error.message }); }
  results.push(await runBatch("browser-discovery", ["node_modules/@playwright/test/cli.js", "test", "--list", "--reporter=json"],
    { ...browserEnv, CI: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: join(evidence, "browser-discovery.json") }, evidence));
  results.push(await runBatch("browser", ["--import", "./test/helpers/offline-network.mjs", "node_modules/@playwright/test/cli.js", "test", "--workers=1", "--retries=0", "--reporter=json"],
    { ...browserEnv, DB_URL: common.TEST_DB_URL, CI: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: join(evidence, "browser.json") }, evidence));
  const browser = results.at(-1);
  try {
    const report = JSON.parse(readFileSync(join(evidence, "browser.json"), "utf8"));
    const discovery = JSON.parse(readFileSync(join(evidence, "browser-discovery.json"), "utf8"));
    browser.execution = browserExecutionProof(inventory.browser, discovery, report);
    browser.passed = browser.passed && browser.execution.passed;
    browser.stats = report.stats;
  } catch (error) { browser.passed = false; browser.reportError = error.message; }
  const after = sourceManifest();
  writeFileSync(join(evidence, "source-after.json"), JSON.stringify(after, null, 2), { flag: "wx" });
  const unchangedSource = before.sha256 === after.sha256;
  const passed = unchangedSource && results.every(result => result.passed);
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ inventory, results, unchangedSource, sourceSha256: before.sha256, passed }, null, 2), { flag: "wx" });
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
