#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import postgres from "postgres";
import { sourceManifest } from "./run-full-test-suite.mjs";
import { runCapture } from "./dev-cycle-utils.mjs";
import { axExpectedIdentity, axInputIdentity, axHash, AX_STAGES, AX_ARTIFACTS, readAxValidationProof } from "./ax-validation-proof.mjs";
import { semanticValue } from "./run-ax-refinement-tests.mjs";

const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === "--output", "Usage: --output /absolute/new/evidence/path");
const output = resolve(args[1]);
assert.ok(args[1].startsWith("/") && relative(process.cwd(), output).startsWith("..") && !existsSync(output), "Evidence must be a new absolute path outside checkout");
assert.ok(process.env.TEST_DB_URL, "TEST_DB_URL must identify the isolated template database");
const template = new URL(process.env.TEST_DB_URL);
assert.equal(template.hostname, "127.0.0.1"); assert.match(template.pathname, /^\/mattanutra_lock_review_ax_/); assert.notEqual(template.port, "5432");
assert.equal(await runCapture("git", ["branch", "--show-current"]), "dev");
assert.equal(await runCapture("git", ["status", "--porcelain"]), "", "Commit the reviewed source before acceptance");
const commit = await runCapture("git", ["rev-parse", "HEAD"]), releaseBase = await runCapture("git", ["rev-parse", "22bce180"]);
await runCapture("git", ["merge-base", "--is-ancestor", releaseBase, commit]);
const source = sourceManifest(), identity = axExpectedIdentity(source.sha256, releaseBase);
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (file, value) => writeFileSync(resolve(output, file), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
save("source-before.json", source); save("inputs.json", axInputIdentity());
save("inventory.json", JSON.parse(readFileSync("test/ax-refinement/impact.json", "utf8")));
const stages = [];
const safeEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(safeEnv, { MATTANUTRA_ENV: "dev", AGENTIC_BUILD_ID: commit, AGENTIC_PAYMENT_PROVIDER: "mock", STRIPE_PAYMENT_MODE: "mock", NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: "1", NODE_OPTIONS: "--max-old-space-size=2300" });
async function command(label, command, args, env = safeEnv) {
  const log = resolve(output, `${label}.log`);
  const { openSync, closeSync } = await import("node:fs"); const fd = openSync(log, "wx", 0o600);
  const passed = await new Promise((done, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", fd, fd] }); child.on("error", reject); child.on("close", code => done(code === 0));
  }).finally(() => closeSync(fd));
  stages.push({ label, passed }); console.log(JSON.stringify({ stage: label, passed }));
  assert.ok(passed, `${label} failed; see ${log}`);
}
const adminUrl = new URL(template); adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.href, { max: 1, prepare: false }), schemas = [];
try {
  for (const run of ["a", "b"]) {
    const name = `mattanutra_lock_review_ax_pack_${axHash(output).slice(0, 12)}_${run}`;
    await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${template.pathname.slice(1)}`);
    const url = new URL(template); url.pathname = `/${name}`;
    const env = { ...safeEnv, NODE_ENV: "test", TEST_DB_URL: url.href, DB_URL: url.href, DB_WORKER_URL: url.href, DB_POOL_MAX: "2", DB_ALLOW_DIRECT_CONNECTION: "true" };
    await command(`schema-${run}`, process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-agentic-commerce-schema.ts"], env);
    for (const phase of ["apply", "replay"]) await command(`corrections-${run}-${phase}`, process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-catalogue-corrections.ts", "test/fixtures/ax-refinement/dev-corrections.json", "--apply"], env);
    await command(`data-before-${run}`, process.execPath, ["scripts/validation-data-fingerprints.mjs", resolve(output, `data-before-${run}.json`)], env);
    stages.push({ label: `isolated-schema-and-corrections-${run}`, passed: true });
    await command(`scoped-tests-${run}`, process.execPath, ["scripts/run-ax-refinement-tests.mjs", "--output", resolve(output, run)], env);
    const tests = JSON.parse(readFileSync(resolve(output, run, "results.json"), "utf8")); assert.equal(tests.passed, true);
    save(`test-results-${run}.json`, tests);
    await command(`data-after-${run}`, process.execPath, ["scripts/validation-data-fingerprints.mjs", resolve(output, `data-after-${run}.json`)], env);
    const before = JSON.parse(readFileSync(resolve(output, `data-before-${run}.json`), "utf8"));
    const after = JSON.parse(readFileSync(resolve(output, `data-after-${run}.json`), "utf8"));
    assert.deepEqual(after, before, "Tests must not change catalogue/reference/schema identities"); schemas.push(before);
  }
} finally { await admin.end(); }
assert.deepEqual(schemas[0], schemas[1]); save("schema-data.json", schemas[0]);
const aFiles = readdirSync(resolve(output, "a")).filter(file => file.startsWith("journey-") && file.endsWith(".json")).sort();
const bFiles = readdirSync(resolve(output, "b")).filter(file => file.startsWith("journey-") && file.endsWith(".json")).sort();
assert.equal(aFiles.length, 18); assert.deepEqual(aFiles, bFiles);
const comparisons = aFiles.map(file => {
  const a = semanticValue(JSON.parse(readFileSync(resolve(output, "a", file), "utf8"))), b = semanticValue(JSON.parse(readFileSync(resolve(output, "b", file), "utf8")));
  assert.deepEqual(a, b, `Semantic result changed: ${file}`); return { file, identical: true, sha256: axHash(JSON.stringify(a)) };
});
save("semantic-comparison.json", { passed: true, normalization: "Object key order only. No doses, prices, identities, advice, arrays, source dates or work counts removed.", comparisons });
stages.push({ label: "semantic-equality", passed: true });
const control = process.env.AX_CONTROL_WORKTREE ?? "/tmp/mattanutra-ax-linear-control";
assert.equal(await runCapture("git", ["-C", control, "rev-parse", "HEAD"]), "6baeab0e175109411585f833cbd34c12f4ca0775");
await command("linear-control-comparison", process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/ax-refinement/compare.ts", "--control", control, "--output", resolve(output, "linear")], { ...safeEnv, NODE_ENV: "test" });
const linear = JSON.parse(readFileSync(resolve(output, "linear/comparison.json"), "utf8")); assert.equal(linear.rows.length, 10); save("linear-comparison.json", linear);
await command("typecheck", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
const files = (await runCapture("git", ["diff", "--name-only", "--diff-filter=ACMR", releaseBase, "HEAD"])).split("\n").filter(file => /\.(?:[cm]?js|tsx?)$/.test(file));
assert.ok(files.length); save("release-lint.json", { baseCommit: releaseBase, sourceCommit: commit, files });
await command("release-diff-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...files]);
await command("production-build", process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], { ...safeEnv, NODE_ENV: "production", NEXT_BUILD_SKIP_TYPECHECK: "1" });
save("build-identity.json", { sourceCommit: commit, sourceSha256: source.sha256, nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim() });
const after = sourceManifest(); assert.deepEqual(after, source); assert.deepEqual(axExpectedIdentity(after.sha256, releaseBase), identity);
save("source-after.json", after); stages.push({ label: "unchanged-source-and-inputs", passed: true });
save("stage-results.json", { passed: true, stages });
const artifactFiles = readdirSync(output, { recursive: true, withFileTypes: true }).filter(row => row.isFile()).map(row => relative(output, resolve(row.parentPath, row.name))).sort();
assert.ok(AX_ARTIFACTS.every(file => artifactFiles.includes(file))); assert.ok(AX_STAGES.every(label => stages.some(row => row.label === label && row.passed)));
save("attestation.json", { version: "dev-ax-refinement-1", environment: "dev", scope: "dev_ax_refinement_and_direct_consumers", contractVersion: "7.0.0", ...identity,
  sourceCommit: commit, passed: true, unchangedSource: true, stages,
  unresolvedEvidence: ["Original six-profile response union unavailable; identifiable subset audited", "Historical A2 cause NOT_REPRODUCED", "Unsupported pack corrections DATA_BLOCKED"],
  artifacts: artifactFiles.map(file => ({ file, sha256: axHash(readFileSync(resolve(output, file))) })) });
readAxValidationProof(resolve(output, "attestation.json"), identity);
console.log(JSON.stringify({ output, passed: true, scope: "DEV work package only" }));
