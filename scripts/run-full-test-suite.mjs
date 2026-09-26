#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recursiveTestFiles, isNodeTestFile, matcherTestInventory, unclassifiedMatcherConsumers, SEMANTIC_REPLAY_FIXTURES, INDEPENDENT_NODE_TESTS } from "./matcher-test-inventory.mjs";
import { nodeExecutionProof, browserExecutionProof, mergeBrowserReports, testSourceHygiene } from "./test-execution-proof.mjs";
import { normalizePublishedClientResult } from "./published-client-semantics.mjs";
export { nodeExecutionProof, browserExecutionProof, testSourceHygiene };

import { browserFixtureEnvironment } from "./browser-fixture-environment.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function fullTestInventory(root = ROOT) {
  const node = recursiveTestFiles(root);
  const browser = recursiveTestFiles(root, "test/e2e", ".spec.ts");
  const matcher = matcherTestInventory(node);
  return { node, browser, integration: node.filter(file => file.includes(".integration.test.")),
    mcp: matcher.files, matcherGroups: matcher.groups,
    semanticReplay: SEMANTIC_REPLAY_FIXTURES.filter(row => node.includes(row.file)) };
}

/** Reuse the reviewed classic fallback inventory; every discovered file belongs to one mode. */
export function browserTestPartitions(files) {
  const classic = JSON.parse(readFileSync(join(ROOT, "test/pharmacy-reveal/impact.json"), "utf8")).classicBrowser;
  if (!Array.isArray(classic) || !classic.length || new Set(files).size !== files.length ||
      new Set(classic.map(row => row.file)).size !== classic.length ||
      classic.some(row => !files.includes(row.file) || !Number.isSafeInteger(row.expectedCases) || row.expectedCases <= 0 || !row.grep)) {
    throw new Error("Invalid or undiscovered classic browser inventory");
  }
  const standard = files.filter(file => !classic.some(row => row.file === file));
  if (!standard.length) throw new Error("Default browser inventory must remain nonempty");
  return { standard, classic };
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

/** Clone only the explicitly isolated database; never reuse a previous acceptance run. */
export async function cloneIsolatedDatabase(templateUrl, identity) {
  const failures = isolatedDatabasePreflight({ TEST_DB_URL: templateUrl, DB_URL: templateUrl });
  if (failures.length) throw new Error(failures.join("\n"));
  const { default: postgres } = await import("postgres");
  const url = new URL(templateUrl), adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.href, { max: 1, prepare: false });
  const name = `mattanutra_lock_review_ax_mcp_${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
  try { await admin.unsafe(`create database ${name} template ${url.pathname.slice(1)}`); }
  finally { await admin.end(); }
  url.pathname = `/${name}`;
  return url.href;
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
  if (label.startsWith("node-")) args = ["--experimental-test-module-mocks", "--test-reporter=tap", "--test-reporter-destination=stdout",
    "--test-reporter=./scripts/test-semantic-reporter.mjs", `--test-reporter-destination=${join(evidence, `${label}-events.jsonl`)}`,
    "--test-reporter=./scripts/test-timing-reporter.mjs", `--test-reporter-destination=${join(evidence, `${label}-timings.jsonl`)}`, ...args];
  const output = createWriteStream(join(evidence, `${label}.log`), { flags: "wx", mode: 0o600 });
  const startedAt = new Date().toISOString();
  const started = performance.now();
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
      execution = nodeExecutionProof(args.filter(isNodeTestFile), events);
      if (execution.cases !== tests) { execution.passed = false; execution.failures.push(`TAP case count ${tests} differs from semantic events ${execution.cases}`); }
    } catch (error) { execution = { passed: false, failures: [error.message] }; }
  }
  const passed = status.code === 0 && (tests == null || tests > 0) && !skipped && !todo && !cancelled && (execution?.passed ?? true);
  const result = { label, args, startedAt, finishedAt: new Date().toISOString(), timing: { elapsedMs: performance.now() - started }, ...status, tests, skipped, todo, cancelled, execution, passed };
  console.log(JSON.stringify(result));
  return result;
}

/** HTTP cases need a durable executor; controlled DB cases must own their leases exclusively. */
const batchInterrupted = result => Boolean(result.interrupted || result.signal);
export async function runNodePair({ common, evidence, args, files, integration,
  unitLabel, postgresLabel, httpLabel, start, batch = runBatch, independentFiles = [] }) {
  if (new Set(files).size !== files.length || new Set(integration).size !== integration.length || integration.some(file => !files.includes(file)) || new Set(independentFiles).size !== independentFiles.length ||
      independentFiles.some(file => !files.includes(file) || integration.includes(file))) throw new Error("Invalid or duplicate independent test ownership");
  const results = [];
  if (independentFiles.length) results.push(await batch(`${unitLabel}-independent`,
    [...args.filter(arg => !arg.startsWith("--test-concurrency=")), "--test-concurrency=2", ...independentFiles],
    { ...common, TEST_DB_URL: "", DB_URL: "", DB_WORKER_URL: "", MCP_URL: "" }, evidence));
  if (results.some(batchInterrupted)) return results;
  const shared = files.filter(file => !integration.includes(file) && !independentFiles.includes(file));
  if (shared.length) {
    const httpEvidence = join(evidence, httpLabel);
    mkdirSync(httpEvidence, { recursive: true });
    const server = await start(common, httpEvidence);
    try {
      results.push(await batch(unitLabel, [...args, ...shared],
        { ...common, MCP_URL: `${server.identity.origin}/api/mcp`, MCP_ISOLATED_CANDIDATE: "1",
          NEXT_PUBLIC_SITE_URL: server.identity.origin, SITE_URL: server.identity.origin,
          DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1" }, evidence));
    } finally { await server.stop(); }
  }
  if (results.some(batchInterrupted)) return results;
  if (integration.length) results.push(await batch(postgresLabel, [...args, ...integration],
    { ...common, DB_POOL_MAX: "6", DB_WORKER_POOL_MAX: "6" }, evidence));
  return results;
}

/** One canonical pass, then only the explicitly reviewed frozen semantic fixtures. */
export async function runCanonicalNodeSuite({ common, evidence, inventory, args, start, batch = runBatch, sourceSha256 = null }) {
  const fixtures = inventory.semanticReplay;
  if (JSON.stringify(fixtures) !== JSON.stringify(SEMANTIC_REPLAY_FIXTURES) ||
      fixtures.some(row => !inventory.node.includes(row.file))) throw new Error("Canonical execution requires the complete bounded semantic replay inventory");
  const fixtureInputs = () => [...new Set(fixtures.flatMap(row => row.inputs))].sort().map(file => ({ file,
    sha256: createHash("sha256").update(readFileSync(join(ROOT, file))).digest("hex") }));
  const initialInputs = fixtureInputs();
  const environment = (run, database) => {
    const output = join(evidence, `semantic-${run}`);
    mkdirSync(output, { recursive: true });
    return { ...common, ...(database ? {} : { TEST_DB_URL: "", DB_URL: "", DB_WORKER_URL: "", MCP_URL: "" }),
      MCP_EVIDENCE_IMAGES_OUTPUT: output, "MCP_simple-plan_EVIDENCE_DIR": output };
  };
  const canonical = await runNodePair({ common: environment("a", true), evidence, args,
    files: inventory.node, integration: inventory.integration,
    independentFiles: INDEPENDENT_NODE_TESTS.filter(file => inventory.node.includes(file)),
    unitLabel: "node-application", postgresLabel: "node-postgres", httpLabel: "http-application", start, batch });
  if (canonical.some(batchInterrupted)) {
    const semanticReplay = { version: "bounded-semantic-replay-1", sourceSha256, passed: false, interrupted: true };
    writeFileSync(join(evidence, "semantic-replay.json"), JSON.stringify(semanticReplay, null, 2), { flag: "wx" });
    return { results: [...canonical, { label: "bounded-semantic-replay", ...semanticReplay }], semanticReplay };
  }
  const replayFiles = fixtures.map(row => row.file);
  const replay = await batch("node-semantic-replay", [...args, ...replayFiles], environment("b", false), evidence);
  const readEvents = rows => rows.flatMap(row => readFileSync(join(evidence, `${row.label}-events.jsonl`), "utf8")
    .trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
  let semanticReplay;
  try {
    const first = readEvents(canonical).filter(row => replayFiles.includes(row.file)), second = readEvents([replay]);
    const canonicalEvents = events => events.map(row => JSON.stringify(row)).sort();
    const cases = fixtures.map(row => ({ file: row.file, expectedCases: row.expectedCases,
      canonicalCases: first.filter(event => event.file === row.file && event.type !== "suite").length,
      replayCases: second.filter(event => event.file === row.file && event.type !== "suite").length }));
    const comparisons = fixtures.map(row => {
      const normalized = run => normalizePublishedClientResult(JSON.parse(readFileSync(join(evidence, `semantic-${run}`, row.artifact), "utf8")));
      const a = normalized("a"), b = normalized("b");
      for (const [run, data] of [["a", a], ["b", b]]) writeFileSync(join(evidence, `semantic-${run}`, `canonical-${row.artifact}`), JSON.stringify(data, null, 2), { flag: "wx" });
      return { file: row.artifact, identical: JSON.stringify(a) === JSON.stringify(b) };
    });
    const identicalNonLatency = JSON.stringify(canonicalEvents(first)) === JSON.stringify(canonicalEvents(second));
    const unchangedInputs = JSON.stringify(initialInputs) === JSON.stringify(fixtureInputs());
    semanticReplay = { version: "bounded-semantic-replay-1", sourceSha256, canonicalFiles: inventory.node, fixtures,
      replayFiles, initialInputs, unchangedInputs, cases, comparisons, identicalNonLatency,
      independentState: { processes: "fresh-node-test-processes", stores: "frozen-memory-fixtures", databaseCredentials: false },
      passed: canonical.every(row => row.passed) && replay.passed && unchangedInputs && identicalNonLatency &&
        cases.every(row => row.canonicalCases === row.expectedCases && row.replayCases === row.expectedCases) && comparisons.every(row => row.identical) };
  } catch (error) { semanticReplay = { version: "bounded-semantic-replay-1", sourceSha256, passed: false, error: error.message }; }
  writeFileSync(join(evidence, "semantic-replay.json"), JSON.stringify(semanticReplay, null, 2), { flag: "wx" });
  return { results: [...canonical, replay, { label: "bounded-semantic-replay", ...semanticReplay }], semanticReplay };
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
  const nodeArgs = ["--test", "--test-timeout=600000", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./scripts/register-matcher-http-loader.mjs"];
  const { startHttpCandidate } = await import("./run-matcher-test-suite.mjs");
  const { results, semanticReplay } = await runCanonicalNodeSuite({ common, evidence, inventory, args: nodeArgs, start: startHttpCandidate, sourceSha256: before.sha256 });
  // PostgreSQL cases may advance catalogue epochs while creating/removing their
  // own rows. Generate current browser matches after those cases have finished.
  results.push(await runBatch("browser-fixtures-refresh", ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/seed-browser-fixtures.ts", join(evidence, "browser-fixtures-refreshed.json")], common, evidence));
  const browserEnv = { ...common };
  try {
    const fixtures = JSON.parse(readFileSync(join(evidence, "browser-fixtures-refreshed.json"), "utf8"));
    Object.assign(browserEnv, browserFixtureEnvironment(fixtures, new URL(common.PLAYWRIGHT_BASE_URL).origin));
  } catch (error) { results.push({ label: "browser-fixture-identity", passed: false, error: error.message }); }
  const browserModes = browserTestPartitions(inventory.browser);
  writeFileSync(join(evidence, "browser-mode-inventory.json"), JSON.stringify({
    discovered: inventory.browser, standard: browserModes.standard, classic: browserModes.classic,
    classicOrigin: "http://127.0.0.1:3101", classicFlags: { NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V6: "0", NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5: "0" }
  }, null, 2), { flag: "wx" });
  results.push(await runBatch("browser-discovery", ["node_modules/@playwright/test/cli.js", "test", ...browserModes.standard, "--list", "--reporter=json"],
    { ...browserEnv, CI: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: join(evidence, "browser-discovery.json") }, evidence));
  results.push(await runBatch("browser", ["--import", "./test/helpers/offline-network.mjs", "node_modules/@playwright/test/cli.js", "test", ...browserModes.standard, "--workers=1", "--retries=0", "--reporter=json"],
    { ...browserEnv, DB_URL: common.TEST_DB_URL, CI: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: join(evidence, "browser.json") }, evidence));
  const browser = results.at(-1);
  try {
    const report = JSON.parse(readFileSync(join(evidence, "browser.json"), "utf8"));
    const discovery = JSON.parse(readFileSync(join(evidence, "browser-discovery.json"), "utf8"));
    browser.execution = browserExecutionProof(browserModes.standard, discovery, report);
    browser.passed = browser.passed && browser.execution.passed;
    browser.stats = report.stats;
  } catch (error) { browser.passed = false; browser.reportError = error.message; }
  const classicOutput = join(evidence, "browser-classic"); mkdirSync(classicOutput);
  try {
    const { runEfficiencyBrowser } = await import("./service-efficiency/release-stages.mjs");
    // Full acceptance executes every case in each owned file, without a grep filter.
    const classic = await runEfficiencyBrowser(classicOutput, { ...browserEnv,
      NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V6: "0", NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5: "0"
    }, browserModes.classic.map(row => ({ ...row, grep: ".*" })), 3101);
    results.push({ label: "browser-classic", ...classic });
    const report = name => JSON.parse(readFileSync(join(evidence, name), "utf8"));
    const combinedReport = mergeBrowserReports([report("browser.json"), report("browser-classic/browser.json")]);
    browser.execution = browserExecutionProof(inventory.browser,
      mergeBrowserReports([report("browser-discovery.json"), report("browser-classic/browser-discovery.json")]), combinedReport);
    browser.stats = combinedReport.stats;
    browser.passed = browser.passed && classic.passed && browser.execution.passed;
  } catch (error) { results.push({ label: "browser-classic", passed: false, error: error.message }); }
  const after = sourceManifest();
  writeFileSync(join(evidence, "source-after.json"), JSON.stringify(after, null, 2), { flag: "wx" });
  const unchangedSource = before.sha256 === after.sha256;
  const passed = unchangedSource && results.every(result => result.passed);
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ inventory, results, semanticReplay, unchangedSource, sourceSha256: before.sha256, passed }, null, 2), { flag: "wx" });
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
