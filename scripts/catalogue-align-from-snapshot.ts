import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PRODUCT_STALE_ALLOWED_CLEANUP_TABLES,
  PRODUCT_STALE_BLOCKER_TABLES,
  PLATFORM_CATALOGUE_ALIGNMENT_TABLES,
  PLATFORM_CATALOGUE_DELETE_ORDER,
  PLATFORM_CATALOGUE_INSERT_ORDER,
  PLATFORM_CATALOGUE_REQUIRED_NON_EMPTY_TABLES,
  PLATFORM_CATALOGUE_ROOT_TABLES,
  PLATFORM_CATALOGUE_TRIGGER_TABLES,
  PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST,
  quoteCatalogueAlignmentIdentifier
} from "@/lib/catalogue-alignment";
import { validateCuratedMasterSnapshot } from "@/lib/catalogue-master-validation";
import { closeSqlPool, getSql } from "@/lib/db";
import {
  captureProtectedDataSnapshot,
  type ProtectedDataSnapshot
} from "@/lib/prd-protected-data";
import {
  assertPrdApplyConfirmation,
  assertPrdDatabaseTarget,
  assertPrdPreserveConfirmation,
  assertPrdRuntimeEnvironment
} from "@/lib/prd-rollout-safety";

type Db = NonNullable<ReturnType<typeof getSql>>;
type Row = Record<string, unknown>;
type SnapshotTables = Record<string, Row[]>;

type TableSummary = Readonly<{
  sourceRows: number;
  targetRowsBefore: number;
  targetOnlyRows: number;
}>;

type ProtectedIssue = Readonly<{
  after: unknown;
  before: unknown;
  issue: string;
  table: string;
}>;

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

function targetEnv() {
  return (argValue("target-env") ?? process.env.MATTANUTRA_ENV ?? "").trim().toLowerCase();
}

function dbUrl() {
  return argValue("db-url") ?? process.env.DB_URL ?? null;
}

function connectionLabel(connection: string | null | undefined) {
  if (!connection) {
    return "";
  }

  try {
    const url = new URL(connection);

    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return connection.toLowerCase();
  }
}

function assertConnectionMatchesEnv(connection: string | null, environment: string) {
  if (!connection) {
    throw new Error("DB_URL or --db-url is required.");
  }

  const label = connectionLabel(connection);

  if (environment === "prd" || environment === "prod" || environment === "production") {
    assertPrdRuntimeEnvironment();
    assertPrdDatabaseTarget(connection, "DB_URL/--db-url");
    return;
  }

  if (environment === "dev") {
    if (!/(dev|mn-dev|mattanutra-dev)/i.test(label) || /(uat|prd|prod|production)/i.test(label)) {
      throw new Error(`Refusing DEV catalogue alignment against unexpected database "${label}".`);
    }
    return;
  }

  throw new Error("--target-env=dev or --target-env=prd is required.");
}

function assertApplyConfirmation(environment: string) {
  if (environment === "prd" || environment === "prod" || environment === "production") {
    assertPrdPreserveConfirmation();
    assertPrdApplyConfirmation({
      envName: "MATTANUTRA_CONFIRM_PRD_CATALOGUE_ALIGN",
      expected: "align",
      label: "PRD catalogue alignment"
    });
    return;
  }

  if (environment === "dev" && process.env.MATTANUTRA_CONFIRM_DEV_CATALOGUE_ALIGN !== "align") {
    throw new Error(
      "Refusing DEV catalogue alignment without MATTANUTRA_CONFIRM_DEV_CATALOGUE_ALIGN=align."
    );
  }
}

function normalizeRows(rows: unknown): Row[] {
  return Array.isArray(rows)
    ? rows.filter((row): row is Row => Boolean(row) && typeof row === "object")
    : [];
}

