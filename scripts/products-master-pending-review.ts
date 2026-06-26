import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { closeSqlPool, getSql } from "@/lib/db";

type ResetEnvironment = "dev" | "uat";

type MasterProductRow = Readonly<{
  brand_name: string | null;
  id: string;
  status: string;
  title: string;
  validation_status: string | null;
}>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function normalizedEnvironment(): ResetEnvironment {
  const raw =
    argValue("env") ??
    process.env.MATTANUTRA_ENV ??
    process.env.NODE_ENV ??
    "dev";
  const value = raw.trim().toLowerCase();

  if (value === "dev" || value === "development" || value === "local") {
    return "dev";
  }

  if (value === "uat" || value === "staging" || value === "stage") {
    return "uat";
  }

  throw new Error("Only DEV and UAT master-list pending-review resets are supported");
}

function applyEnvironmentDbUrl(environment: ResetEnvironment) {
  const explicitEnvName = argValue("db-url-env");

  if (explicitEnvName) {
    const value = process.env[explicitEnvName];

    if (!value) {
      throw new Error(`${explicitEnvName} is not set`);
    }

    process.env.DB_URL = value;
    return;
  }

  const fallbackName = environment === "uat" ? "UAT_DB_URL" : "DEV_DB_URL";

  if (!process.env.DB_URL && process.env[fallbackName]) {
    process.env.DB_URL = process.env[fallbackName];
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
  return /(^|[-_/.:])(prd|prod|production)([-_/.:]|$)/i.test(target);
}

function targetLooksDev(target: string) {
  return /(^|[-_/.:])(dev|development|local|localhost)([-_/.:]|$)/i.test(target) ||
    target.includes("127.0.0.1");
}

function targetLooksUat(target: string) {
  return /(^|[-_/.:])(uat|staging|stage)([-_/.:]|$)/i.test(target);
}

function assertDatabaseTarget(environment: ResetEnvironment, databaseName: string) {
  const url = parsedDbUrl();
  const target = `${url.hostname}/${decodeURIComponent(url.pathname.replace(/^\//, ""))}/${databaseName}`;

  if (targetContainsProductionMarker(target)) {
    throw new Error("Refusing master-list pending-review reset: target looks like production");
  }

  if (environment === "dev" && !targetLooksDev(target)) {
    throw new Error("Refusing master-list pending-review reset: target does not look like DEV");
  }

  if (environment === "uat" && !targetLooksUat(target)) {
    throw new Error("Refusing master-list pending-review reset: target does not look like UAT");
  }
}

function countBy<T extends string | null>(
  rows: readonly MasterProductRow[],
  key: (row: MasterProductRow) => T
) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const value = key(row) ?? "null";
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function reportPath(environment: ResetEnvironment) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "Z");

  return resolve(`reports/products-master-pending-review-${environment}-${timestamp}.json`);
}

async function writeReport(
  path: string,
  report: unknown
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const environment = normalizedEnvironment();
  const apply = hasFlag("apply");

  applyEnvironmentDbUrl(environment);

  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required");
  }

  try {
    const databaseRows = await sql<Array<{ current_database: string }>>`
      select current_database()
    `;
    const databaseName = databaseRows[0]?.current_database ?? "";

    assertDatabaseTarget(environment, databaseName);

    if (apply && !hasFlag("confirm-master-pending-review")) {
      throw new Error("--confirm-master-pending-review is required with --apply");
    }

    const targets = await sql<MasterProductRow[]>`
      select
        products.id::text,
        products.title,
        products.brand_name,
        products.status,
        products.validation_status
      from public.products
      where products.source = 'v9_product_master'
        or products.source_snapshot ->> 'source' = 'v9_product_master'
        or products.source_snapshot ? 'masterListId'
        or products.source_snapshot ? 'masterListSchema'
      order by products.updated_at desc, products.title asc
    `;
    const toUpdate = targets.filter((row) => row.status !== "pending_review");
    let updated: MasterProductRow[] = [];

    if (apply && toUpdate.length > 0) {
      updated = await sql<MasterProductRow[]>`
        update public.products
        set
          status = 'pending_review',
          updated_at = now()
        where products.id = any(${toUpdate.map((row) => row.id)}::uuid[])
        returning
          products.id::text,
          products.title,
          products.brand_name,
          products.status,
          products.validation_status
      `;
    }

    const report = {
      applied: apply,
      databaseName,
      environment,
      generatedAt: new Date().toISOString(),
      statusBefore: countBy(targets, (row) => row.status),
      targetCount: targets.length,
      toUpdateCount: toUpdate.length,
      updatedCount: updated.length,
      validationStatus: countBy(targets, (row) => row.validation_status),
      sample: targets.slice(0, 20).map((row) => ({
        brandName: row.brand_name,
        id: row.id,
        status: row.status,
        title: row.title,
        validationStatus: row.validation_status
      }))
    };
    const outputPath = argValue("out") ?? reportPath(environment);

    await writeReport(outputPath, report);
    console.log(JSON.stringify({ ...report, outputPath }, null, 2));
  } finally {
    await closeSqlPool();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[products:master:pending-review] failed: ${message}`);
  process.exitCode = 1;
});
