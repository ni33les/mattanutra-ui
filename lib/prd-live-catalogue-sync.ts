import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCuratedMasterSnapshot } from "@/lib/catalogue-master-validation";
import {
  catalogueSnapshotTableNames,
  quoteCatalogueIdentifier
} from "@/lib/catalogue-snapshot-tables";
import { getSql } from "@/lib/db";
import {
  captureProtectedDataSnapshot,
  compareProtectedDataSnapshots,
  type ProtectedDataSnapshot,
  type ProtectedDataVerificationIssue
} from "@/lib/prd-protected-data";

type Db = NonNullable<ReturnType<typeof getSql>>;
type SnapshotRow = Record<string, unknown>;
type SnapshotTables = Record<string, SnapshotRow[]>;

export type PrdCatalogueSyncMode = "append_only" | "preserve_parent" | "replace_scoped_child";

export type PrdCatalogueTableReport = Readonly<{
  conflictColumns: readonly string[];
  deletedScopedRows: number;
  mode: PrdCatalogueSyncMode;
  sourceRows: number;
  targetOnlyRows: number | null;
  targetRowsBefore: number | null;
  upsertedRows: number;
}>;

export type PrdCatalogueNaturalKeyConflict = Readonly<{
  key: string;
  keyColumns: readonly string[];
  sourceId: string;
  table: string;
  targetId: string;
}>;

export type PrdLiveCatalogueSyncSummary = Readonly<{
  applied: boolean;
  blocked: boolean;
  conflicts: readonly PrdCatalogueNaturalKeyConflict[];
  dryRun: boolean;
  generatedAt: string;
  inputPath: string;
  protectedDataIssues: readonly ProtectedDataVerificationIssue[];
  reportDirectory: string;
  tables: Record<string, PrdCatalogueTableReport>;
}>;

export type RunPrdLiveCatalogueSyncInput = Readonly<{
  allowIncompleteTranslations?: boolean;
  apply?: boolean;
  inputPath: string;
  outputDir?: string | null;
  skipValidation?: boolean;
  sql: Db;
  strictMasterData?: boolean;
}>;

type TablePolicy = Readonly<{
  conflictColumns: readonly string[];
  mode: PrdCatalogueSyncMode;
  parentColumn?: string;
  parentTable?: string;
}>;

type NaturalKeyCheck = Readonly<{
  idColumn: string;
  keyColumns: readonly string[];
  sourceFilter?: (row: SnapshotRow) => boolean;
  table: string;
  targetWhereSql?: string;
}>;

type SnapshotPayload = Readonly<{
  formatVersion?: unknown;
  tables?: unknown;
}>;

const KEY_SEPARATOR = "\u001f";

const CATALOGUE_SYNC_ORDER = [
  "site_locales",
  "finance_accounts",
  "nutrients",
  "supplements",
  "supplement_aliases",
  "supplement_safety_limits",
  "supplement_safety_limit_bands",
  "supplement_translations",
  "supplement_versions",
  "supplement_country_availability",
  "product_brands",
  "product_brand_countries",
  "foods",
  "food_aliases",
  "food_nutrient_profiles",
  "food_safety_rules",
  "food_serving_sizes",
  "food_translations",
  "products",
  "product_countries",
  "product_identifiers",
  "product_identifier_candidates",
  "product_regulatory_approvals",
  "product_translations",
  "product_facts",
  "product_versions",
  "product_import_runs",
  "product_imports",
  "product_import_translations",
  "testimonials",
  "blog_posts"
] as const;

