#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function fail(message) {
  console.error(`[uat-rebuild] ${message}`);
  process.exit(1);
}

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function runNode(args, env = process.env) {
  return run(process.execPath, args, env);
}

function runNpmScript(scriptName, env = process.env) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  return run(npmCommand, ["run", scriptName], env);
}

function shouldUseSsl(connectionString) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

async function terminateTargetSessions(env) {
  if (!env.DB_CONNECTION) {
    fail("DB_CONNECTION is required.");
  }

  const sql = postgres(env.DB_CONNECTION, {
    connect_timeout: Number(env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(env.DB_CONNECTION) ? { ssl: "require" } : {})
  });

  try {
    const [summary] = await sql`
      select count(*) filter (where pg_terminate_backend(pid))::int as terminated
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and datname = current_database()
    `;

    if (summary.terminated > 0) {
      console.log(`[uat-rebuild] Terminated ${summary.terminated} existing UAT database session(s).`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const snapshot = argValue("snapshot") ?? process.env.MATTANUTRA_CATALOGUE_SNAPSHOT;

if (!snapshot) {
  fail("Pass --snapshot=<dev-master-snapshot.json> or set MATTANUTRA_CATALOGUE_SNAPSHOT.");
}

if (process.env.MATTANUTRA_ENV !== "uat" && !hasArg("allow-non-uat-env")) {
  fail("Refusing to rebuild unless MATTANUTRA_ENV=uat or --allow-non-uat-env is passed.");
}

if (process.env.MATTANUTRA_CONFIRM_DB_RESET !== "blitz") {
  fail("MATTANUTRA_CONFIRM_DB_RESET=blitz is required.");
}

if (process.env.MATTANUTRA_CONFIRM_CATALOGUE_RELOAD !== "reload") {
  fail("MATTANUTRA_CONFIRM_CATALOGUE_RELOAD=reload is required.");
}

if (process.env.MATTANUTRA_ALLOW_REMOTE_DEV_RESET !== "true") {
  fail("MATTANUTRA_ALLOW_REMOTE_DEV_RESET=true is required for a remote UAT rebuild.");
}

const snapshotPath = resolve(snapshot);
const rebuildEnv = {
  ...process.env,
  DB_ALLOW_DIRECT_CONNECTION: process.env.DB_ALLOW_DIRECT_CONNECTION ?? "true",
  DB_APPLICATION_NAME: process.env.DB_APPLICATION_NAME ?? "mattanutra-uat-rebuild",
  DB_POOL_MAX: process.env.DB_POOL_MAX ?? "1",
  MATTANUTRA_STRICT_MASTER_SNAPSHOT: "true"
};

console.log(`[uat-rebuild] Rebuilding UAT from ${snapshotPath}`);

await terminateTargetSessions(rebuildEnv);
await runNode([
  "--env-file-if-exists=.env.local",
  "scripts/reset-dev-db.mjs",
  "--confirm-blitz"
], rebuildEnv);

await terminateTargetSessions(rebuildEnv);
await runNode([
  "--env-file-if-exists=.env.local",
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs",
  "scripts/catalogue-reload.ts",
  `--input=${snapshotPath}`,
  "--confirm-catalogue-reload",
  "--strict-master-data"
], rebuildEnv);

for (const scriptName of [
  "foods:schema:apply",
  "locales:schema:apply",
  "versions:core:check",
  "products:validation-consistency"
]) {
  await terminateTargetSessions(rebuildEnv);
  await runNpmScript(scriptName, rebuildEnv);
}

console.log("[uat-rebuild] UAT rebuild complete. Restart app and workers after this point.");
