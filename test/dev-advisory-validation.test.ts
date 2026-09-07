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
