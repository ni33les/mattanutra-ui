import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const sha = "84c39d9acff2fa380b0223be38650264ab1cc73d";
const loader = resolve("scripts/register-ts-path-loader.mjs");
const config = pathToFileURL(resolve("lib/agentic/config.ts")).href;

function probe(artifact: string | null, overrides: Record<string, string> = {}, runner = false) {
  const cwd = mkdtempSync(join(tmpdir(), "mn-worker-identity-"));
  try {
    mkdirSync(join(cwd, ".next"));
    if (artifact !== null) writeFileSync(join(cwd, ".next/required-server-files.json"), JSON.stringify({ config: { env: { AGENTIC_BUILD_ID: artifact } } }));
    writeFileSync(join(cwd, ".next/BUILD_ID"), "next-generated-id-is-not-a-git-sha");
    const args = ["--experimental-strip-types", "--import", loader, ...(runner
      ? [resolve("workers/runner.ts"), "--check-runtime"]
      : ["--input-type=module", "-e", `import {loadAgenticConfig} from ${JSON.stringify(config)}; console.log(JSON.stringify({buildId:loadAgenticConfig().buildId}));`])];
    return spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH, NODE_ENV: "production", MATTANUTRA_ENV: "uat", AGENTIC_CAPABILITY_KEY: "isolated-worker-identity-test", ...overrides } });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test("LOCK-ID-01 standalone UAT configuration uses the compiled application SHA without runtime injection", () => {
  const result = probe(sha);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).buildId, sha);
});

test("LOCK-ID-02 a runtime SHA conflicting with the compiled application is rejected", () => {
  const result = probe(sha, { AGENTIC_BUILD_ID: "b".repeat(40) });
  assert.notEqual(result.status, 0, "A worker must not advertise a different build from its application");
  assert.match(result.stderr, /identity.*mismatch|build.*mismatch/i);
});

test("LOCK-ID-03 missing and malformed compiled identity never fall back to Next BUILD_ID or package version", () => {
  for (const artifact of [null, "0.1.17"]) {
    const result = probe(artifact);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /build|identity|SHA/i);
  }
});

test("LOCK-ID-04 the actual worker entrypoint verifies configuration and reports the compiled identity before admission", () => {
  const result = probe(sha, { npm_package_version: "0.1.17" }, true);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
  assert.equal(value.buildId, sha);
  assert.equal(value.workerVersion, sha);
  assert.equal(value.environment, "uat");
  assert.ok(value.taskTypes.includes("match_agentic_plan"));
});
