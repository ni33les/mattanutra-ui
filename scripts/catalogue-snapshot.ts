import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getSql } from "@/lib/db";
import {
  CATALOGUE_SNAPSHOT_TABLES,
  catalogueSnapshotTableNames
} from "@/lib/catalogue-snapshot-tables";

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function backupSchemaName(slug: string) {
  return `catalogue_snapshot_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
}

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

const slug = timestampSlug();
const outputPath = resolve(
  argValue("out", `/private/tmp/mattanutra-catalogue-snapshot-${slug}.json`) ??
    `/private/tmp/mattanutra-catalogue-snapshot-${slug}.json`
);
const includeDbBackup = !hasArg("no-db-backup");
const schemaName = backupSchemaName(argValue("schema", slug) ?? slug);
const tables: Record<string, unknown[]> = {};
const counts: Record<string, number> = {};

if (includeDbBackup) {
  await sql`create schema if not exists ${sql(schemaName)}`;
}

for (const table of CATALOGUE_SNAPSHOT_TABLES) {
  const tableIdentifier = sql(table.name);
  const rows = await sql`select * from public.${tableIdentifier}`;

  tables[table.name] = rows;
  counts[table.name] = rows.length;

  if (includeDbBackup) {
    await sql`drop table if exists ${sql(schemaName)}.${tableIdentifier}`;
    await sql`
      create table ${sql(schemaName)}.${tableIdentifier}
      as select * from public.${tableIdentifier}
    `;
  }
}

const payload = {
  createdAt: new Date().toISOString(),
  dbBackupSchema: includeDbBackup ? schemaName : null,
  formatVersion: 1,
  requiredTables: catalogueSnapshotTableNames(),
  source: {
    database: "DB_CONNECTION",
    script: "catalogue:snapshot"
  },
  tableDescriptions: Object.fromEntries(
    CATALOGUE_SNAPSHOT_TABLES.map((table) => [
      table.name,
      {
        description: table.description,
        requiredForReload: table.requiredForReload
      }
    ])
  ),
  tables
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await sql.end({ timeout: 1 });

console.log(JSON.stringify({
  counts,
  dbBackupSchema: includeDbBackup ? schemaName : null,
  outputPath,
  status: "ok"
}, null, 2));
