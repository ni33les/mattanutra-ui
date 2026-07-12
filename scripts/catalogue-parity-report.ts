import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  PLATFORM_CATALOGUE_ALIGNMENT_TABLES,
  RETAIL_CATALOGUE_TABLES,
  catalogueRowsHash
} from "@/lib/catalogue-alignment";

type Row = Record<string, unknown>;

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadTables(inputPath: string) {
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as { tables?: unknown };

  return payload.tables && typeof payload.tables === "object"
    ? payload.tables as Record<string, unknown>
    : {};
}

function rowsFor(tables: Record<string, unknown>, tableName: string): Row[] {
  const rows = tables[tableName];

  return Array.isArray(rows)
    ? rows.filter((row): row is Row => Boolean(row) && typeof row === "object")
    : [];
}

function orgIdToSlug(tables: Record<string, unknown>) {
  const mapping = new Map<string, string>();

  for (const row of rowsFor(tables, "organisations")) {
    if (typeof row.id === "string" && typeof row.slug === "string") {
      mapping.set(row.id, row.slug);
    }
  }

  return mapping;
}

function normalizedRetailRows(
  tables: Record<string, unknown>,
  tableName: (typeof RETAIL_CATALOGUE_TABLES)[number]
) {
  const orgs = orgIdToSlug(tables);

  return rowsFor(tables, tableName)
    .filter((row) => row.status !== "deleted")
    .map((row) => {
      const normalized: Row = {
        ...row,
        organisation_slug:
          typeof row.organisation_id === "string" ? orgs.get(row.organisation_id) : null
      };

      delete normalized.id;
      delete normalized.organisation_id;
      delete normalized.created_at;
      delete normalized.updated_at;

      if (tableName === "retail_product_stock") {
        delete normalized.stock_quantity;
      }

      return normalized;
    });
}

function compareTable(
  tableName: string,
  sourceRows: readonly Row[],
  targetRows: readonly Row[]
) {
  const sourceHash = catalogueRowsHash(sourceRows);
  const targetHash = catalogueRowsHash(targetRows);

  return {
    equal: sourceHash === targetHash && sourceRows.length === targetRows.length,
    sourceHash,
    sourceRows: sourceRows.length,
    tableName,
    targetHash,
    targetRows: targetRows.length
  };
}

async function main() {
  const sourcePath = argValue("source");
  const targetPath = argValue("target");

  if (!sourcePath || !targetPath) {
    throw new Error("--source=<uat-catalogue-snapshot.json> and --target=<snapshot.json> are required.");
  }

  const sourceTables = await loadTables(sourcePath);
  const targetTables = await loadTables(targetPath);
  const platform = PLATFORM_CATALOGUE_ALIGNMENT_TABLES.map((table) =>
    compareTable(table.name, rowsFor(sourceTables, table.name), rowsFor(targetTables, table.name))
  );
  const sourceRetailPath = argValue("source-retail");
  const targetRetailPath = argValue("target-retail");
  const retail = sourceRetailPath && targetRetailPath
    ? (() => {
        return Promise.all([loadTables(sourceRetailPath), loadTables(targetRetailPath)]).then(
          ([sourceRetailTables, targetRetailTables]) =>
            RETAIL_CATALOGUE_TABLES.map((tableName) =>
              compareTable(
                tableName,
                normalizedRetailRows(sourceRetailTables, tableName),
                normalizedRetailRows(targetRetailTables, tableName)
              )
            )
        );
      })()
    : Promise.resolve([]);
  const retailResults = await retail;
  const differences = [...platform, ...retailResults].filter((entry) => !entry.equal);
  const report = {
    differences,
    generatedAt: new Date().toISOString(),
    platform,
    retail: retailResults,
    sourcePath,
    sourceRetailPath,
    targetPath,
    targetRetailPath
  };
  const outputPath = argValue(
    "out",
    path.join("reports", "catalogue-parity", `${timestampSlug()}.json`)
  )!;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ differenceCount: differences.length, outputPath }, null, 2));

  if (differences.length > 0 && !hasArg("no-fail")) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[catalogue:parity] failed: ${message}`);
  process.exitCode = 1;
});
