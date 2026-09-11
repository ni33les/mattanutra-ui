import assert from "node:assert/strict";
import { it } from "node:test";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";

const database = "postgresql://nobody@127.0.0.1:55436/mattanutra_lock_review";
const valid = { DB_URL: database, TEST_DB_URL: database, MATTANUTRA_ENV: "dev" };
it("isolates candidate provider settings while permitting the explicit disposable database", () => {
  const env = isolatedValidationEnvironment({ ...valid, STRIPE_SECRET_KEY: "live-fixture-must-be-cleared", SMTP_PASS: "must-be-cleared", UNSUPPORTED_PROVIDER_API_KEY: "must-be-cleared", NODE_OPTIONS: "--require unsafe-provider-hook" });
  assert.equal(env.DB_URL, database);
  assert.equal(env.DB_WORKER_URL, database);
  assert.equal(env.DB_ALLOW_DIRECT_CONNECTION, "true");
  assert.equal(env.MCP_URL, "http://127.0.0.1:3100/api/mcp");
  assert.equal(env.AGENTIC_PAYMENT_PROVIDER, "mock");
  assert.equal(env.TH_RETAILER_ADAPTER, "mock_thailand");
  assert.equal(env.STRIPE_SECRET_KEY, "");
  assert.equal(env.SMTP_PASS, "");
  assert.equal(env.UNSUPPORTED_PROVIDER_API_KEY, "");
  assert.match(env.NODE_OPTIONS, /offline-network\.mjs/);
  assert.doesNotMatch(env.NODE_OPTIONS, /unsafe-provider-hook/);
  assert.match(env.AGENTIC_CAPABILITY_KEY, /^fixture-[a-f0-9]{64}$/);
  assert.match(env.ADMIN_SESSION_SECRET, /^fixture-[a-f0-9]{64}$/);
});
it("rejects remote, ordinary local, mismatched and non-DEV database configurations", () => {
  for (const url of ["postgresql://db.example.test:55436/mattanutra_lock_review", "postgresql://127.0.0.1:5432/mattanutra_lock_review", "postgresql://127.0.0.1:55436/mattanutra", "postgresql://localhost:55436/mattanutra_lock_review", "https://127.0.0.1:55436/mattanutra_lock_review", "postgresql://127.0.0.1:55436/mattanutra_lock_review?host=remote.example.test"]) assert.throws(() => isolatedValidationEnvironment({ ...valid, DB_URL: url, TEST_DB_URL: url }), /isolated/);
  assert.throws(() => isolatedValidationEnvironment({ ...valid, DB_URL: `${database}_other` }), /equal/);
  for (const environment of ["uat", "prd", "production"]) assert.throws(() => isolatedValidationEnvironment({ ...valid, MATTANUTRA_ENV: environment }), /DEV/);
});

it("V5-GATE-01 requires both complete documented journeys in English, Thai and Chinese", async () => {
  const { validationClientMatrix } = await import("../scripts/run-dev-advisory-validation.mjs");
  assert.deepEqual(validationClientMatrix().filter((row: { discovery: string }) => row.discovery === "resources").map((row: { runId: string; locale: string }) => `${row.runId}:${row.locale}`), ["a:en", "a:th", "a:zh-CN", "b:en", "b:th", "b:zh-CN"]);
  const { REQUIRED_VALIDATION_STAGES } = await import("../scripts/dev-validation-proof.mjs");
  for (const row of validationClientMatrix()) for (const stage of [`docs-client-${row.runId}-${row.locale}`, `docs-client-${row.runId}-${row.locale}-paid`, `fixture-settlement-${row.runId}-${row.locale}`]) assert.ok(REQUIRED_VALIDATION_STAGES.includes(stage), stage);
});

it("ANNA-GATE-01 adds tools-only journeys without omitting native resource journeys", async () => {
  const { validationClientMatrix } = await import("../scripts/run-dev-advisory-validation.mjs");
  const matrix = validationClientMatrix() as Array<{ runId: string; locale: string; discovery: string }>;
  assert.equal(matrix.length, 12);
  for (const discovery of ["resources", "tools_only"]) for (const runId of ["a", "b"]) for (const locale of ["en", "th", "zh-CN"]) {
    assert.equal(matrix.filter(row => row.discovery === discovery && row.runId === runId && row.locale === locale).length, 1);
  }
});

