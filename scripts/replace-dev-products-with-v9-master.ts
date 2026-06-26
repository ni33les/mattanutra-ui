import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type postgres from "postgres";

import { closeSqlPool, getSql } from "@/lib/db";
import {
  V9_RESET_TABLES,
  insertV9ProductMasterProduct,
  internalV9ProductUrl,
  loadV9ReferenceIds,
  quoteV9Identifier,
  seedV9RetailTenants,
  validateV9ProductMasterPayload,
  type V9ImportedProductSeed,
  type V9ProductMasterPayload,
  type V9ProductMasterReplaceResult,
} from "@/lib/v9-product-master";

type Db = postgres.Sql | postgres.TransactionSql;

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function assertDevEnvironment() {
  const env = (process.env.MATTANUTRA_ENV ?? "").trim().toLowerCase();

  if (!["dev", "development", "local"].includes(env)) {
    throw new Error("MATTANUTRA_ENV=dev is required for the v9 product reset");
  }

  if (!hasFlag("confirm-dev-reset-products")) {
    throw new Error("--confirm-dev-reset-products is required");
  }
}

function parsedDbUrl() {
  const dbUrl = process.env.DB_URL;

  if (!dbUrl) {
    throw new Error("DB_URL is required");
  }

  try {
    return new URL(dbUrl);
  } catch {
    throw new Error("DB_URL must be a valid postgres URL");
  }
}

function targetContainsProductionMarker(target: string) {
  return /(^|[-_/.:])(uat|prd|prod|production)([-_/.:]|$)/i.test(target);
}

function targetLooksDev(target: string) {
  return /(^|[-_/.:])(dev|development|local|localhost)([-_/.:]|$)/i.test(target) ||
    target.includes("127.0.0.1");
}

function assertDevDatabaseUrlTarget(url: URL) {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const target = `${url.hostname}/${databaseName}`;

  if (targetContainsProductionMarker(target)) {
    throw new Error("Refusing v9 product reset: DB_URL target looks like UAT/PRD/production");
  }

  if (!targetLooksDev(target)) {
    throw new Error("Refusing v9 product reset: DB_URL target must clearly look like DEV");
  }
}

function assertDevDatabaseName(databaseName: string) {
  if (targetContainsProductionMarker(databaseName)) {
    throw new Error(`Refusing v9 product reset: connected database is ${databaseName}`);
  }

  if (!targetLooksDev(databaseName)) {
    throw new Error(`Refusing v9 product reset: connected database does not look like DEV (${databaseName})`);
  }
}

function schemaSlug() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function backupSchemaName(slug = schemaSlug()) {
  return `dev_v9_product_reset_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
}

async function applyV9ProductMasterSchema(sql: Db) {
  await sql`
    alter table public.products
      drop constraint if exists products_platform_check
  `;
  await sql`
    alter table public.products
      add constraint products_platform_check check (
        platform = any(array[
          'lazada',
          'manual',
          'shopee',
          'wholesale_pharmacy_import'
        ]::text[])
      )
  `;
}

async function existingTables(sql: Db, tableNames: readonly string[]) {
  const rows = await sql<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${[...tableNames]}::text[])
  `;
  const existing = new Set(rows.map((row) => row.table_name));

  return tableNames.filter((tableName) => existing.has(tableName));
}

async function tableCounts(sql: Db, tableNames: readonly string[]) {
  const counts: Record<string, number> = {};

  for (const tableName of tableNames) {
    const rows = await sql.unsafe<Array<{ count: number | string }>>(
      `select count(*)::int as count from public.${quoteV9Identifier(tableName)}`,
    );

    counts[tableName] = Number(rows[0]?.count ?? 0);
  }

  return counts;
}

async function backupTables(sql: Db, tableNames: readonly string[], schemaName: string) {
  await sql.unsafe(`create schema if not exists ${quoteV9Identifier(schemaName)}`);

  for (const tableName of tableNames) {
    await sql.unsafe(
      `create table ${quoteV9Identifier(schemaName)}.${quoteV9Identifier(tableName)} as select * from public.${quoteV9Identifier(tableName)}`,
    );
  }
}

async function replaceDevProductsWithV9Master(
  sql: postgres.Sql,
  payload: V9ProductMasterPayload,
): Promise<V9ProductMasterReplaceResult> {
  return sql.begin(async (tx) => {
    await applyV9ProductMasterSchema(tx);

    const tables = await existingTables(tx, V9_RESET_TABLES);
    const backupSchema = backupSchemaName();
    const tableCountsBeforeReset = await tableCounts(tx, tables);

    await backupTables(tx, tables, backupSchema);

    if (tables.length > 0) {
      await tx.unsafe(
        `truncate table ${tables.map((table) => `public.${quoteV9Identifier(table)}`).join(", ")} restart identity cascade`,
      );
    }

    const supplementIds = await loadV9ReferenceIds(tx, "supplements");
    const foodIds = await loadV9ReferenceIds(tx, "foods");
    const nutrientIds = await loadV9ReferenceIds(tx, "nutrients");
    const seenUrlCounts = new Map<string, number>();
    const importedProducts: V9ImportedProductSeed[] = [];

    for (const product of payload.products) {
      importedProducts.push(
        await insertV9ProductMasterProduct(tx, {
          foodIds,
          master: payload,
          nutrientIds,
          product,
          productUrl: internalV9ProductUrl(product, seenUrlCounts),
          supplementIds,
        }),
      );
    }

    const retail = await seedV9RetailTenants(tx, importedProducts);

    return {
      ...retail,
      backupSchema,
      importedProducts: importedProducts.length,
      tableCountsBeforeReset,
    };
  });
}

async function writeReport(payload: unknown) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const outputPath = resolve(`reports/dev-v9-product-reset-${timestamp}.json`);
  const tempPath = `${outputPath}.tmp`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, outputPath);

  return outputPath;
}

const filePath = argValue("file") ?? argValue("input");

if (!filePath) {
  throw new Error("--file=/path/to/v9-master-list.json is required");
}

assertDevEnvironment();
assertDevDatabaseUrlTarget(parsedDbUrl());

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required");
}

try {
  const [connection] = await sql<Array<{ current_database: string; current_user: string }>>`
    select current_database(), current_user
  `;
  const databaseName = connection?.current_database ?? "";

  assertDevDatabaseName(databaseName);

  const payload = validateV9ProductMasterPayload(
    JSON.parse(await readFile(resolve(filePath), "utf8")),
  );
  const result = await replaceDevProductsWithV9Master(sql, payload);
  const reportPath = await writeReport({
    connectedDatabase: databaseName,
    connectedUser: connection?.current_user ?? null,
    generatedAt: new Date().toISOString(),
    inputFile: resolve(filePath),
    result,
  });

  console.log(JSON.stringify({
    backupSchema: result.backupSchema,
    importedProducts: result.importedProducts,
    reportPath,
    retailProductsPerTenant: result.retailProductsPerTenant,
    retailSellablesSeeded: result.retailSellablesSeeded,
    retailStockSeeded: result.retailStockSeeded,
    skippedIgnoredProducts: result.skippedIgnoredProducts,
  }, null, 2));
} finally {
  await closeSqlPool();
}
