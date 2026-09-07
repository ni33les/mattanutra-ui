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
  assert.deepEqual(validationClientMatrix().map((row: { runId: string; locale: string }) => `${row.runId}:${row.locale}`), ["a:en", "a:th", "a:zh-CN", "b:en", "b:th", "b:zh-CN"]);
  const { REQUIRED_VALIDATION_STAGES } = await import("../scripts/dev-validation-proof.mjs");
  for (const row of validationClientMatrix()) for (const stage of [`docs-client-${row.runId}-${row.locale}`, `docs-client-${row.runId}-${row.locale}-paid`, `fixture-settlement-${row.runId}-${row.locale}`]) assert.ok(REQUIRED_VALIDATION_STAGES.includes(stage), stage);
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