export const PRD_LIVE_CATALOGUE_TABLE_POLICIES: Record<string, TablePolicy> = {
  blog_posts: { conflictColumns: ["id"], mode: "preserve_parent" },
  finance_accounts: { conflictColumns: ["id"], mode: "preserve_parent" },
  food_aliases: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "food_id",
    parentTable: "foods"
  },
  food_nutrient_profiles: {
    conflictColumns: ["food_id", "nutrient_id"],
    mode: "replace_scoped_child",
    parentColumn: "food_id",
    parentTable: "foods"
  },
  food_safety_rules: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "food_id",
    parentTable: "foods"
  },
  food_serving_sizes: {
    conflictColumns: ["food_id", "label"],
    mode: "replace_scoped_child",
    parentColumn: "food_id",
    parentTable: "foods"
  },
  food_translations: {
    conflictColumns: ["food_id", "locale"],
    mode: "replace_scoped_child",
    parentColumn: "food_id",
    parentTable: "foods"
  },
  foods: { conflictColumns: ["id"], mode: "preserve_parent" },
  nutrients: { conflictColumns: ["id"], mode: "preserve_parent" },
  product_brand_countries: {
    conflictColumns: ["brand_id", "country_code"],
    mode: "replace_scoped_child",
    parentColumn: "brand_id",
    parentTable: "product_brands"
  },
  product_brands: { conflictColumns: ["id"], mode: "preserve_parent" },
  product_countries: {
    conflictColumns: ["product_id", "country_code"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_facts: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_identifier_candidates: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_identifiers: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_import_runs: { conflictColumns: ["id"], mode: "preserve_parent" },
  product_import_translations: {
    conflictColumns: ["import_id", "locale"],
    mode: "replace_scoped_child",
    parentColumn: "import_id",
    parentTable: "product_imports"
  },
  product_imports: { conflictColumns: ["id"], mode: "preserve_parent" },
  product_regulatory_approvals: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_translations: {
    conflictColumns: ["product_id", "locale"],
    mode: "replace_scoped_child",
    parentColumn: "product_id",
    parentTable: "products"
  },
  product_versions: { conflictColumns: ["product_id", "version"], mode: "append_only" },
  products: { conflictColumns: ["id"], mode: "preserve_parent" },
  site_locales: { conflictColumns: ["code"], mode: "preserve_parent" },
  supplement_aliases: {
    conflictColumns: ["id"],
    mode: "replace_scoped_child",
    parentColumn: "supplement_id",
    parentTable: "supplements"
  },
  supplement_country_availability: {
    conflictColumns: ["supplement_id", "country_code"],
    mode: "replace_scoped_child",
    parentColumn: "supplement_id",
    parentTable: "supplements"
  },
  supplement_safety_limits: {
    conflictColumns: ["supplement_id", "life_stage", "source_scope", "version"],
    mode: "append_only"
  },
  supplement_safety_limit_bands: {
    conflictColumns: ["supplement_id", "life_stage", "source_scope", "version"],
    mode: "append_only"
  },
  supplement_translations: {
    conflictColumns: ["supplement_id", "locale"],
    mode: "replace_scoped_child",
    parentColumn: "supplement_id",
    parentTable: "supplements"
  },
  supplement_versions: { conflictColumns: ["supplement_id", "version"], mode: "append_only" },
  supplements: { conflictColumns: ["id"], mode: "preserve_parent" },
  testimonials: { conflictColumns: ["id"], mode: "preserve_parent" }
};

const NATURAL_KEY_CHECKS: readonly NaturalKeyCheck[] = [
  { idColumn: "id", keyColumns: ["name"], table: "finance_accounts" },
  { idColumn: "id", keyColumns: ["normalized_name"], table: "supplements" },
  { idColumn: "id", keyColumns: ["normalized_name"], table: "product_brands" },
  { idColumn: "id", keyColumns: ["normalized_url"], table: "products" },
  { idColumn: "id", keyColumns: ["normalized_name"], table: "foods" },
  { idColumn: "id", keyColumns: ["locale", "slug"], table: "blog_posts" },
  {
    idColumn: "id",
    keyColumns: ["translation_group_id", "locale"],
    table: "blog_posts"
  },
  {
    idColumn: "id",
    keyColumns: ["translation_group_id", "locale"],
    table: "testimonials"
  },
  {
    idColumn: "id",
    keyColumns: ["normalized_brand_name", "normalized_product_title", "source_url"],
    table: "product_imports"
  },
  {
    idColumn: "product_id",
    keyColumns: ["identifier_type", "normalized_value"],
    sourceFilter: (row) => textValue(row.status) === "active",
    table: "product_identifiers",
    targetWhereSql: "status = 'active'"
  }
];

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRows(tableName: string, rows: unknown): SnapshotRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  if (tableName !== "product_imports") {
    return rows.filter((row): row is SnapshotRow => Boolean(row) && typeof row === "object");
  }

  return rows
    .filter((row): row is SnapshotRow => Boolean(row) && typeof row === "object")
    .map((row) => ({
      ...row,
      review_task_id: null
    }));
}

function normalizeSnapshotTables(rawTables: unknown): SnapshotTables {
  const source = rawTables && typeof rawTables === "object"
    ? rawTables as Record<string, unknown>
    : {};
  const tables: SnapshotTables = {};

  for (const tableName of catalogueSnapshotTableNames()) {
    tables[tableName] = normalizeRows(tableName, source[tableName]);
  }

  return tables;
}

function chunkRows<T>(rows: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push([...rows.slice(index, index + size)]);
  }

  return chunks;
}

