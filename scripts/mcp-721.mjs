import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync } from "node:fs";
import { resolve, relative } from "node:path";
import { runBatch, sourceManifest } from "./run-full-test-suite.mjs";
import { testSourceHygiene, nodeExecutionProof } from "./test-execution-proof.mjs";
import { payloadHash, compiledBuildIdentity } from "./mcp-payload/proof.mjs";
import { MCP721_BASE, mcp721Identity, checkMcp721Proof } from "./mcp-721-proof.mjs";

const [mode, ...args] = process.argv.slice(2);
assert.ok(["test", "validate"].includes(mode));
const inventory = JSON.parse(readFileSync("test/mcp-7-2-1/impact.json", "utf8"));
assert.equal(inventory.releaseBase, MCP721_BASE);
if (args.length === 1 && args[0] === "--list") { console.log(JSON.stringify(inventory, null, 2)); process.exit(0); }
assert.ok(args.length === 2 && args[0] === "--output" && args[1].startsWith("/"));
const output = resolve(args[1]); assert.ok(relative(process.cwd(), output).startsWith("..") && !existsSync(output));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD"), files = inventory.files.map(row => row.file);
assert.equal(new Set(files).size, files.length); assert.ok(files.length > 0);
const discovered = readdirSync("test/mcp-7-2-1", { recursive: true }).filter(file => file.endsWith(".test.ts")).map(file => `test/mcp-7-2-1/${file}`);
for (const file of discovered) assert.ok(files.includes(file), `Undeclared package test ${file}`);
for (const file of git("diff", "--name-only", "--diff-filter=ACMR", MCP721_BASE, "--", "test").split("\n").filter(file => file.endsWith(".test.ts"))) assert.ok(files.includes(file), `Changed test omitted ${file}`);
for (const row of inventory.files) {
  assert.ok(row.reason.length > 20 && row.expectedCases > 0 && existsSync(row.file));
  assert.deepEqual(testSourceHygiene(readFileSync(row.file, "utf8"), row.file), []);
}
if (mode === "validate") { assert.equal(git("branch", "--show-current"), "dev"); assert.equal(git("status", "--porcelain"), ""); git("merge-base", "--is-ancestor", MCP721_BASE, commit); }
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const source = sourceManifest(); save("source-before.json", source); save("inventory.json", inventory);
const safe = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(safe, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", AGENTIC_BUILD_ID: commit, AGENTIC_PAYMENT_PROVIDER: "mock", STRIPE_PAYMENT_MODE: "mock",
  NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: "2", NODE_OPTIONS: "--max-old-space-size=6144", MCP_721_EVIDENCE_DIR: output });
const result = await runBatch("node-affected-tests", ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", ...files], safe, output);
const events = readFileSync(resolve(output, "node-affected-tests-events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const execution = nodeExecutionProof(files, events);
const missing = inventory.files.filter(row => events.filter(event => event.file === row.file && event.type !== "suite").length !== row.expectedCases).map(row => row.file);
const tests = { passed: result.passed && execution.passed && missing.length === 0, execution, missing };
save("tests.json", tests); console.log(JSON.stringify(tests)); assert.ok(tests.passed, "Affected tests failed or execution was incomplete");
const stages = [{ label: "affected-tests", passed: true }];
async function command(label, args, env = safe) {
  const fd = openSync(resolve(output, `${label}.log`), "wx", 0o600);
  const code = await new Promise((done, reject) => { const child = spawn(process.execPath, args, { env, stdio: ["ignore", fd, fd] }); child.on("error", reject); child.on("close", done); }).finally(() => closeSync(fd));
  console.log(JSON.stringify({ stage: label, passed: code === 0 })); assert.equal(code, 0, `${label} failed`); stages.push({ label, passed: true });
}
if (mode === "validate") {
  const identity = mcp721Identity(source.sha256, commit);
  await command("typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]);
  const lint = git("diff", "--name-only", "--diff-filter=ACMR", MCP721_BASE, "HEAD").split("\n").filter(file => /\.(?:[cm]?js|tsx?)$/.test(file));
  save("lint-files.json", { releaseBase: MCP721_BASE, files: lint }); assert.ok(lint.length);
  await command("release-diff-lint", ["node_modules/eslint/bin/eslint.js", ...lint]);
  await command("production-build", ["node_modules/next/dist/bin/next", "build", "--webpack"], { ...safe, NODE_ENV: "production", NEXT_BUILD_SKIP_TYPECHECK: "1" });
  save("build.json", { sourceCommit: commit, nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(), buildSha256: compiledBuildIdentity() });
  const after = sourceManifest(); assert.deepEqual(after, source); assert.deepEqual(mcp721Identity(after.sha256, commit), identity);
  save("source-after.json", after); stages.push({ label: "unchanged-source-and-inputs", passed: true });
  const artifacts = readdirSync(output).filter(file => !file.endsWith(".log") && !file.endsWith(".jsonl")).map(file => ({ file, sha256: payloadHash(readFileSync(resolve(output, file))) }));
  save("attestation.json", { version: "dev-mcp-721-1", environment: "dev", scope: inventory.scope, contractVersion: "7.2.1", ...identity, passed: true, stages, artifacts });
  checkMcp721Proof(resolve(output, "attestation.json"), identity);
}
console.log(JSON.stringify({ passed: true, output, scope: inventory.scope, fullSuite: false }));