async function loadSnapshot(inputPath: string) {
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as { tables?: unknown };
  const rawTables = payload.tables && typeof payload.tables === "object"
    ? payload.tables as Record<string, unknown>
    : {};
  const tables: SnapshotTables = {};

  for (const table of PLATFORM_CATALOGUE_ALIGNMENT_TABLES) {
    tables[table.name] = normalizeRows(rawTables[table.name]);
  }

  for (const tableName of PLATFORM_CATALOGUE_REQUIRED_NON_EMPTY_TABLES) {
    if ((tables[tableName] ?? []).length < 1 && !hasArg("allow-empty-source")) {
      throw new Error(
        `Snapshot table ${tableName} is empty. Pass --allow-empty-source only for an intentional wipe.`
      );
    }
  }

  if (!hasArg("skip-validation")) {
    const validation = validateCuratedMasterSnapshot(rawTables, {
      allowIncompleteTranslations:
        hasArg("allow-incomplete-translations") ||
        process.env.MATTANUTRA_ALLOW_INCOMPLETE_TRANSLATIONS === "true",
      strict:
        hasArg("strict-master-data") ||
        process.env.MATTANUTRA_STRICT_MASTER_SNAPSHOT === "true"
    });

    if (!validation.ok) {
      throw new Error(
        `Curated master snapshot validation failed: ${validation.errors.join("; ")}`
      );
    }
  }

  return tables;
}

async function tableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select to_regclass(${`public.${tableName}`}) is not null as exists
  `;

  return rows[0]?.exists === true;
}

async function tableColumns(sql: Db, tableName: string) {
  const rows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
    order by ordinal_position
  `;

  return rows.map((row) => row.column_name);
}

async function countTableRows(sql: Db, tableName: string) {
  if (!(await tableExists(sql, tableName))) {
    return 0;
  }

  const rows = await sql.unsafe<Array<{ count: string }>>(
    `select count(*)::text as count from public.${quoteCatalogueAlignmentIdentifier(tableName)}`
  );

  return Number(rows[0]?.count ?? 0);
}

function sourceIds(rows: readonly Row[], column = "id") {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ];
}

async function targetOnlyIds(
  sql: Db,
  tableName: string,
  idColumn: string,
  sourceIdValues: readonly string[]
) {
  if (!(await tableExists(sql, tableName))) {
    return [];
  }

  const rows = await sql.unsafe<Array<{ id: string }>>(
    `
      select ${quoteCatalogueAlignmentIdentifier(idColumn)}::text as id
      from public.${quoteCatalogueAlignmentIdentifier(tableName)}
      where not (${quoteCatalogueAlignmentIdentifier(idColumn)}::text = any($1::text[]))
    `,
    [sourceIdValues]
  );

  return rows.map((row) => row.id);
}

async function countProductReferences(
  sql: Db,
  tableName: string,
  productIds: readonly string[]
) {
  if (productIds.length < 1 || !(await tableExists(sql, tableName))) {
    return 0;
  }

  const rows = await sql.unsafe<Array<{ count: string }>>(
    `
      select count(*)::text as count
      from public.${quoteCatalogueAlignmentIdentifier(tableName)}
      where product_id::text = any($1::text[])
    `,
    [productIds]
  );

  return Number(rows[0]?.count ?? 0);
}

async function setTriggerEnabled(
  sql: Db,
  tableName: string,
  triggerName: string,
  enabled: boolean
) {
  if (!(await tableExists(sql, tableName))) {
    return;
  }

  const action = enabled ? "enable" : "disable";

  await sql.unsafe(`
    do $$
    begin
      if exists (
        select 1
        from pg_trigger
        where tgname = '${triggerName.replaceAll("'", "''")}'
          and tgrelid = 'public.${tableName}'::regclass
      ) then
        alter table public.${quoteCatalogueAlignmentIdentifier(tableName)}
          ${action} trigger ${quoteCatalogueAlignmentIdentifier(triggerName)};
      end if;
    end
    $$;
  `);
}

