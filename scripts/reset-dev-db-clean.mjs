#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function fail(message) {
  console.error(`[reset-dev-db-clean] ${message}`);
  process.exit(1);
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
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

async function tableCounts(connectionString) {
  const sql = postgres(connectionString, {
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connectionString) ? { ssl: "require" } : {})
  });

  try {
    const tables = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `;
    const counts = [];

    for (const table of tables) {
      const rows = await sql`
        select count(*)::int as count
        from public.${sql(table.table_name)}
      `;
      counts.push({
        rows: Number(rows[0]?.count ?? 0),
        table: table.table_name
      });
    }

    return counts;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readSnapshotSummary(snapshotPath) {
  const payload = JSON.parse(await readFile(snapshotPath, "utf8"));
  const tables = payload?.tables && typeof payload.tables === "object"
    ? payload.tables
    : {};
  const tableNames = Array.isArray(payload?.requiredTables)
    ? payload.requiredTables.filter((table) => typeof table === "string")
    : Object.keys(tables);

  return {
    counts: Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [
        table,
        Array.isArray(rows) ? rows.length : 0
      ])
    ),
    tableNames
  };
}

async function printResetSummary(snapshotPath) {
  const connection = process.env.DB_CONNECTION;
  const snapshot = await readSnapshotSummary(snapshotPath);
  const catalogueTables = new Set(snapshot.tableNames);
  const snapshotCounts = snapshot.counts;

  if (!connection) {
    fail("DB_CONNECTION is required.");
  }

  const counts = await tableCounts(connection);
  const reloaded = counts
    .filter((row) => catalogueTables.has(row.table))
    .map((row) => ({
      currentRows: row.rows,
      reloadedRows: Number(snapshotCounts[row.table] ?? 0),
      table: row.table
    }));
  const cleared = counts
    .filter((row) => !catalogueTables.has(row.table))
    .map((row) => ({
      currentRows: row.rows,
      table: row.table
    }));

  console.log(JSON.stringify({
    clearedRuntimeRows: cleared.reduce((total, row) => total + row.currentRows, 0),
    clearedRuntimeTables: cleared,
    reloadedCatalogueRows: reloaded.reduce((total, row) => total + row.reloadedRows, 0),
    reloadedCatalogueTables: reloaded,
    snapshot: snapshotPath,
    status: "dry_run_summary"
  }, null, 2));
}

function runNode(args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      reject(new Error(`node ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

const snapshot = argValue("snapshot") ?? process.env.MATTANUTRA_CATALOGUE_SNAPSHOT;

if (!snapshot) {
  fail("Pass --snapshot=<catalogue-snapshot.json> or set MATTANUTRA_CATALOGUE_SNAPSHOT.");
}

const snapshotPath = resolve(snapshot);

await printResetSummary(snapshotPath);

if (hasArg("dry-run")) {
  console.log("[reset-dev-db-clean] Dry run only. No reset was performed.");
  process.exit(0);
}

await runNode([
  "--env-file-if-exists=.env.local",
  "scripts/reset-dev-db.mjs",
  "--confirm-blitz"
]);

await runNode([
  "--env-file-if-exists=.env.local",
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs",
  "scripts/catalogue-reload.ts",
  `--input=${snapshotPath}`,
  "--confirm-catalogue-reload"
], {
  ...process.env,
  MATTANUTRA_CONFIRM_CATALOGUE_RELOAD: "reload"
});

console.log(`[reset-dev-db-clean] Reset complete and catalogue reloaded from ${snapshotPath}.`);
