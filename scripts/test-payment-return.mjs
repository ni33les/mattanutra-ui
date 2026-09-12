import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { runBatch, sourceManifest } from "./run-full-test-suite.mjs";
import { nodeExecutionProof, testSourceHygiene } from "./test-execution-proof.mjs";
import { compiledBuildIdentity, payloadHash } from "./mcp-payload/proof.mjs";

const [mode, flag, directory] = process.argv.slice(2);
assert.ok(["test", "validate"].includes(mode) && flag === "--output" && isAbsolute(directory));
const output = resolve(directory); assert.ok(relative(process.cwd(), output).startsWith("..") && !existsSync(output));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const inventory = JSON.parse(readFileSync("test/payment-return/impact.json", "utf8"));
const files = inventory.files.map(row => row.file);
assert.equal(new Set(files).size, files.length);
for (const row of inventory.files) { assert.ok(row.expectedCases > 0 && row.reason); assert.deepEqual(testSourceHygiene(readFileSync(row.file, "utf8"), row.file), []); }
if (mode === "validate") assert.equal(git("status", "--porcelain"), "");
const sha = git("rev-parse", "HEAD"), source = sourceManifest();
git("merge-base", "--is-ancestor", inventory.releaseBase, sha);
mkdirSync(output, { mode: 0o700, recursive: true });
const save = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
save("inventory.json", inventory); save("source-before.json", source);
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", AGENTIC_BUILD_ID: sha, STRIPE_PAYMENT_MODE: "mock", AGENTIC_PAYMENT_PROVIDER: "mock", NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: "2", NODE_OPTIONS: "--max-old-space-size=4096" });
const result = await runBatch("node-payment-return", ["--test", "--test-concurrency=1", "--experimental-test-module-mocks", "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", ...files], env, output);
assert.ok(result.passed);
const events = readFileSync(resolve(output, "node-payment-return-events.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
const execution = nodeExecutionProof(files, events); assert.ok(execution.passed);
for (const row of inventory.files) assert.equal(events.filter(e => e.file === row.file && e.type !== "suite").length, row.expectedCases, row.file);
save("tests.json", result);
const stages = [{ label: "affected-tests", passed: true }];
if (mode === "validate") {
  const lint = git("diff", "--name-only", "--diff-filter=ACMR", inventory.releaseBase, sha).split("\n").filter(f => /\.(?:[cm]?[jt]s|tsx)$/.test(f));
  save("lint-files.json", lint);
  for (const [label, args] of [["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]], ["release-diff-lint", ["node_modules/eslint/bin/eslint.js", ...lint]], ["production-build", ["node_modules/next/dist/bin/next", "build", "--webpack"]]]) {
    const stage = await runBatch(label, args, { ...env, ...(label === "production-build" ? { NODE_ENV: "production", NEXT_BUILD_SKIP_TYPECHECK: "1" } : {}) }, output);
    assert.ok(stage.passed, label); stages.push({ label, passed: true });
  }
  save("build.json", { sourceCommit: sha, nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(), buildSha256: compiledBuildIdentity() });
}
assert.deepEqual(sourceManifest(), source); assert.equal(git("rev-parse", "HEAD"), sha);
save("source-after.json", source);
save("attestation.json", { passed: true, scope: inventory.scope, sourceCommit: sha, releaseBase: inventory.releaseBase,
  sourceSha256: source.sha256, inventorySha256: payloadHash(JSON.stringify(inventory)), contractVersion: "11.0.0",
  execution, stages, unchangedSource: true, fullSuite: false });
