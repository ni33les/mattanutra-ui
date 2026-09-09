import assert from "node:assert/strict";
import postgres from "postgres";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { runBatch } from "../run-full-test-suite.mjs";
import { browserExecutionProof } from "../test-execution-proof.mjs";
import { prepareLockFixtures } from "./prepare-lock-fixtures.mjs";

export async function prepareEfficiencyDatabase(templateUrl, output, env) {
  const url = new URL(templateUrl); assert.equal(url.hostname, "127.0.0.1"); assert.notEqual(url.port, "5432");
  assert.match(url.pathname, /^\/mattanutra_lock_review_ax_[a-z0-9_]+$/);
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.href, { max: 1, prepare: false });
  const name = `mattanutra_lock_review_ax_eff_${createHash("sha256").update(output).digest("hex").slice(0, 12)}`;
  try { await admin.unsafe(`create database ${name} template ${url.pathname.slice(1)}`); } finally { await admin.end(); }
  url.pathname = `/${name}`;
  const isolated = { ...env, TEST_DB_URL: url.href, DB_URL: url.href, DB_WORKER_URL: url.href, DB_POOL_MAX: "3", DB_WORKER_POOL_MAX: "3", DB_ALLOW_DIRECT_CONNECTION: "true" };
  const result = await runBatch("efficiency-schema", ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-service-efficiency-schema.ts"], isolated, output);
  assert.ok(result.passed, "Isolated efficiency migration failed");
  const sql = postgres(url.href, { max: 1, prepare: false });
  try {
    const lockFixtures = await prepareLockFixtures(sql, url.href);
    writeFileSync(resolve(output, "lock-fixtures.json"), JSON.stringify(lockFixtures, null, 2), { flag: "wx", mode: 0o600 });
    const columns = await sql`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and
      ((table_name='agentic_plan_revisions' and column_name='status_projection') or
       (table_name in ('agentic_orders','agentic_plan_operations','assessment_healthscore_results','formulations') and column_name='read_projection') or
       (table_name='assessments' and column_name='funnel_skip_healthscore')) order by table_name,column_name`;
    assert.equal(columns.length, 6);
    const locales = await sql`select code from public.site_locales where code in ('en','th','zh-CN') order by code`;
    assert.deepEqual(locales.map(row => row.code), ['en','th','zh-CN']);
    writeFileSync(resolve(output, "schema.json"), JSON.stringify({ passed: true, schemaSha256: createHash("sha256").update(readFileSync("scripts/service-efficiency-schema.sql")).digest("hex"), columns, locales,
      database: name, template: new URL(templateUrl).pathname.slice(1) }, null, 2), { flag: "wx", mode: 0o600 });
  } finally { await sql.end(); }
  return isolated;
}

export async function runEfficiencyBrowser(output, env, inventory) {
  const origin = "http://127.0.0.1:3100";
  const browserEnv = { ...env, NODE_ENV: "production", PLAYWRIGHT_BASE_URL: origin, NEXT_PUBLIC_SITE_URL: origin, SITE_URL: origin,
    CI: "1", STRIPE_PAYMENT_MODE: "mock", AGENTIC_PAYMENT_PROVIDER: "mock", INTERNAL_QA_HARNESS: "true", DB_POOL_IDLE_TIMEOUT_SECONDS: "1",
    ADMIN_SESSION_SECRET: "service-efficiency-isolated-browser-secret-0001", AGENTIC_CAPABILITY_KEY: "service-efficiency-isolated-capability-key-0001",
    GROK_API_KEY: "", ANTHROPIC_API_KEY: "", XAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "",
    NODE_OPTIONS: `--max-old-space-size=2500 --import=${resolve("test/helpers/offline-network.mjs")}` };
  const { createServer } = await import("node:net");
  await new Promise((done, reject) => { const socket = createServer(); socket.once("error", reject); socket.listen(3100, "127.0.0.1", () => socket.close(done)); });
  const fd = openSync(resolve(output, "browser-server.log"), "wx", 0o600);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { env: browserEnv, stdio: ["ignore", fd, fd], detached: true });
  let startupError;
  const exited = new Promise(resolve => { server.once("exit", resolve); server.once("error", error => { startupError = error; resolve(); }); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) throw new Error("Isolated browser application exited");
      try { const response = await fetch(`${origin}/en/nutrition/quiz`, { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break; } } catch { /* bounded startup */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, "Isolated browser application readiness timeout");
    const files = inventory.map(row => row.file), grep = inventory.map(row => `(?:${row.grep})`).join("|");
    const args = ["node_modules/@playwright/test/cli.js", "test", ...files, "--grep", grep, "--retries=0", "--workers=1", "--reporter=json", `--output=${resolve(output, "browser-artifacts")}`];
    const discovery = await runBatch("browser-discovery", [...args, "--list"], { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output, "browser-discovery.json") }, output);
    assert.ok(discovery.passed);
    const execution = await runBatch("browser-affected", args, { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output, "browser.json") }, output);
    const proof = browserExecutionProof(files, JSON.parse(readFileSync(resolve(output, "browser-discovery.json"))), JSON.parse(readFileSync(resolve(output, "browser.json"))));
    const result = { passed: execution.passed && proof.passed && proof.cases === inventory.reduce((sum, row) => sum + row.expectedCases, 0), execution: proof };
    writeFileSync(resolve(output, "browser-results.json"), JSON.stringify(result, null, 2), { flag: "wx" }); assert.ok(result.passed, "Scoped browser execution failed or was incomplete");
    return result;
  } finally { try { process.kill(-server.pid, "SIGTERM"); } catch { /* already exited */ } const kill = setTimeout(() => { try { process.kill(-server.pid, "SIGKILL"); } catch { /* exited */ } }, 5000);
    await exited; clearTimeout(kill); closeSync(fd); }
}