async function setCatalogueTriggers(sql: Db, enabled: boolean) {
  for (const table of PLATFORM_CATALOGUE_TRIGGER_TABLES) {
    await setTriggerEnabled(sql, table.name, table.triggerName, enabled);
  }

  await setTriggerEnabled(sql, "product_recommendation_items", "product_recommendation_items_no_update_delete", enabled);
}

async function deleteTableRows(sql: Db, tableName: string) {
  if (!(await tableExists(sql, tableName))) {
    return 0;
  }

  const result = await sql.unsafe(
    `delete from public.${quoteCatalogueAlignmentIdentifier(tableName)}`
  );

  return result.count;
}

async function deleteTargetOnlyRootRows(
  sql: Db,
  input: Readonly<{
    idColumn: string;
    sourceIds: readonly string[];
    tableName: string;
  }>
) {
  if (!(await tableExists(sql, input.tableName))) {
    return 0;
  }

  const result = await sql.unsafe(
    `
      delete from public.${quoteCatalogueAlignmentIdentifier(input.tableName)}
      where not (${quoteCatalogueAlignmentIdentifier(input.idColumn)}::text = any($1::text[]))
    `,
    [input.sourceIds]
  );

  return result.count;
}

async function upsertRows(
  sql: Db,
  tableName: string,
  rows: readonly Row[],
  conflictColumns: readonly string[]
) {
  if (rows.length < 1 || !(await tableExists(sql, tableName))) {
    return 0;
  }

  const targetColumns = await tableColumns(sql, tableName);
  const columns = targetColumns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );

  if (columns.length < 1) {
    return 0;
  }

  const conflictSql = conflictColumns.map(quoteCatalogueAlignmentIdentifier).join(", ");
  const conflictColumnSet = new Set(conflictColumns);
  const updateSql = columns
    .filter((column) => !conflictColumnSet.has(column))
    .map((column) => {
      const quoted = quoteCatalogueAlignmentIdentifier(column);

      return `${quoted} = excluded.${quoted}`;
    })
    .join(", ");
  const actionSql = updateSql ? `do update set ${updateSql}` : "do nothing";
  let count = 0;

  for (let index = 0; index < rows.length; index += 150) {
    const chunk = rows.slice(index, index + 150);

    await sql`
      insert into public.${sql(tableName)}
      ${sql(chunk, ...columns)}
      on conflict (${sql.unsafe(conflictSql)}) ${sql.unsafe(actionSql)}
    `;
    count += chunk.length;
  }

  return count;
}

async function insertRows(sql: Db, tableName: string, rows: readonly Row[]) {
  if (rows.length < 1 || !(await tableExists(sql, tableName))) {
    return 0;
  }

  const targetColumns = await tableColumns(sql, tableName);
  const columns = targetColumns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );

  if (columns.length < 1) {
    return 0;
  }

  let count = 0;

  for (let index = 0; index < rows.length; index += 150) {
    const chunk = rows.slice(index, index + 150);

    await sql`
      insert into public.${sql(tableName)}
      ${sql(chunk, ...columns)}
    `;
    count += chunk.length;
  }

  return count;
}

function tableSpec(tableName: string) {
  const spec = PLATFORM_CATALOGUE_ALIGNMENT_TABLES.find((table) => table.name === tableName);

  if (!spec) {
    throw new Error(`Unknown catalogue alignment table ${tableName}`);
  }

  return spec;
}

async function summarize(sql: Db, tables: SnapshotTables) {
  const summary: Record<string, TableSummary> = {};

  for (const spec of PLATFORM_CATALOGUE_ALIGNMENT_TABLES) {
    const rows = tables[spec.name] ?? [];
    const ids = spec.root ? await targetOnlyIds(sql, spec.name, spec.idColumn, sourceIds(rows, spec.idColumn)) : [];

    summary[spec.name] = {
      sourceRows: rows.length,
      targetOnlyRows: ids.length,
      targetRowsBefore: await countTableRows(sql, spec.name)
    };
  }

  return summary;
}