it("V5-GATE-02 release lint covers committed slices and current edits relative to the recorded base", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { releaseLintInputs } = await import("../scripts/run-dev-advisory-validation.mjs");
  const root = mkdtempSync(join(tmpdir(), "matcher-release-lint-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    writeFileSync(join(root, "first.ts"), "export const one = 1;\n"); git("add", "."); git("commit", "-qm", "baseline");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "first.ts"), "export const one = 2;\n"); git("add", "."); git("commit", "-qm", "committed slice");
    writeFileSync(join(root, "second.mjs"), "export const two = 2;\n");
    const result = releaseLintInputs(root, base);
    assert.equal(result.baseCommit, base);
    assert.deepEqual(result.files, ["first.ts", "second.mjs"]);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => releaseLintInputs(root, "--all"), /release base/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("V5-GATE-03 fingerprints preserve dose, price and provenance while ignoring row/key order", async () => {
  const { canonicalFingerprintRows } = await import("../scripts/validation-data-fingerprints.mjs");
  const first = [{ id: "p", amount: 100, price: 250, administration: { route: "oral", doseIncrement: 1 } }, { id: "q", amount: 50 }];
  const reordered = [{ amount: 50, id: "q" }, { administration: { doseIncrement: 1, route: "oral" }, price: 250, amount: 100, id: "p" }];
  assert.deepEqual(canonicalFingerprintRows(first), canonicalFingerprintRows(reordered));
  for (const changed of [{ ...first[0], amount: 101 }, { ...first[0], price: 251 }, { ...first[0], administration: { route: "topical", doseIncrement: 1 } }]) assert.notDeepEqual(canonicalFingerprintRows(first), canonicalFingerprintRows([changed, first[1]]));
});

it("V5-GATE-04 requires the existing demand-cache schema before full runtime verification", async () => {
  const { REQUIRED_VALIDATION_STAGES } = await import("../scripts/dev-validation-proof.mjs");
  assert.ok(REQUIRED_VALIDATION_STAGES.includes("demand-cache-schema"));
  assert.ok(REQUIRED_VALIDATION_STAGES.indexOf("demand-cache-schema") < REQUIRED_VALIDATION_STAGES.indexOf("runtime-schema"));
});

it("V5-GATE-05 cancelling a wrapped stage stops its coordinator and detached batch without later mutations", { timeout: 20000 }, async () => {
  const { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { setTimeout: delay } = await import("node:timers/promises");
  const { spawnValidationProcess, signalValidationProcess } = await import("../scripts/run-dev-advisory-validation.mjs");
  const directory = mkdtempSync(join(tmpdir(), "matcher-gate-cancel-"));
  const coordinator = join(directory, "coordinator.mjs"), worker = join(directory, "worker.mjs");
  const wrapper = join(directory, "wrapper.mjs"), mutations = join(directory, "mutations.txt");
  const done = join(directory, "coordinator-done.json"), nextMutation = join(directory, "unexpected-next.txt");
  const fullSuite = new URL("../scripts/run-full-test-suite.mjs", import.meta.url).href;
  writeFileSync(worker, `import { appendFileSync, writeFileSync } from "node:fs";
    writeFileSync(process.argv[3], String(process.pid));
    appendFileSync(process.argv[2], "tick\\n");
    setInterval(() => appendFileSync(process.argv[2], "tick\\n"), 20);
  `);
  writeFileSync(coordinator, `import { writeFileSync } from "node:fs";
    import { runBatch } from ${JSON.stringify(fullSuite)};
    writeFileSync(process.argv[2], String(process.pid));
    const first = await runBatch("fixture-batch", [process.argv[3], process.argv[4], process.argv[5]], process.env, process.argv[6]);
    const next = await runBatch("fixture-next", [process.argv[3], process.argv[7], process.argv[5]], process.env, process.argv[6]);
    process.on("exit", () => writeFileSync(process.argv[8], JSON.stringify({ first, next })));
  `);
  writeFileSync(wrapper, `import { spawn } from "node:child_process";
    const child = spawn(process.execPath, process.argv.slice(2), { stdio: "inherit" });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
  `);
  const coordinatorPidFile = join(directory, "coordinator.pid"), workerPidFile = join(directory, "worker.pid");
  const stage = spawnValidationProcess(process.execPath,
    [wrapper, coordinator, coordinatorPidFile, worker, mutations, workerPidFile, directory, nextMutation, done],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  stage.stdout.resume(); stage.stderr.resume();
  const closed = new Promise(resolve => stage.once("close", resolve));
  async function eventually(condition: () => boolean, message: string) {
    const deadline = Date.now() + 5000;
    while (!condition() && Date.now() < deadline) await delay(10);
    assert.ok(condition(), message);
  }
  try {
    await eventually(() => existsSync(workerPidFile) && existsSync(mutations), "The detached batch must actually start before cancellation");
    signalValidationProcess(stage);
    await eventually(() => existsSync(done), "Cancellation must reach the coordinator so its own handler stops the detached batch");
    await closed;
    const result = JSON.parse(readFileSync(done, "utf8"));
    assert.equal(result.first.signal, "SIGTERM");
    assert.equal(result.first.passed, false);
    assert.equal(result.next.interrupted, true);
    assert.equal(result.next.passed, false);
    const stopped = readFileSync(mutations, "utf8");
    assert.ok(stopped.length > 0, "The worker must perform real fixture work before cancellation");
    await delay(100);
    assert.equal(readFileSync(mutations, "utf8"), stopped, "No detached worker mutation may occur after cancellation completes");
    assert.equal(existsSync(nextMutation), false, "The interrupted coordinator must not launch another stage");
  } finally {
    for (const file of [coordinatorPidFile, workerPidFile]) {
      if (existsSync(file)) try { process.kill(Number(readFileSync(file, "utf8")), "SIGTERM"); } catch { /* fixture already exited */ }
    }
    stage.kill("SIGTERM");
    await Promise.race([closed, delay(1000)]);
    rmSync(directory, { recursive: true, force: true });
  }
});

it("V5-GATE-06 cancellation handles an unstarted stage and uses direct child signals on Windows", async () => {
  const { signalValidationProcess } = await import("../scripts/run-dev-advisory-validation.mjs");
  const signals: string[] = [];
  const child = { pid: 123, kill(signal: string) { signals.push(signal); return true; } };
  assert.equal(signalValidationProcess(undefined), false);
  assert.equal(signalValidationProcess(child, "SIGTERM", "win32"), true);
  assert.equal(signalValidationProcess(child, "SIGKILL", "win32"), true);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

it("FULL-CYCLE-02 readiness and attestation identify the current published contract", async () => {
  const validation = await import("../scripts/run-dev-advisory-validation.mjs");
  const identity = (validation as unknown as { validationContractIdentity: () => { contractVersion: string; schemaChecksum: string } }).validationContractIdentity;
  assert.equal(typeof identity, "function");
  const expected = JSON.parse((await import("node:fs")).readFileSync("contract/mcp/11.0.0/tools.json", "utf8"));
  assert.deepEqual(identity(), { contractVersion: expected.contractVersion, schemaChecksum: expected.schemaChecksum });
});
