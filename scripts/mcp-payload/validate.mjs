import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync } from "node:fs";
import { resolve, relative } from "node:path";
import postgres from "postgres";
import { sourceManifest } from "../run-full-test-suite.mjs";
import { runCapture } from "../dev-cycle-utils.mjs";
import { payloadHash, payloadInputIdentity, payloadExpectedIdentity, readPayloadProof, compiledBuildIdentity } from "./proof.mjs";
import { RELEASE_BASE } from "./run-tests.mjs";
import { payloadReport } from "./report.mjs";
import { semanticJourney, SEMANTIC_NORMALIZATION } from "./semantic.mjs";
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === "--output" && args[1].startsWith("/"));
const output = resolve(args[1]); assert.ok(relative(process.cwd(), output).startsWith("..") && !existsSync(output));
assert.ok(process.env.TEST_DB_URL, "An isolated clean template database is required");
const template = new URL(process.env.TEST_DB_URL);
assert.equal(template.hostname, "127.0.0.1"); assert.equal(template.port, "55439"); assert.match(template.pathname, /^\/mattanutra_lock_review_payload_/);
assert.equal(await runCapture("git", ["branch", "--show-current"]), "dev");
assert.equal(await runCapture("git", ["status", "--porcelain"]), "", "Commit reviewed source before final scoped acceptance");
const commit = await runCapture("git", ["rev-parse", "HEAD"]); await runCapture("git", ["merge-base", "--is-ancestor", RELEASE_BASE, commit]);
const source = sourceManifest(), identity = payloadExpectedIdentity(source.sha256, RELEASE_BASE);
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (file, value) => writeFileSync(resolve(output, file), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
save("source-before.json", source); save("inputs.json", payloadInputIdentity()); save("inventory.json", JSON.parse(readFileSync("test/mcp-payload/impact.json", "utf8")));
const stages = [], safe = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(safe, { MATTANUTRA_ENV: "dev", AGENTIC_BUILD_ID: commit, AGENTIC_PAYMENT_PROVIDER: "mock", STRIPE_PAYMENT_MODE: "mock", NEXT_TELEMETRY_DISABLED: "1", NEXT_BUILD_CPUS: "1", NODE_OPTIONS: "--max-old-space-size=2300" });
async function command(label, command, args, env = safe) {
  const log = resolve(output, `${label}.log`), fd = openSync(log, "wx", 0o600);
  const passed = await new Promise((done, reject) => { const child = spawn(command, args, { env, stdio: ["ignore", fd, fd] }); child.on("error", reject); child.on("close", code => done(code === 0)); }).finally(() => closeSync(fd));
  stages.push({ label, passed }); console.log(JSON.stringify({ stage: label, passed })); assert.ok(passed, `Failed ${label}: ${log}`);
}
const check = postgres(template.href, { max: 1, prepare: false });
try { const [row] = await check`select count(*)::int as count from public.agentic_plans`; assert.equal(row.count, 0, "Template must contain no test/customer plans"); } finally { await check.end(); }
const adminUrl = new URL(template); adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.href, { max: 1, prepare: false });
try {
  for (const run of ["a", "b"]) {
    const database = `mattanutra_lock_review_payload_${payloadHash(output).slice(0, 12)}_${run}`;
    await admin.unsafe(`create database ${database} template ${template.pathname.slice(1)}`);
    const url = new URL(template); url.pathname = `/${database}`;
    const env = { ...safe, NODE_ENV: "test", TEST_DB_URL: url.href, DB_URL: url.href, DB_WORKER_URL: url.href, DB_POOL_MAX: "2" };
    await command(`isolated-schema-${run}`, process.execPath, ["--experimental-strip-types", "scripts/apply-agentic-commerce-schema.ts"], env);
    await command(`scoped-tests-${run}`, process.execPath, ["scripts/mcp-payload/run-tests.mjs", "--output", resolve(output, run)], env);
    const result = JSON.parse(readFileSync(resolve(output, run, "results.json"), "utf8")); assert.equal(result.passed, true); save(`test-results-${run}.json`, result);
  }
} finally { await admin.end(); }
const files = readdirSync(resolve(output, "a")).filter(file => /^journey-.*\.json$/.test(file)).sort();
assert.equal(files.length, 18); assert.deepEqual(files, readdirSync(resolve(output, "b")).filter(file => /^journey-.*\.json$/.test(file)).sort());
const comparisons = files.map(file => { const a = semanticJourney(JSON.parse(readFileSync(resolve(output, "a", file), "utf8"))), b = semanticJourney(JSON.parse(readFileSync(resolve(output, "b", file), "utf8"))); assert.deepEqual(a, b, `Paired semantic evidence differs: ${file}`); return { file, identical: true, sha256: payloadHash(JSON.stringify(a)) }; });
save("semantic-comparison.json", { passed: true, normalization: SEMANTIC_NORMALIZATION, comparisons }); stages.push({ label: "semantic-equality", passed: true });
payloadReport(resolve(output, "a"), output);
await command("typecheck", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
const lint = (await runCapture("git", ["diff", "--name-only", "--diff-filter=ACMR", RELEASE_BASE, "HEAD"])).split("\n").filter(file => /\.(?:[cm]?js|tsx?)$/.test(file)); assert.ok(lint.length);
save("release-lint.json", { releaseBase: RELEASE_BASE, sourceCommit: commit, files: lint });
await command("release-diff-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...lint]);
await command("production-build", process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], { ...safe, NODE_ENV: "production", NEXT_BUILD_SKIP_TYPECHECK: "1" });
save("build-identity.json", { sourceCommit: commit, sourceSha256: source.sha256, nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(), buildSha256: compiledBuildIdentity() });
const after = sourceManifest(); assert.deepEqual(after, source); assert.deepEqual(payloadExpectedIdentity(after.sha256, RELEASE_BASE), identity);
save("source-after.json", after); stages.push({ label: "unchanged-source-and-inputs", passed: true }); save("stage-results.json", { passed: true, stages });
const artifactFiles = readdirSync(output, { recursive: true, withFileTypes: true }).filter(row => row.isFile()).map(row => relative(output, resolve(row.parentPath, row.name))).sort();
save("attestation.json", { version: "dev-mcp-payload-1", environment: "dev", scope: "mcp_payload_and_direct_readers", contractVersion: "7.1.0", ...identity, sourceCommit: commit,
  passed: true, unchangedSource: true, stages, artifacts: artifactFiles.map(file => ({ file, sha256: payloadHash(readFileSync(resolve(output, file))) })) });
readPayloadProof(resolve(output, "attestation.json"), identity);
console.log(JSON.stringify({ passed: true, output, sourceCommit: commit, scope: "DEV MCP payload package only; installed connector still requires deployment verification" }));
