import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync } from "node:fs";
import { resolve, relative } from "node:path";
import { runBatch, sourceManifest } from "./run-full-test-suite.mjs";
import { testSourceHygiene, nodeExecutionProof } from "./test-execution-proof.mjs";
import { payloadHash, compiledBuildIdentity } from "./mcp-payload/proof.mjs";
import { MCP_PACKAGES, mcp721Identity, checkMcp721Proof } from "./mcp-721-proof.mjs";

const [mode, ...rawArgs] = process.argv.slice(2);
const packageId = rawArgs[0]?.startsWith("--package=") ? rawArgs[0].slice("--package=".length) : "721";
assert.ok(MCP_PACKAGES[packageId], "Unknown work package");
const args = rawArgs[0]?.startsWith("--package=") ? rawArgs.slice(1) : [...rawArgs];
const sliceIndex = args.indexOf("--slice");
const slice = sliceIndex < 0 ? null : args.splice(sliceIndex, 2)[1];
assert.ok(!slice || (mode === "test" && packageId === "efficiency"), "Slices are limited to efficiency development tests");
const definition = MCP_PACKAGES[packageId], MCP721_BASE = definition.base;
assert.ok(["test", "validate"].includes(mode));
const inventory = JSON.parse(readFileSync(`${definition.directory}/impact.json`, "utf8"));
if (slice) inventory.files = inventory.files.filter(row => row.slice === slice);
assert.equal(inventory.releaseBase, MCP721_BASE);
if (args.length === 1 && args[0] === "--list") { console.log(JSON.stringify(inventory, null, 2)); process.exit(0); }
assert.ok(args.length === 2 && args[0] === "--output" && args[1].startsWith("/"));
const output = resolve(args[1]); assert.ok(relative(process.cwd(), output).startsWith("..") && !existsSync(output));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD"), files = inventory.files.map(row => row.file);
assert.equal(new Set(files).size, files.length); assert.ok(files.length > 0);
const discovered = readdirSync(definition.directory, { recursive: true }).filter(file => file.endsWith(".test.ts")).map(file => `${definition.directory}/${file}`);
for (const file of discovered.filter(file => !slice || files.includes(file))) assert.ok(files.includes(file), `Undeclared package test ${file}`);
for (const file of (slice ? [] : git("diff", "--name-only", "--diff-filter=ACMR", MCP721_BASE, "--", "test").split("\n").filter(file => file.endsWith(".test.ts")))) assert.ok(files.includes(file), `Changed test omitted ${file}`);
for (const row of inventory.files) {
  assert.ok(row.reason.length > 20 && row.expectedCases > 0 && existsSync(row.file));
  assert.deepEqual(testSourceHygiene(readFileSync(row.file, "utf8"), row.file), []);
}
for (const row of inventory.browser ?? []) { assert.deepEqual(testSourceHygiene(readFileSync(row.file, "utf8"), row.file), []); assert.ok(row.expectedCases > 0 && row.reason); }
if (mode === "validate") { assert.equal(git("branch", "--show-current"), "dev"); assert.equal(git("status", "--porcelain"), ""); git("merge-base", "--is-ancestor", MCP721_BASE, commit); }
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const source = sourceManifest(); save("source-before.json", source); save("inventory.json", inventory);
const safe = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(safe, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", AGENTIC_BUILD_ID: commit, AGENTIC_PAYMENT_PROVIDER: "mock", STRIPE_PAYMENT_MODE: "mock",
  NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: "2", NODE_OPTIONS: "--max-old-space-size=6144", [`MCP_${packageId}_EVIDENCE_DIR`]: output });