async function productDependencyReport(sql: Db, staleProductIds: readonly string[]) {
  const allowedCleanup: Record<string, number> = {};
  const blockers: Record<string, number> = {};

  for (const tableName of PRODUCT_STALE_ALLOWED_CLEANUP_TABLES) {
    allowedCleanup[tableName] = await countProductReferences(sql, tableName, staleProductIds);
  }

  for (const tableName of PRODUCT_STALE_BLOCKER_TABLES) {
    blockers[tableName] = await countProductReferences(sql, tableName, staleProductIds);
  }

  return {
    allowedCleanup,
    blockers,
    staleProductCount: staleProductIds.length
  };
}

function blockerTotal(blockers: Record<string, number>) {
  return Object.values(blockers).reduce((total, count) => total + count, 0);
}

async function deleteAllowedProductDependencies(sql: Db, staleProductIds: readonly string[]) {
  const deleted: Record<string, number> = {};

  for (const tableName of PRODUCT_STALE_ALLOWED_CLEANUP_TABLES) {
    if (!(await tableExists(sql, tableName)) || staleProductIds.length < 1) {
      deleted[tableName] = 0;
      continue;
    }

    const result = await sql.unsafe(
      `
        delete from public.${quoteCatalogueAlignmentIdentifier(tableName)}
        where product_id::text = any($1::text[])
      `,
      [staleProductIds]
    );

    deleted[tableName] = result.count;
  }

  return deleted;
}

function protectedDataIssues(
  before: ProtectedDataSnapshot,
  after: ProtectedDataSnapshot
): ProtectedIssue[] {
  const allowlist = new Set<string>(PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST);
  const issues: ProtectedIssue[] = [];

  for (const [tableName, beforeTable] of Object.entries(before.tables)) {
    if (allowlist.has(tableName)) {
      continue;
    }

    const afterTable = after.tables[tableName];

    if (!afterTable) {
      continue;
    }

    if (beforeTable.exists !== afterTable.exists) {
      issues.push({
        after: afterTable.exists,
        before: beforeTable.exists,
        issue: "exists_changed",
        table: tableName
      });
    }

    if (beforeTable.rowCount !== afterTable.rowCount) {
      issues.push({
        after: afterTable.rowCount,
        before: beforeTable.rowCount,
        issue: "row_count_changed",
        table: tableName
      });
    }

    if (beforeTable.checksum !== afterTable.checksum) {
      issues.push({
        after: afterTable.checksum,
        before: beforeTable.checksum,
        issue: "checksum_changed",
        table: tableName
      });
    }

    for (const [column, beforeSum] of Object.entries(beforeTable.sums)) {
      const afterSum = afterTable.sums[column] ?? "0";

      if (beforeSum !== afterSum) {
        issues.push({
          after: afterSum,
          before: beforeSum,
          issue: `sum_changed:${column}`,
          table: tableName
        });
      }
    }
  }

  return issues;
}