function conflictTargetSql(columns: readonly string[]) {
  return columns.map(quoteCatalogueIdentifier).join(", ");
}

function updateSetSql(columns: readonly string[], conflictColumns: readonly string[]) {
  const conflictColumnSet = new Set(conflictColumns);

  return columns
    .filter((column) => !conflictColumnSet.has(column))
    .map((column) => {
      const quoted = quoteCatalogueIdentifier(column);
      return `${quoted} = excluded.${quoted}`;
    })
    .join(", ");
}

async function tableColumns(sql: Db, tableName: string) {
  const rows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
    order by ordinal_position asc
  `;

  return rows.map((row) => row.column_name);
}

async function tableRowCount(sql: Db, tableName: string) {
  const rows = await sql.unsafe<Array<{ count: string }>>(
    `select count(*)::text as count from public.${quoteCatalogueIdentifier(tableName)}`
  );

  return Number(rows[0]?.count ?? 0);
}

async function sourceMissingTargetRows(
  sql: Db,
  tableName: string,
  conflictColumns: readonly string[],
  rows: readonly SnapshotRow[]
) {
  if (conflictColumns.length !== 1 || rows.length < 1) {
    return null;
  }

  const column = conflictColumns[0]!;
  const sourceValues = rows.map((row) => textValue(row[column])).filter(Boolean);

  if (sourceValues.length < 1) {
    return tableRowCount(sql, tableName);
  }

  const result = await sql.unsafe<Array<{ count: string }>>(
    `
      select count(*)::text as count
      from public.${quoteCatalogueIdentifier(tableName)}
      where not (${quoteCatalogueIdentifier(column)}::text = any($1::text[]))
    `,
    [sourceValues]
  );

  return Number(result[0]?.count ?? 0);
}

async function upsertRows(input: Readonly<{
  conflictColumns: readonly string[];
  mode: PrdCatalogueSyncMode;
  rows: readonly SnapshotRow[];
  sql: Db;
  tableName: string;
}>) {
  if (input.rows.length < 1) {
    return 0;
  }

  const columns = (await tableColumns(input.sql, input.tableName)).filter((column) =>
    input.rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );

  if (columns.length < 1) {
    return 0;
  }

  const conflictSql = conflictTargetSql(input.conflictColumns);
  const updateSql = updateSetSql(columns, input.conflictColumns);
  const actionSql =
    input.mode === "append_only" || !updateSql
      ? "do nothing"
      : `do update set ${updateSql}`;
  let count = 0;

  for (const chunk of chunkRows(input.rows, 150)) {
    await input.sql`
      insert into public.${input.sql(input.tableName)}
      ${input.sql(chunk, ...columns)}
      on conflict (${input.sql.unsafe(conflictSql)}) ${input.sql.unsafe(actionSql)}
    `;
    count += chunk.length;
  }

  return count;
}

function parentIdsForPolicy(tables: SnapshotTables, policy: TablePolicy) {
  const parentRows = policy.parentTable ? tables[policy.parentTable] ?? [] : [];

  return [
    ...new Set(
      parentRows
        .map((row) => textValue(row.id))
        .filter(Boolean)
    )
  ];
}

async function deleteScopedChildren(input: Readonly<{
  policy: TablePolicy;
  sql: Db;
  tableName: string;
  tables: SnapshotTables;
}>) {
  const parentColumn = input.policy.parentColumn;

  if (!parentColumn) {
    return 0;
  }

  const parentIds = parentIdsForPolicy(input.tables, input.policy);

  if (parentIds.length < 1) {
    return 0;
  }

  const rows = await input.sql`
    delete from public.${input.sql(input.tableName)}
    where ${input.sql.unsafe(quoteCatalogueIdentifier(parentColumn))} = any(${parentIds}::uuid[])
    returning 1
  `;

  return rows.length;
}

export function naturalKeyForRow(
  row: SnapshotRow,
  keyColumns: readonly string[]
) {
  const values = keyColumns.map((column) => textValue(row[column]));

  return values.every(Boolean) ? values.join(KEY_SEPARATOR) : null;
}

export function findNaturalKeyConflictsInRows(
  check: Pick<NaturalKeyCheck, "idColumn" | "keyColumns" | "sourceFilter" | "table">,
  sourceRows: readonly SnapshotRow[],
  targetRows: readonly SnapshotRow[]
): PrdCatalogueNaturalKeyConflict[] {
  const sourceByKey = new Map<string, string>();

  for (const row of sourceRows) {
    if (check.sourceFilter && !check.sourceFilter(row)) {
      continue;
    }

    const key = naturalKeyForRow(row, check.keyColumns);
    const sourceId = textValue(row[check.idColumn]);

    if (key && sourceId) {
      sourceByKey.set(key, sourceId);
    }
  }

  const conflicts: PrdCatalogueNaturalKeyConflict[] = [];

  for (const row of targetRows) {
    const key = naturalKeyForRow(row, check.keyColumns);
    const sourceId = key ? sourceByKey.get(key) : null;
    const targetId = textValue(row[check.idColumn]);

    if (key && sourceId && targetId && targetId !== sourceId) {
      conflicts.push({
        key,
        keyColumns: check.keyColumns,
        sourceId,
        table: check.table,
        targetId
      });
    }
  }

  return conflicts;
}

function keyExpressionSql(keyColumns: readonly string[]) {
  return `concat_ws(chr(31), ${keyColumns
    .map((column) => `coalesce(${quoteCatalogueIdentifier(column)}::text, '')`)
    .join(", ")})`;
}

async function findNaturalKeyConflicts(
  sql: Db,
  tables: SnapshotTables
): Promise<PrdCatalogueNaturalKeyConflict[]> {
  const conflicts: PrdCatalogueNaturalKeyConflict[] = [];

  for (const check of NATURAL_KEY_CHECKS) {
    const sourceRows = (tables[check.table] ?? []).filter((row) =>
      check.sourceFilter ? check.sourceFilter(row) : true
    );
    const sourceKeys = [
      ...new Set(
        sourceRows
          .map((row) => naturalKeyForRow(row, check.keyColumns))
          .filter((key): key is string => Boolean(key))
      )
    ];

    if (sourceKeys.length < 1) {
      continue;
    }

    const expression = keyExpressionSql(check.keyColumns);
    const where = check.targetWhereSql ? `and ${check.targetWhereSql}` : "";
    const rows = await sql.unsafe<SnapshotRow[]>(
      `
        select
          ${quoteCatalogueIdentifier(check.idColumn)}::text as ${quoteCatalogueIdentifier(check.idColumn)},
          ${check.keyColumns.map((column) => quoteCatalogueIdentifier(column)).join(", ")}
        from public.${quoteCatalogueIdentifier(check.table)}
        where ${expression} = any($1::text[])
          ${where}
      `,
      [sourceKeys]
    );

    conflicts.push(...findNaturalKeyConflictsInRows(check, sourceRows, rows));
  }

  return conflicts;
}

function defaultOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join("reports", "prd-catalogue-sync", stamp);
}

async function atomicWriteFile(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;

  await writeFile(tmp, contents, "utf8");
  await rename(tmp, filePath);
}

async function writeJsonReport(filePath: string, data: unknown) {
  await atomicWriteFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeCsvReport(
  filePath: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[]
) {
  const csvCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(","))
  ];

  await atomicWriteFile(filePath, `${lines.join("\n")}\n`);
}

async function writeReports(input: Readonly<{
  afterProtected: ProtectedDataSnapshot | null;
  beforeProtected: ProtectedDataSnapshot;
  conflicts: readonly PrdCatalogueNaturalKeyConflict[];
  outputDir: string;
  summary: PrdLiveCatalogueSyncSummary;
}>) {
  await mkdir(input.outputDir, { recursive: true });
  await writeJsonReport(path.join(input.outputDir, "summary.json"), input.summary);
  await writeJsonReport(
    path.join(input.outputDir, "protected-before.json"),
    input.beforeProtected
  );

  if (input.afterProtected) {
    await writeJsonReport(
      path.join(input.outputDir, "protected-after.json"),
      input.afterProtected
    );
  }

  await writeCsvReport(
    path.join(input.outputDir, "natural-key-conflicts.csv"),
    ["table", "key_columns", "key", "source_id", "target_id"],
    input.conflicts.map((conflict) => [
      conflict.table,
      conflict.keyColumns.join("|"),
      conflict.key,
      conflict.sourceId,
      conflict.targetId
    ])
  );
}

async function acquireSyncLock(sql: Db) {
  const rows = await sql<Array<{ locked: boolean }>>`
    select pg_try_advisory_lock(hashtext('mattanutra-prd-live-catalogue-sync')) as locked
  `;

  if (!rows[0]?.locked) {
    throw new Error("Another PRD catalogue sync appears to be running.");
  }
}

async function releaseSyncLock(sql: Db) {
  await sql`select pg_advisory_unlock(hashtext('mattanutra-prd-live-catalogue-sync'))`;
}

async function applyTables(
  sql: Db,
  tables: SnapshotTables,
  apply: boolean
): Promise<Record<string, PrdCatalogueTableReport>> {
  const reports: Record<string, PrdCatalogueTableReport> = {};

  for (const tableName of CATALOGUE_SYNC_ORDER) {
    const policy = PRD_LIVE_CATALOGUE_TABLE_POLICIES[tableName];
    const rows = tables[tableName] ?? [];

    if (!policy) {
      throw new Error(`Missing PRD live catalogue sync policy for ${tableName}.`);
    }

    const targetRowsBefore = await tableRowCount(sql, tableName);
    const targetOnlyRows =
      policy.mode === "preserve_parent"
        ? await sourceMissingTargetRows(sql, tableName, policy.conflictColumns, rows)
        : null;
    const deletedScopedRows =
      apply && policy.mode === "replace_scoped_child"
        ? await deleteScopedChildren({ policy, sql, tableName, tables })
        : 0;
    const upsertedRows = apply
      ? await upsertRows({
          conflictColumns: policy.conflictColumns,
          mode: policy.mode,
          rows,
          sql,
          tableName
        })
      : 0;

    reports[tableName] = {
      conflictColumns: policy.conflictColumns,
      deletedScopedRows,
      mode: policy.mode,
      sourceRows: rows.length,
      targetOnlyRows,
      targetRowsBefore,
      upsertedRows
    };
  }

  return reports;
}

export async function runPrdLiveCatalogueSync(
  input: RunPrdLiveCatalogueSyncInput
): Promise<PrdLiveCatalogueSyncSummary> {
  const outputDir = input.outputDir ?? defaultOutputDir();
  const payload = JSON.parse(await readFile(input.inputPath, "utf8")) as SnapshotPayload;

  if (payload.formatVersion !== 1 || !payload.tables || typeof payload.tables !== "object") {
    throw new Error("Snapshot format is not recognized.");
  }

  const rawTables = payload.tables as Record<string, unknown>;
  const missingTables = catalogueSnapshotTableNames().filter((tableName) => !(tableName in rawTables));
  const tables = normalizeSnapshotTables(rawTables);

  if (missingTables.length > 0) {
    throw new Error(`Snapshot is missing required tables: ${missingTables.join(", ")}`);
  }

  if (!input.skipValidation) {
    const validation = validateCuratedMasterSnapshot(tables, {
      allowIncompleteTranslations: input.allowIncompleteTranslations,
      strict: input.strictMasterData
    });

    if (!validation.ok) {
      throw new Error(
        `Snapshot failed curated master validation: ${validation.errors.join("; ")}`
      );
    }
  }

  await acquireSyncLock(input.sql);

  try {
    const conflicts = await findNaturalKeyConflicts(input.sql, tables);
    const beforeProtected = await captureProtectedDataSnapshot(input.sql);
    let afterProtected: ProtectedDataSnapshot | null = null;
    let protectedDataIssues: ProtectedDataVerificationIssue[] = [];
    let tableReports: Record<string, PrdCatalogueTableReport>;

    if (conflicts.length > 0) {
      tableReports = await applyTables(input.sql, tables, false);
    } else if (input.apply) {
      tableReports = await applyTables(input.sql, tables, true);
      afterProtected = await captureProtectedDataSnapshot(input.sql);
      protectedDataIssues = compareProtectedDataSnapshots(
        beforeProtected,
        afterProtected
      ).issues;
    } else {
      tableReports = await applyTables(input.sql, tables, false);
    }

    const summary: PrdLiveCatalogueSyncSummary = {
      applied: Boolean(input.apply && conflicts.length < 1 && protectedDataIssues.length < 1),
      blocked: conflicts.length > 0 || protectedDataIssues.length > 0,
      conflicts,
      dryRun: !input.apply,
      generatedAt: new Date().toISOString(),
      inputPath: input.inputPath,
      protectedDataIssues,
      reportDirectory: outputDir,
      tables: tableReports
    };

    await writeReports({
      afterProtected,
      beforeProtected,
      conflicts,
      outputDir,
      summary
    });

    if (protectedDataIssues.length > 0) {
      throw new Error(
        `Protected PRD data verification failed; report written to ${outputDir}: ${protectedDataIssues
          .map((issue) => `${issue.table}:${issue.issue}`)
          .join(", ")}`
      );
    }

    return summary;
  } finally {
    await releaseSyncLock(input.sql);
  }
}