const stages = [];
let isolated = null;
if (packageId === "efficiency" && mode === "validate") {
  const { prepareEfficiencyDatabase } = await import("./service-efficiency/release-stages.mjs");
  isolated = await prepareEfficiencyDatabase(process.env.TEST_DB_URL, output, safe);
  stages.push({ label: "isolated-schema", passed: true });
}
const events = [], batches = [];
for (const database of [false, true]) {
  const selected = inventory.files.filter(row => Boolean(row.database) === database).map(row => row.file);
  if (!selected.length) continue;
  const env = { ...safe }, label = database ? "node-database-tests" : "node-affected-tests";
  if (database) {
    assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is required; database cases never skip");
    const db = new URL(isolated?.TEST_DB_URL ?? process.env.TEST_DB_URL);
    assert.equal(db.hostname, "127.0.0.1"); assert.notEqual(db.port, "5432"); assert.ok(db.port);
    assert.match(db.pathname, /^\/mattanutra_lock_review_ax_/);
    Object.assign(env, { TEST_DB_URL: db.href, DB_URL: db.href, DB_WORKER_URL: db.href, DB_POOL_MAX: "3", DB_ALLOW_DIRECT_CONNECTION: "true" });
  }
  batches.push(await runBatch(label, ["--test", "--test-concurrency=1", "--experimental-strip-types", ...(!database ? ["--import", "./test/helpers/offline-network.mjs"] : []), "--import", "./scripts/register-ts-path-loader.mjs", ...selected], env, output));
  events.push(...readFileSync(resolve(output, `${label}-events.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
}
const result = { passed: batches.every(row => row.passed) };
const execution = nodeExecutionProof(files, events);
const missing = inventory.files.filter(row => events.filter(event => event.file === row.file && event.type !== "suite").length !== row.expectedCases).map(row => row.file);
const tests = { passed: result.passed && execution.passed && missing.length === 0, execution, missing };
save("tests.json", tests); console.log(JSON.stringify(tests)); assert.ok(tests.passed, "Affected tests failed or execution was incomplete");
stages.push({ label: "affected-tests", passed: true });
async function command(label, args, env = safe) {
  const fd = openSync(resolve(output, `${label}.log`), "wx", 0o600);
  const code = await new Promise((done, reject) => { const child = spawn(process.execPath, args, { env, stdio: ["ignore", fd, fd] }); child.on("error", reject); child.on("close", done); }).finally(() => closeSync(fd));
  console.log(JSON.stringify({ stage: label, passed: code === 0 })); assert.equal(code, 0, `${label} failed`); stages.push({ label, passed: true });
}
if (mode === "validate") {
  const identity = mcp721Identity(source.sha256, commit, packageId);
  await command("typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]);
  const lint = git("diff", "--name-only", "--diff-filter=ACMR", MCP721_BASE, "HEAD").split("\n").filter(file => /\.(?:[cm]?js|tsx?)$/.test(file));
  save("lint-files.json", { releaseBase: MCP721_BASE, files: lint }); assert.ok(lint.length);
  await command("release-diff-lint", ["node_modules/eslint/bin/eslint.js", ...lint]);
  await command("production-build", ["node_modules/next/dist/bin/next", "build", "--webpack"], { ...safe, NODE_ENV: "production", NEXT_BUILD_SKIP_TYPECHECK: "1", ...(packageId === "efficiency" ? { NODE_OPTIONS: "--max-old-space-size=4096", NEXT_BUILD_CPUS: "1" } : {}) });
  if (packageId === "efficiency") {
    const { runEfficiencyBrowser } = await import("./service-efficiency/release-stages.mjs");
    await runEfficiencyBrowser(output, isolated, inventory.browser);
    stages.push({ label: "affected-browser-tests", passed: true });
  }
  if (packageId === "efficiency") {
    const { benchmarkServices } = await import("./service-efficiency/benchmark.mjs");
    const comparison = await benchmarkServices(resolve(output, "benchmarks"), isolated, inventory.benchmarks);
    save("benchmark-comparison.json", comparison); stages.push({ label: "repeated-baseline-comparison", passed: true });
  }
  save("build.json", { sourceCommit: commit, nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(), buildSha256: compiledBuildIdentity() });
  const after = sourceManifest(); assert.deepEqual(after, source); assert.deepEqual(mcp721Identity(after.sha256, commit, packageId), identity);
  save("source-after.json", after); stages.push({ label: "unchanged-source-and-inputs", passed: true });
  const artifacts = readdirSync(output, { recursive: true, withFileTypes: true }).filter(row => row.isFile()).map(row => relative(output, resolve(row.parentPath, row.name))).filter(file => !file.endsWith(".log") && !file.endsWith(".jsonl")).map(file => ({ file, sha256: payloadHash(readFileSync(resolve(output, file))) }));
  save("attestation.json", { version: `dev-mcp-${packageId}-1`, environment: "dev", scope: inventory.scope, contractVersion: definition.version, ...identity, passed: true, stages, artifacts });
  checkMcp721Proof(resolve(output, "attestation.json"), identity, packageId);
}
if (packageId === "efficiency") { const after = sourceManifest(); assert.deepEqual(after, source, "Source changed during scoped execution"); }
console.log(JSON.stringify({ passed: true, output, scope: inventory.scope, fullSuite: false }));