async function applyAlignment(sql: Db, tables: SnapshotTables, staleProductIds: readonly string[]) {
  const deletedChildren: Record<string, number> = {};
  const deletedRoots: Record<string, number> = {};
  const upserted: Record<string, number> = {};
  const insertedChildren: Record<string, number> = {};
  let deletedAllowedDependencies: Record<string, number> = {};

  await setCatalogueTriggers(sql, false);

  try {
    deletedAllowedDependencies = await deleteAllowedProductDependencies(sql, staleProductIds);

    for (const tableName of PLATFORM_CATALOGUE_DELETE_ORDER) {
      if (PLATFORM_CATALOGUE_ROOT_TABLES.includes(tableName)) {
        continue;
      }

      deletedChildren[tableName] = await deleteTableRows(sql, tableName);
    }

    for (const tableName of PLATFORM_CATALOGUE_INSERT_ORDER) {
      if (!PLATFORM_CATALOGUE_ROOT_TABLES.includes(tableName)) {
        continue;
      }

      const spec = tableSpec(tableName);
      upserted[tableName] = await upsertRows(sql, tableName, tables[tableName] ?? [], [
        spec.idColumn
      ]);
    }

    for (const tableName of PLATFORM_CATALOGUE_DELETE_ORDER) {
      if (!PLATFORM_CATALOGUE_ROOT_TABLES.includes(tableName)) {
        continue;
      }

      const spec = tableSpec(tableName);
      deletedRoots[tableName] = await deleteTargetOnlyRootRows(sql, {
        idColumn: spec.idColumn,
        sourceIds: sourceIds(tables[tableName] ?? [], spec.idColumn),
        tableName
      });
    }

    for (const tableName of PLATFORM_CATALOGUE_INSERT_ORDER) {
      if (PLATFORM_CATALOGUE_ROOT_TABLES.includes(tableName)) {
        continue;
      }

      insertedChildren[tableName] = await insertRows(sql, tableName, tables[tableName] ?? []);
    }
  } finally {
    await setCatalogueTriggers(sql, true);
  }

  return {
    deletedAllowedDependencies,
    deletedChildren,
    deletedRoots,
    insertedChildren,
    upserted
  };
}

async function writeSummary(outputDir: string, summary: unknown) {
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "catalogue-alignment-summary.json");

  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return outputPath;
}

async function main() {
  const inputPath = argValue("snapshot") ?? argValue("input");

  if (!inputPath) {
    throw new Error("--snapshot=<uat-catalogue-snapshot.json> is required.");
  }

  const apply = hasArg("apply");
  const environment = targetEnv();
  const connection = dbUrl();
  const outputDir = argValue(
    "out",
    path.join("reports", "catalogue-alignment", `${environment || "unknown"}-${timestampSlug()}`)
  )!;

  assertConnectionMatchesEnv(connection, environment);

  if (apply) {
    assertApplyConfirmation(environment);
  }

  if (apply && environment.startsWith("prd") && process.env.MATTANUTRA_SKIP_PROTECTED_CHECKSUM === "true") {
    throw new Error("PRD catalogue alignment requires protected-data checksums.");
  }

  process.env.DB_URL = connection!;

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured.");
  }

  const tables = await loadSnapshot(inputPath);
  const staleProductIds = await targetOnlyIds(
    sql,
    "products",
    "id",
    sourceIds(tables.products ?? [], "id")
  );
  const dependencyReport = await productDependencyReport(sql, staleProductIds);
  const tablesBefore = await summarize(sql, tables);
  const blocked = blockerTotal(dependencyReport.blockers) > 0;
  let applyReport: unknown = null;
  let protectedIssues: ProtectedIssue[] = [];

  if (apply && blocked) {
    throw new Error(
      `Catalogue alignment is blocked by protected stale product references: ${JSON.stringify(dependencyReport.blockers)}`
    );
  }

  if (apply) {
    applyReport = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as Db;
      const protectedBefore = environment.startsWith("prd")
        ? await captureProtectedDataSnapshot(tx)
        : null;
      const result = await applyAlignment(tx, tables, staleProductIds);
      const protectedAfter = protectedBefore
        ? await captureProtectedDataSnapshot(tx)
        : null;

      if (protectedBefore && protectedAfter) {
        protectedIssues = protectedDataIssues(protectedBefore, protectedAfter);

        if (protectedIssues.length > 0) {
          throw new Error(
            `Protected PRD data would change outside the catalogue allowlist: ${protectedIssues
              .map((issue) => `${issue.table}:${issue.issue}`)
              .join(", ")}`
          );
        }
      }

      return result;
    });
  }

  const summary = {
    applied: apply,
    applyReport,
    blocked,
    dependencyReport,
    dryRun: !apply,
    generatedAt: new Date().toISOString(),
    inputPath,
    protectedIssues,
    tablesBefore,
    targetEnv: environment
  };
  const outputPath = await writeSummary(outputDir, summary);

  console.log(JSON.stringify({ ...summary, outputPath }, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[catalogue:align] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
