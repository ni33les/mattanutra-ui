import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSql } from "@/lib/db";
import {
  CATALOGUE_RELOAD_ORDER,
  CATALOGUE_TRUNCATE_ORDER,
  catalogueSnapshotTableNames
} from "@/lib/catalogue-snapshot-tables";

type SnapshotPayload = Readonly<{
  formatVersion?: unknown;
  tables?: unknown;
}>;

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`[catalogue-reload] ${message}`);
  process.exit(1);
}

function assertDevTarget() {
  const connection = process.env.DB_CONNECTION;

  if (!connection) {
    fail("DB_CONNECTION is required.");
  }

  let url: URL;

  try {
    url = new URL(connection);
  } catch {
    fail("DB_CONNECTION is not a valid PostgreSQL URL.");
  }

  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  const explicitProd =
    target.includes("prd") ||
    target.includes("prod") ||
    target.includes("production");
  const explicitlyAllowed =
    target.includes("localhost") ||
    target.includes("127.0.0.1") ||
    target.includes("mattanutra-dev") ||
    target.includes("mn-pool") ||
    process.env.MATTANUTRA_ALLOW_REMOTE_DEV_RESET === "true";

  if (process.env.NODE_ENV === "production") {
    fail("Refusing to reload catalogue while NODE_ENV=production.");
  }

  if (explicitProd && process.env.MATTANUTRA_ALLOW_PROD_RESET !== "true") {
    fail("Refusing to reload catalogue into a target that looks like production.");
  }

  if (!explicitlyAllowed) {
    fail("Refusing to reload catalogue into a DB target that is not explicitly marked as dev.");
  }
}

function normalizeRows(tableName: string, rows: unknown) {
  if (!Array.isArray(rows)) {
    return [];
  }

  if (tableName !== "product_imports") {
    return rows as Record<string, unknown>[];
  }

  return (rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    review_task_id: null
  }));
}

function chunkRows<T>(rows: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push([...rows.slice(index, index + size)]);
  }

  return chunks;
}

if (!hasArg("confirm-catalogue-reload") && process.env.MATTANUTRA_CONFIRM_CATALOGUE_RELOAD !== "reload") {
  fail("Refusing to reload without --confirm-catalogue-reload or MATTANUTRA_CONFIRM_CATALOGUE_RELOAD=reload.");
}

assertDevTarget();

const inputPath = argValue("input");

if (!inputPath) {
  fail("--input=<snapshot.json> is required.");
}

const payload = JSON.parse(await readFile(resolve(inputPath), "utf8")) as SnapshotPayload;

if (payload.formatVersion !== 1 || !payload.tables || typeof payload.tables !== "object") {
  fail("Snapshot format is not recognized.");
}

const tables = payload.tables as Record<string, unknown>;
const missingTables = catalogueSnapshotTableNames().filter((table) => !(table in tables));

if (missingTables.length > 0) {
  fail(`Snapshot is missing required tables: ${missingTables.join(", ")}`);
}

const sql = getSql();

if (!sql) {
  fail("Database is not configured.");
}

const truncateList = CATALOGUE_TRUNCATE_ORDER.map((table) => `public.${table}`).join(", ");

await sql.unsafe(`truncate table ${truncateList} restart identity cascade`);

const counts: Record<string, number> = {};

for (const tableName of CATALOGUE_RELOAD_ORDER) {
  const rows = normalizeRows(tableName, tables[tableName]);
  counts[tableName] = rows.length;

  if (rows.length < 1) {
    continue;
  }

  const columnRows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
    order by ordinal_position asc
  `;
  const columns = columnRows.map((row) => row.column_name);

  for (const chunk of chunkRows(rows, 250)) {
    await sql`
      insert into public.${sql(tableName)}
      ${sql(chunk, ...columns)}
    `;
  }
}

await sql.end({ timeout: 1 });

console.log(JSON.stringify({
  counts,
  inputPath,
  status: "ok"
}, null, 2));
