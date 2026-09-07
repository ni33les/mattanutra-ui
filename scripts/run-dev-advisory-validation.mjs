#!/usr/bin/env node
/** Full DEV candidate gate. Runs only against an explicitly isolated local database. */
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullTestInventory, sourceManifest } from "./run-full-test-suite.mjs";
import { mcpTestTarget } from "./mcp-test-target.mjs";
import { REQUIRED_VALIDATION_STAGES, VALIDATION_CLIENT_LOCALES, VALIDATION_CLIENT_DISCOVERY } from "./dev-validation-proof.mjs";

import { browserFixtureEnvironment } from "./browser-fixture-environment.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://127.0.0.1:3100";
const PRELOAD = join(ROOT, "test/helpers/offline-network.mjs");
const TS = ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs"];
const sha = value => createHash("sha256").update(value).digest("hex");
export function spawnValidationProcess(command, args, options) {
  return spawn(command, args, { ...options, detached: process.platform !== "win32" });
}
export function signalValidationProcess(child, signal = "SIGTERM", platform = process.platform) {
  if (!child?.pid) return false;
  try {
    // A stage may be an npm wrapper. Its coordinator must receive the signal
    // so its own handler can stop any separately detached test batch.
    return platform === "win32" ? child.kill(signal) : process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
export function isolatedValidationEnvironment(input = process.env) {
  let database;
  try { database = new URL(input.TEST_DB_URL); } catch { throw new Error("TEST_DB_URL must identify the pre-seeded isolated PostgreSQL database."); }
  if (database.hostname !== "127.0.0.1" || database.search || database.hash || !/^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/.test(database.pathname) || !database.port || ["5432", "3000", "80", "443"].includes(database.port) || !["postgres:", "postgresql:"].includes(database.protocol) || input.DB_URL !== input.TEST_DB_URL || (input.MATTANUTRA_ENV && input.MATTANUTRA_ENV !== "dev")) throw new Error("Validation requires DEV and equal DB_URL/TEST_DB_URL on an isolated numeric localhost PostgreSQL port/database.");
  const env = { ...input };
  for (const key of Object.keys(env)) if (/(STRIPE|SMTP|SENDGRID|MAILGUN|RESEND|SES_|GROK|ANTHROPIC|XAI|TWILIO|LINE_CHANNEL|SLACK|(?:^|_)API_KEY$)/i.test(key)) env[key] = "";
  Object.assign(env, {
    MATTANUTRA_ENV: "dev", DB_ALLOW_DIRECT_CONNECTION: "true", DB_URL: input.TEST_DB_URL, DB_WORKER_URL: input.TEST_DB_URL,
    DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1", DB_POOL_IDLE_TIMEOUT_SECONDS: "1",
    MCP_URL: `${ORIGIN}/api/mcp`, MCP_ISOLATED_CANDIDATE: "1", PLAYWRIGHT_BASE_URL: ORIGIN,
    NEXT_PUBLIC_SITE_URL: ORIGIN, SITE_URL: ORIGIN, PORT: "3100", HOSTNAME: "127.0.0.1",
    STRIPE_PAYMENT_MODE: "mock", AGENTIC_PAYMENT_PROVIDER: "mock", TH_RETAILER_ADAPTER: "mock_thailand",
    STRIPE_SECRET_KEY: "", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "",
    GROK_API_KEY: "", ANTHROPIC_API_KEY: "", XAI_API_KEY: "",
    INTERNAL_QA_HARNESS: "true", AGENTIC_CAPABILITY_KEY: `fixture-${randomBytes(32).toString("hex")}`,
    ADMIN_SESSION_SECRET: `fixture-${randomBytes(32).toString("hex")}`,
    MCP_QA_TOKEN: `fixture-${randomBytes(32).toString("hex")}`, WRITE_MATCHER_BASELINE: "0",
    NODE_OPTIONS: `--max-old-space-size=2300 --import=${PRELOAD}`, NEXT_TELEMETRY_DISABLED: "1"
  });
  mcpTestTarget(env);
  return env;
}
export function validationClientMatrix() {
  return VALIDATION_CLIENT_DISCOVERY.flatMap(discovery => ["a", "b"].flatMap(runId => VALIDATION_CLIENT_LOCALES.map(locale => ({ runId, locale, discovery }))));
}
export function releaseLintInputs(root = ROOT, baseRef = process.env.DEV_ADVISORY_BASE_COMMIT) {
  if (baseRef?.startsWith("-") || baseRef && !/^[a-zA-Z0-9_./-]+$/.test(baseRef)) throw new Error("Invalid release base reference");
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const baseCommit = baseRef ? git(["rev-parse", "--verify", `${baseRef}^{commit}`]) : git(["merge-base", "HEAD", "origin/dev"]);
  if (!/^[a-f0-9]{40}$/.test(baseCommit)) throw new Error("A concrete release base is required");
  git(["merge-base", "--is-ancestor", baseCommit, "HEAD"]);
  const files = [...new Set([...git(["diff", "--name-only", "-z", baseCommit]).split("\0"),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")])]
    .filter(file => file && existsSync(join(root, file)) && /\.(?:cjs|js|mjs|ts|tsx)$/.test(file)).sort();
  return { baseCommit, headCommit: git(["rev-parse", "HEAD"]), files, sha256: sha(JSON.stringify(files)) };
}
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
function hashFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = join(prefix, entry.name), path = join(directory, entry.name);
    return entry.isDirectory() ? hashFiles(path, name) : entry.isFile() ? [{ file: name, sha256: sha(readFileSync(path)) }] : [];
  });
}
async function assertPortFree() {
  const server = createServer();
  await new Promise((done, reject) => { server.once("error", reject); server.listen(3100, "127.0.0.1", done); });
  await new Promise(done => server.close(done));
}
async function rpc(endpoint, name, arguments_, env) {
  const request = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: arguments_ } };
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${env.MCP_QA_TOKEN}`, "x-mattanutra-qa-audience": "mattanutra-dev-qa" }, body: JSON.stringify(request), signal: AbortSignal.timeout(30_000) });
  const body = await response.json();
  const result = body.result?.structuredContent ?? body.result;
  if (!response.ok || body.error || body.result?.isError || !result?.ok) throw new Error(`${name} fixture call failed: ${JSON.stringify(body)}`);
  return { request, response: body, result };
}
async function main() {
  if (process.argv.length > 2) throw new Error("Usage: npm run validate:dev:advisory (configure TEST_DB_URL, DB_URL and optional DEV_ADVISORY_EVIDENCE_DIR).");
  process.chdir(ROOT);
  const env = isolatedValidationEnvironment();
  const evidence = resolve(process.env.DEV_ADVISORY_EVIDENCE_DIR ?? `/tmp/mattanutra-dev-advisory-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`);
  if (!(relative(ROOT, evidence) === ".." || relative(ROOT, evidence).startsWith("../"))) throw new Error("Evidence must be outside the source checkout so source identity cannot be changed by report writes.");
  if (existsSync(evidence)) throw new Error("Evidence directory must be new; previous results are immutable.");
  mkdirSync(dirname(evidence), { recursive: true }); mkdirSync(evidence, { mode: 0o700 });
  const steps = [];
  let candidate, candidateExit, candidateError, candidateLog, active, interrupted = false, before, buildId, schemaChecksum, failure, releaseLint, dataBefore, dataAfter, inventory;
  const interrupt = () => { interrupted = true; signalValidationProcess(active); signalValidationProcess(candidate); };
  process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
  async function run(label, command, args, stageEnv = env, required = true) {
    if (interrupted) throw new Error("Validation interrupted.");
    const startedAt = new Date().toISOString();
    const log = createWriteStream(join(evidence, `${label}.log`), { flags: "wx", mode: 0o600 });
    console.log(`Validation: ${label}`);
    active = spawnValidationProcess(command, args, { cwd: ROOT, env: stageEnv, stdio: ["ignore", "pipe", "pipe"] });
    active.stdout.pipe(log, { end: false }); active.stderr.pipe(log, { end: false });
    const status = await new Promise(done => { active.once("error", error => done({ code: null, error: error.message })); active.once("close", (code, signal) => done({ code, signal })); });
    active = null; await new Promise(done => log.end(done));
    const step = { label, command, args, startedAt, finishedAt: new Date().toISOString(), ...status, passed: status.code === 0 && !interrupted };
    steps.push(step); console.log(JSON.stringify(step));
    if (!step.passed && required) throw new Error(`${label} failed; inspect ${label}.log.`);
    return step;
  }
  async function waitForCandidate() {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && !interrupted) {
      if (candidateError || candidate.exitCode !== null || candidate.signalCode !== null) throw new Error(candidateError?.message ?? "Candidate exited before readiness.");
      try {
        const probe = await rpc(`${ORIGIN}/api/mcp`, "info", {}, env);
        if (probe.result.buildId !== buildId || probe.result.contractVersion !== "6.0.0") throw new Error("Candidate identity differs from the built source.");
        schemaChecksum = probe.result.schemaChecksum;
        writeJson(join(evidence, "candidate-identity.json"), probe);
        return;
      } catch (error) { if (/identity differs/.test(error.message)) throw error; }
      await new Promise(done => setTimeout(done, 1000));
    }
    throw new Error("Candidate readiness deadline expired.");
  }
  try {
    await assertPortFree();
    await run("prepare-assets", "python3", ["scripts/extract-ttf-ws1.py", "--verify"]);
    before = sourceManifest(); buildId = before.sha256.slice(0, 40); env.AGENTIC_BUILD_ID = buildId;
    writeJson(join(evidence, "source-before.json"), before);
    releaseLint = releaseLintInputs();
    writeJson(join(evidence, "release-lint.json"), releaseLint);
    const discovered = fullTestInventory();
    inventory = { ...discovered, sha256: sha(JSON.stringify(discovered)) };
    writeJson(join(evidence, "test-inventory.json"), inventory);
    await run("administration-schema", process.execPath, [...TS, "scripts/apply-product-administration-schema.ts"]);
    await run("web-schema", process.execPath, [...TS, "scripts/apply-web-funnel-schema.ts"]);
    await run("agentic-schema", process.execPath, [...TS, "scripts/apply-agentic-commerce-schema.ts"]);
    await run("matcher-runtime-schema", process.execPath, [...TS, "scripts/apply-matcher-v5-runtime-schema.ts"]);
    await run("reference-integrity-schema", process.execPath, [...TS, "scripts/apply-supplement-safety-reference-integrity-schema.ts"]);
    await run("demand-cache-schema", process.execPath, [...TS, "scripts/apply-product-coverage-demand-cache-schema.ts"]);
    await run("runtime-schema", process.execPath, [...TS, "scripts/verify-dev-runtime-schema.ts"]);
    await run("public-catalogue-fixtures", process.execPath, ["scripts/seed-matcher-public-fixtures.mjs", join(evidence, "public-catalogue-fixtures.json")]);
    await run("typecheck", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"],
      { ...env, NODE_OPTIONS: env.NODE_OPTIONS.replace("--max-old-space-size=2300", "--max-old-space-size=1500") }, false);
    // Pass the complete release diff explicitly, including previously committed slices.
    await run("changed-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...(releaseLint.files.length ? releaseLint.files : ["scripts/run-dev-advisory-validation.mjs"])], env, false);
    await run("production-build", process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], { ...env, NODE_ENV: "production", NODE_OPTIONS: "--max-old-space-size=2300", NEXT_BUILD_CPUS: "1", NEXT_BUILD_SKIP_TYPECHECK: "1" });
    const built = JSON.parse(readFileSync(join(ROOT, ".next/required-server-files.json"), "utf8"));
    if (built.config?.env?.AGENTIC_BUILD_ID !== buildId) throw new Error("Production build did not bake the validated source identity.");
    writeJson(join(evidence, "build-identity.json"), { buildId, nextBuildId: readFileSync(join(ROOT, ".next/BUILD_ID"), "utf8").trim(), requiredServerFilesSha256: sha(JSON.stringify(built)) });
    candidateLog = createWriteStream(join(evidence, "candidate.log"), { flags: "wx", mode: 0o600 });
    candidate = spawnValidationProcess(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: ROOT, env: { ...env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    candidateExit = new Promise(done => { candidate.once("exit", done); candidate.once("error", error => { candidateError = error; done(); }); });
    candidate.stdout.pipe(candidateLog, { end: false }); candidate.stderr.pipe(candidateLog, { end: false });
    await waitForCandidate();
    const fixturePath = join(evidence, "browser-fixtures.json");
    await run("browser-fixtures", process.execPath, [...TS, "scripts/seed-browser-fixtures.ts", fixturePath]);
    const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
    Object.assign(env, browserFixtureEnvironment(fixtures, ORIGIN));
    await run("data-fingerprints-before", process.execPath, ["scripts/validation-data-fingerprints.mjs", join(evidence, "data-before.json")]);
    dataBefore = JSON.parse(readFileSync(join(evidence, "data-before.json"), "utf8"));
    await run("test-full", "npm", ["run", "test:full"], { ...env, FULL_TEST_EVIDENCE_DIR: join(evidence, "full-suite") }, false);
    await run("matcher-two-runs", process.execPath, ["scripts/run-mcp-matcher-pack-twice.mjs"], { ...env, NODE_ENV: "test", MCP_ACCEPTANCE_EVIDENCE_DIR: join(evidence, "matcher") }, false);
    await run("documented-client-rate-window", process.execPath, ["scripts/published-client-pacing.mjs", "--clear-window"]);
    for (const { runId, locale, discovery } of validationClientMatrix()) {
      const journey = `${runId}-${locale}${discovery === "tools_only" ? "-tools" : ""}`;
      const clientDir = join(evidence, `client-${journey}`), resumeDir = join(evidence, `client-${journey}-paid`);
      await run(`docs-client-${journey}`, process.execPath, ["scripts/run-published-mcp-client.mjs", "--discovery", discovery, "--locale", locale, "--url", `${ORIGIN}/api/mcp`, "--output", clientDir]);
      const receiptPath = join(clientDir, "receipt.json"), receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (receipt.endpoint !== `${ORIGIN}/api/mcp` || receipt.locale !== locale || !receipt.checkout?.orderHandle) throw new Error("Client receipt is not an isolated candidate order.");
      await run(`fixture-settlement-${journey}`, process.execPath, [...TS, "scripts/settle-local-mcp-client-fixture.ts", receiptPath, join(evidence, `fixture-settlement-${journey}.json`)]);
      await run(`docs-client-${journey}-paid`, process.execPath, ["scripts/run-published-mcp-client.mjs", "--discovery", discovery, "--locale", locale, "--url", `${ORIGIN}/api/mcp`, "--resume", receiptPath, "--output", resumeDir]);
      const paid = JSON.parse(readFileSync(join(resumeDir, "receipt.json"), "utf8"));
      if (paid.order?.paymentStatus !== "paid" || paid.order?.fulfilment?.status !== "delivered" || paid.order?.terminal !== true) throw new Error("Public tracking did not confirm the fixture payment and delivery.");
    }
    const comparisons = VALIDATION_CLIENT_DISCOVERY.flatMap(discovery => VALIDATION_CLIENT_LOCALES.flatMap(locale => ["", "-paid"].map(suffix => ({ locale, discovery, phase: suffix || "checkout", identical: readFileSync(join(evidence, `client-a-${locale}${discovery === "tools_only" ? "-tools" : ""}${suffix}/semantic.json`), "utf8") === readFileSync(join(evidence, `client-b-${locale}${discovery === "tools_only" ? "-tools" : ""}${suffix}/semantic.json`), "utf8") }))));
    writeJson(join(evidence, "client-comparison.json"), { passed: comparisons.every(item => item.identical), comparisons, normalization: "Only declared identities/clocks/latency fields; complete intermediate transcripts are compared." });
    steps.push({ label: "documented-client-non-latency-equality", passed: comparisons.every(item => item.identical) });
    for (const [name, path] of [["full-suite-results", "full-suite/results.json"], ["matcher-results", "matcher/results.json"]]) {
      const results = JSON.parse(readFileSync(join(evidence, path), "utf8"));
      steps.push({ label: name, passed: results.passed === true && results.unchangedSource === true && results.sourceSha256 === before.sha256 && (name !== "matcher-results" || results.identicalNonLatency === true) });
    }
    await run("data-fingerprints-after", process.execPath, ["scripts/validation-data-fingerprints.mjs", join(evidence, "data-after.json")]);
    dataAfter = JSON.parse(readFileSync(join(evidence, "data-after.json"), "utf8"));
    steps.push({ label: "unchanged-schema-and-catalogue", passed: dataBefore.schemaSha256 === dataAfter.schemaSha256 && dataBefore.catalogueSha256 === dataAfter.catalogueSha256 });
  } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  finally {
    if (candidate && candidate.exitCode === null && candidate.signalCode === null) {
      signalValidationProcess(candidate);
      await Promise.race([candidateExit, new Promise(done => setTimeout(done, 5000))]);
      if (candidate.exitCode === null && candidate.signalCode === null) { signalValidationProcess(candidate, "SIGKILL"); await candidateExit; }
    }
    if (candidateLog) await new Promise(done => candidateLog.end(done));
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
    let after;
    try { after = sourceManifest(); } catch (error) { failure ??= `Unable to verify final source: ${error.message}`; }
    writeJson(join(evidence, "source-after.json"), after ?? { error: failure });
    const unchangedSource = Boolean(before && before.sha256 === after?.sha256);
    const passed = !failure && !interrupted && unchangedSource && REQUIRED_VALIDATION_STAGES.every(label => steps.filter(step => step.label === label && step.passed).length === 1) && steps.every(step => step.passed);
    writeJson(join(evidence, "stage-results.json"), { passed, failure: failure ?? null, interrupted, steps });
    const attestation = { version: "dev-advisory-validation-3", contractVersion: "6.0.0", releaseBaseCommit: releaseLint?.baseCommit ?? null, releaseLintSha256: releaseLint?.sha256 ?? null, testInventorySha256: inventory?.sha256 ?? null, databaseSchemaSha256: dataBefore?.schemaSha256 ?? null, catalogueSha256: dataBefore?.catalogueSha256 ?? null, environment: "dev", candidateOrigin: ORIGIN, sourceSha256: before?.sha256 ?? null, buildId: buildId ?? null, schemaChecksum: schemaChecksum ?? null, gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), unchangedSource, passed, finishedAt: new Date().toISOString(), steps, failure: failure ?? null, artifacts: hashFiles(evidence) };
    writeJson(join(evidence, "attestation.json"), attestation);
    console.log(JSON.stringify({ passed, evidence, attestation: join(evidence, "attestation.json"), failure: failure ?? null }));
    if (!passed) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
