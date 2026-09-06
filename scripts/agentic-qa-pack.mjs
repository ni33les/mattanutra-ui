#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { allTestFiles } from "./dev-cycle-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELATED_REGRESSIONS = new Set([
  "test/admin-product-facts.test.ts",
  "test/assessment-revisions.integration.test.ts",
  "test/funnel-readiness.integration.test.ts"
]);

/** Maintained repository coverage, including nested value/matcher and boundary tests.
 * This does not implement or replace the separately frozen official QA v3 runner.
 */
export function mcpTestFiles() {
  return allTestFiles().filter(file =>
    RELATED_REGRESSIONS.has(file) ||
    /^test\/(?:agentic[-/]|mcp[-/]|matcher[-/]|product-matcher)/.test(file) ||
    /\b(?:MCP|matcher|agentic)\b/i.test(readFileSync(path.join(ROOT, file), "utf8"))
  );
}

export function mcpTestBatches(env = process.env) {
  const files = mcpTestFiles();
  const integration = file => file.endsWith(".integration.test.ts");
  return [
    {
      label: "DEV catalogue, memory and HTTP tests",
      files: files.filter(file => !integration(file)),
      env: { ...env, DB_POOL_MAX: "1", DB_WORKER_POOL_MAX: "1" }
    },
    {
      label: "Isolated PostgreSQL concurrency and readiness tests",
      files: files.filter(integration),
      env: { ...env, DB_URL: env.TEST_DB_URL, DB_POOL_MAX: "6", DB_WORKER_POOL_MAX: "6" }
    }
  ];
}

export function runMcpSuite() {
  process.chdir(ROOT);
  if (process.argv.slice(2).some(arg => arg !== "--list")) {
    console.error("Usage: npm run agentic:qa:pack -- [--list]");
    return 2;
  }
  const files = mcpTestFiles();
  if (process.argv.includes("--list")) {
    console.log(files.join("\n"));
    return 0;
  }
  if ((process.env.MATTANUTRA_ENV ?? "dev") !== "dev" ||
      (process.env.MCP_URL && process.env.MCP_URL !== "https://dev.mattanutra.com/api/mcp")) {
    console.error("The repository MCP suite targets DEV. Use MATTANUTRA_ENV=dev and the DEV MCP URL.");
    return 2;
  }
  if (!process.env.DB_URL || !process.env.TEST_DB_URL) {
    console.error("Full MCP coverage requires DB_URL for the DEV catalogue and TEST_DB_URL for an isolated localhost database. See docs/mcp-failure-triage.md.");
    return 2;
  }
  let isolated;
  try { isolated = new URL(process.env.TEST_DB_URL); } catch { /* checked below */ }
  if (isolated?.hostname !== "127.0.0.1" || !isolated.pathname.startsWith("/mattanutra_lock_review")) {
    console.error("TEST_DB_URL must point to an isolated localhost mattanutra_lock_review database.");
    return 2;
  }
  console.log(`Repository MCP suite: ${files.length} files; official frozen acceptance is separate.`);
  let exitCode = 0;
  for (const batch of mcpTestBatches()) {
    if (!batch.files.length) continue;
    console.log(`${batch.label}: ${batch.files.length} files`);
    const child = spawnSync(process.execPath, [
      "--test", "--test-concurrency=1", "--experimental-strip-types",
      "--import", "./scripts/register-ts-path-loader.mjs", ...batch.files
    ], { cwd: ROOT, env: batch.env, stdio: "inherit" });
    if (child.error) console.error(child.error.message);
    if (child.status !== 0) exitCode = 1;
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runMcpSuite();
}
