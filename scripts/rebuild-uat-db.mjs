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
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      reject(
        new Error(`${command} ${args.join(" ")} failed with exit code ${code}`),
      );
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

function runTsScript(scriptName, args = [], env = process.env) {
  return runNode(
    [
      "--env-file-if-exists=.env.local",
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-path-loader.mjs",
      scriptName,
      ...args,
    ],
    env,
  );
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
  if (!env.DB_URL) {
    fail("DB_URL is required.");
  }

  const sql = postgres(env.DB_URL, {
    connect_timeout: Number(env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(env.DB_URL) ? { ssl: "require" } : {}),
  });

  try {
    const [summary] = await sql`
      select count(*) filter (where pg_terminate_backend(pid))::int as terminated
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and datname = current_database()
    `;

    if (summary.terminated > 0) {
      console.log(
        `[uat-rebuild] Terminated ${summary.terminated} existing UAT database session(s).`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function grantMnAccess(env) {
  if (!env.DB_URL) {
    fail("DB_URL is required.");
  }

  const sql = postgres(env.DB_URL, {
    connect_timeout: Number(env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(env.DB_URL) ? { ssl: "require" } : {}),
  });

  try {
    await sql`
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'mn') then
          grant usage on schema public to mn;
          grant select, insert, update, delete on all tables in schema public to mn;
          grant usage, select on all sequences in schema public to mn;
          alter default privileges in schema public
            grant select, insert, update, delete on tables to mn;
          alter default privileges in schema public
            grant usage, select on sequences to mn;
        end if;
      end $$;
    `;
    console.log(
      "[uat-rebuild] Granted public schema/table/sequence access to role mn when present.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const snapshot =
  argValue("snapshot") ?? process.env.MATTANUTRA_CATALOGUE_SNAPSHOT;
const preserveSnapshot =
  argValue("preserve-snapshot") ??
  `reports/uat-preserved-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const preserveConfig =
  process.env.MATTANUTRA_UAT_PRESERVE_CONFIG !== "false" &&
  !hasArg("no-preserve-config");
const restorePreservedConfigOnly =
  process.env.MATTANUTRA_UAT_PRESERVE_CONFIG_MODE === "restore-only" ||
  hasArg("restore-preserved-config");

if (!snapshot) {
  fail(
    "Pass --snapshot=<dev-master-snapshot.json> or set MATTANUTRA_CATALOGUE_SNAPSHOT.",
  );
}

if (process.env.MATTANUTRA_ENV !== "uat" && !hasArg("allow-non-uat-env")) {
  fail(
    "Refusing to rebuild unless MATTANUTRA_ENV=uat or --allow-non-uat-env is passed.",
  );
}

if (process.env.MATTANUTRA_CONFIRM_DB_RESET !== "blitz") {
  fail("MATTANUTRA_CONFIRM_DB_RESET=blitz is required.");
}

if (process.env.MATTANUTRA_CONFIRM_CATALOGUE_RELOAD !== "reload") {
  fail("MATTANUTRA_CONFIRM_CATALOGUE_RELOAD=reload is required.");
}

if (process.env.MATTANUTRA_ALLOW_REMOTE_DEV_RESET !== "true") {
  fail(
    "MATTANUTRA_ALLOW_REMOTE_DEV_RESET=true is required for a remote UAT rebuild.",
  );
}

const snapshotPath = resolve(snapshot);
const rebuildEnv = {
  ...process.env,
  DB_ALLOW_DIRECT_CONNECTION: process.env.DB_ALLOW_DIRECT_CONNECTION ?? "true",
  DB_APPLICATION_NAME:
    process.env.DB_APPLICATION_NAME ?? "mattanutra-uat-rebuild",
  DB_POOL_MAX: process.env.DB_POOL_MAX ?? "1",
  MATTANUTRA_STRICT_MASTER_SNAPSHOT: "true",
};

console.log(`[uat-rebuild] Rebuilding UAT from ${snapshotPath}`);

if (preserveConfig && !restorePreservedConfigOnly) {
  console.log(
    `[uat-rebuild] Preserving UAT access/config rows into ${preserveSnapshot}`,
  );
  await runTsScript(
    "scripts/uat-preserved-config.ts",
    ["snapshot", `--snapshot=${preserveSnapshot}`],
    rebuildEnv,
  );
} else if (preserveConfig) {
  console.log(
    `[uat-rebuild] Reusing existing preserved UAT access/config snapshot ${preserveSnapshot}`,
  );
}

await terminateTargetSessions(rebuildEnv);
await runNode(
  [
    "--env-file-if-exists=.env.local",
    "scripts/reset-dev-db.mjs",
    "--confirm-blitz",
  ],
  rebuildEnv,
);

await terminateTargetSessions(rebuildEnv);
await runNode(
  [
    "--env-file-if-exists=.env.local",
    "--experimental-strip-types",
    "--import",
    "./scripts/register-ts-path-loader.mjs",
    "scripts/catalogue-reload.ts",
    `--input=${snapshotPath}`,
    "--confirm-catalogue-reload",
    "--strict-master-data",
  ],
  rebuildEnv,
);

if (preserveConfig) {
  await runTsScript(
    "scripts/uat-preserved-config.ts",
    ["restore", `--snapshot=${preserveSnapshot}`],
    rebuildEnv,
  );
}

for (const scriptName of [
  "admin-access:schema:apply",
  "communications:schema:apply",
  "panya:schema:apply",
  "payments:schema:apply",
  "retail-checkout:schema:apply",
  "retail-financials:schema:apply",
  "retail-stock:schema:apply",
  "product-identifiers:schema:apply",
  "product-regulatory:schema:apply",
  "product-offers:schema:remove",
  "recommendation-insights:schema:apply",
  "thai-tax:schema:apply",
  "foods:schema:apply",
  "locales:schema:apply",
  "versions:core:apply",
  "versions:core:check",
  "products:validation-consistency",
]) {
  await terminateTargetSessions(rebuildEnv);
  await runNpmScript(scriptName, rebuildEnv);
}

await terminateTargetSessions(rebuildEnv);
await runNpmScript("uat:seed:minimal-runtime", {
  ...rebuildEnv,
  MATTANUTRA_CONFIRM_UAT_MINIMAL_SEED: "seed",
  MATTANUTRA_UAT_PRESERVE_CONFIG: preserveConfig ? "true" : "false",
});

if (preserveConfig) {
  await runTsScript(
    "scripts/uat-preserved-config.ts",
    ["verify", `--snapshot=${preserveSnapshot}`],
    rebuildEnv,
  );
}

await grantMnAccess(rebuildEnv);

console.log(
  "[uat-rebuild] UAT rebuild complete. Restart app and workers after this point.",
);
