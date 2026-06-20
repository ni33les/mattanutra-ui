import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getSql } from "@/lib/db";

const RETAIL_SNAPSHOT_TABLES = [
  {
    name: "retail_sellable_products",
    selectSql: `
      select sellable.*
      from public.retail_sellable_products sellable
      join public.organisations organisation on organisation.id = sellable.organisation_id
      where organisation.slug in ('delight-pharmacy', 'enchanted-pharmacy')
      order by sellable.organisation_id, sellable.product_id
    `
  },
  {
    name: "retail_product_stock",
    selectSql: `
      select stock.*
      from public.retail_product_stock stock
      join public.organisations organisation on organisation.id = stock.organisation_id
      where organisation.slug in ('delight-pharmacy', 'enchanted-pharmacy')
      order by stock.organisation_id, stock.product_id
    `
  }
] as const;

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
  return `retail_snapshot_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
}

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

const slug = timestampSlug();
const outputPath = resolve(
  argValue("out", `/private/tmp/mattanutra-retail-snapshot-${slug}.json`) ??
    `/private/tmp/mattanutra-retail-snapshot-${slug}.json`
);
const includeDbBackup = !hasArg("no-db-backup");
const schemaName = backupSchemaName(argValue("schema", slug) ?? slug);
const tables: Record<string, unknown[]> = {};
const counts: Record<string, number> = {};

if (includeDbBackup) {
  await sql`create schema if not exists ${sql(schemaName)}`;
}

for (const table of RETAIL_SNAPSHOT_TABLES) {
  const tableIdentifier = sql(table.name);
  const rows = await sql.unsafe(table.selectSql);

  tables[table.name] = rows;
  counts[table.name] = rows.length;

  if (includeDbBackup) {
    await sql`drop table if exists ${sql(schemaName)}.${tableIdentifier}`;
    await sql.unsafe(`create table "${schemaName}"."${table.name}" as ${table.selectSql}`);
  }
}

const payload = {
  createdAt: new Date().toISOString(),
  dbBackupSchema: includeDbBackup ? schemaName : null,
  formatVersion: 1,
  organisationSlugs: ["delight-pharmacy", "enchanted-pharmacy"],
  source: {
    database: "DB_URL",
    script: "retail:snapshot"
  },
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
