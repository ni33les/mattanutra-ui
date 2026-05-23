import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getSql } from "@/lib/db";
import {
  CATALOGUE_RELOAD_ORDER,
  CATALOGUE_TRUNCATE_ORDER
} from "@/lib/catalogue-snapshot-tables";

type ColumnMeta = Readonly<{
  column_name: string;
  data_type: string;
  table_name: string;
  udt_name: string;
}>;

type ConstraintColumn = Readonly<{
  column_name: string;
  constraint_name: string;
  constraint_type: string;
  table_name: string;
}>;

type PrimaryKeyMap = Record<string, string[]>;

const APPEND_ONLY_TABLES = new Set([
  "product_admin_audit",
  "product_versions",
  "supplement_admin_audit",
  "supplement_safety_limits",
  "supplement_versions"
]);

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

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

function columnList(columns: readonly string[]) {
  return columns.map(quoteIdent).join(", ");
}

function scalarArrayType(udtName: string) {
  if (udtName === "_text") {
    return "text[]";
  }

  if (udtName === "_uuid") {
    return "uuid[]";
  }

  if (udtName === "_int4") {
    return "integer[]";
  }

  if (udtName === "_numeric") {
    return "numeric[]";
  }

  return `${udtName.replace(/^_/, "")}[]`;
}

function typedLiteral(value: unknown, column: ColumnMeta): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (column.data_type === "ARRAY") {
    const arrayType = scalarArrayType(column.udt_name);
    const values = Array.isArray(value) ? value : [value];

    if (values.length === 0) {
      return `array[]::${arrayType}`;
    }

    const inner = values
      .map((item) => typedArrayElementLiteral(item, column.udt_name))
      .join(", ");
    return `array[${inner}]::${arrayType}`;
  }

  if (column.udt_name === "json" || column.udt_name === "jsonb") {
    return `${quoteLiteral(JSON.stringify(value))}::${column.udt_name}`;
  }

  if (column.udt_name === "uuid") {
    return `${quoteLiteral(String(value))}::uuid`;
  }

  if (column.udt_name === "bool") {
    return value ? "true" : "false";
  }

  if (column.udt_name === "int2" || column.udt_name === "int4" || column.udt_name === "int8") {
    return integerLiteral(value);
  }

  if (column.udt_name === "numeric" || column.udt_name === "float4" || column.udt_name === "float8") {
    return numericLiteral(value, column.udt_name);
  }

  if (column.udt_name === "date") {
    return `${quoteLiteral(dateString(value))}::date`;
  }

  if (column.udt_name === "timestamp" || column.udt_name === "timestamptz") {
    return `${quoteLiteral(dateString(value))}::${column.udt_name}`;
  }

  return quoteLiteral(String(value));
}

function typedArrayElementLiteral(value: unknown, udtName: string) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (udtName === "_uuid") {
    return `${quoteLiteral(String(value))}::uuid`;
  }

  if (udtName === "_int4") {
    return integerLiteral(value);
  }

  if (udtName === "_numeric") {
    return numericLiteral(value, "numeric");
  }

  return quoteLiteral(String(value));
}

function integerLiteral(value: unknown) {
  const stringValue = String(value);

  if (/^-?\d+$/.test(stringValue)) {
    return stringValue;
  }

  return `${quoteLiteral(stringValue)}::integer`;
}

function numericLiteral(value: unknown, typeName: string) {
  const stringValue = String(value);

  if (/^-?(?:\d+|\d+\.\d+|\.\d+)(?:e[+-]?\d+)?$/i.test(stringValue)) {
    return stringValue;
  }

  return `${quoteLiteral(stringValue)}::${typeName}`;
}

function dateString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function chunkRows<T>(rows: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push([...rows.slice(index, index + size)]);
  }

  return chunks;
}

function normalizeRows(tableName: string, rows: readonly Record<string, unknown>[]) {
  if (tableName !== "product_imports") {
    return rows;
  }

  return rows.map((row) => ({
    ...row,
    review_task_id: null
  }));
}

function upsertClause(tableName: string, columns: readonly string[], primaryKey: readonly string[]) {
  if (primaryKey.length < 1) {
    return "";
  }

  const conflictTarget = `(${columnList(primaryKey)})`;

  if (APPEND_ONLY_TABLES.has(tableName)) {
    return `on conflict ${conflictTarget} do nothing`;
  }

  const updateColumns = columns.filter((column) => !primaryKey.includes(column));

  if (updateColumns.length < 1) {
    return `on conflict ${conflictTarget} do nothing`;
  }

  const assignments = updateColumns
    .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
    .join(",\n  ");

  return `on conflict ${conflictTarget} do update set\n  ${assignments}`;
}

function insertSql(
  tableName: string,
  rows: readonly Record<string, unknown>[],
  columns: readonly ColumnMeta[],
  primaryKey: readonly string[]
) {
  const columnNames = columns.map((column) => column.column_name);
  const values = rows
    .map((row) => {
      const rowValues = columns.map((column) => typedLiteral(row[column.column_name], column));
      return `  (${rowValues.join(", ")})`;
    })
    .join(",\n");

  return [
    `insert into public.${quoteIdent(tableName)} (${columnList(columnNames)})`,
    "values",
    values,
    upsertClause(tableName, columnNames, primaryKey),
    ";"
  ]
    .filter(Boolean)
    .join("\n");
}

function sqlHeader(title: string) {
  return [
    "-- MattaNutra rollout SQL",
    `-- ${title}`,
    `-- Generated at ${new Date().toISOString()} from the configured DEV DB.`,
    "-- Review before running against UAT or PRD.",
    ""
  ].join("\n");
}

async function extractSchemaSql(scriptPath: string) {
  const source = await readFile(scriptPath, "utf8");
  const match = /const schemaSql = `([\s\S]*?)`;\n\nconst sql = getSql\(\);/.exec(source);

  if (!match) {
    throw new Error(`Could not extract schemaSql from ${scriptPath}`);
  }

  return match[1] ?? "";
}

async function writeSchemaFiles(outputDir: string) {
  const [paymentSchema, versionSchema, fullSchema] = await Promise.all([
    extractSchemaSql(resolve("scripts/apply-payment-schema.ts")),
    extractSchemaSql(resolve("scripts/apply-core-versioned-model-schema.ts")),
    readFile(resolve("db-schema.sql"), "utf8")
  ]);

  await writeFile(
    resolve(outputDir, "00-db-schema-safe-patch.sql"),
    [
      sqlHeader("Non-destructive schema patch for payment and core version tables."),
      "begin;",
      paymentSchema.trim(),
      "",
      versionSchema.trim(),
      "commit;",
      ""
    ].join("\n"),
    "utf8"
  );

  if (!hasArg("no-full-schema")) {
    await writeFile(
      resolve(outputDir, "01-db-schema-full-destructive-reference.sql"),
      [
        "-- WARNING: this is the full destructive rebuild schema copied from db-schema.sql.",
        "-- Use only when you intentionally want to reset the target database.",
        "",
        fullSchema
      ].join("\n"),
      "utf8"
    );
  }
}

function clearCatalogueSql() {
  const truncateList = CATALOGUE_TRUNCATE_ORDER
    .map((tableName) => `public.${quoteIdent(tableName)}`)
    .join(",\n  ");

  return [
    sqlHeader("Optional destructive catalogue clear. Run only before reseeding catalogue tables."),
    "begin;",
    "truncate table",
    `  ${truncateList}`,
    "restart identity cascade;",
    "commit;",
    ""
  ].join("\n");
}

function verifySql(counts: Record<string, number>) {
  const selects = CATALOGUE_RELOAD_ORDER.map((tableName) => {
    const expected = counts[tableName] ?? 0;
    return [
      `select ${quoteLiteral(tableName)} as table_name,`,
      `       ${expected}::integer as expected_count,`,
      `       count(*)::integer as actual_count,`,
      `       case when count(*)::integer >= ${expected} then 'ok' else 'short' end as status`,
      `from public.${quoteIdent(tableName)}`
    ].join("\n");
  }).join("\nunion all\n");

  return [
    sqlHeader("Catalogue row-count verification."),
    selects,
    "order by table_name;",
    ""
  ].join("\n");
}

function buildPrimaryKeyMap(rows: readonly ConstraintColumn[]) {
  const grouped: PrimaryKeyMap = {};

  for (const row of rows) {
    if (row.constraint_type !== "PRIMARY KEY") {
      continue;
    }

    grouped[row.table_name] = [...(grouped[row.table_name] ?? []), row.column_name];
  }

  return grouped;
}

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured.");
}

const slug = timestampSlug();
const outputDir = resolve(argValue("out-dir", `/private/tmp/mattanutra-db-rollout-${slug}`) ?? `/private/tmp/mattanutra-db-rollout-${slug}`);
const chunkSize = Number.parseInt(argValue("chunk-size", "250") ?? "250", 10);

if (!Number.isInteger(chunkSize) || chunkSize < 1) {
  throw new Error("--chunk-size must be a positive integer.");
}

await mkdir(outputDir, { recursive: true });
await writeSchemaFiles(outputDir);
await writeFile(resolve(outputDir, "10-db-data-clear-catalogue-optional.sql"), clearCatalogueSql(), "utf8");

const columnRows = await sql<ColumnMeta[]>`
  select table_name, column_name, data_type, udt_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = any(${CATALOGUE_RELOAD_ORDER})
  order by table_name, ordinal_position asc
`;
const constraintRows = await sql<ConstraintColumn[]>`
  select
    tc.table_name,
    kcu.column_name,
    tc.constraint_name,
    tc.constraint_type
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_schema = kcu.constraint_schema
   and tc.constraint_name = kcu.constraint_name
   and tc.table_name = kcu.table_name
  where tc.table_schema = 'public'
    and tc.table_name = any(${CATALOGUE_RELOAD_ORDER})
    and tc.constraint_type = 'PRIMARY KEY'
  order by tc.table_name, tc.constraint_name, kcu.ordinal_position
`;
const primaryKeys = buildPrimaryKeyMap(constraintRows);
const columnsByTable = Object.groupBy(columnRows, (row) => row.table_name) as Record<string, ColumnMeta[]>;
const counts: Record<string, number> = {};
const files: string[] = [
  "00-db-schema-safe-patch.sql",
  ...(hasArg("no-full-schema") ? [] : ["01-db-schema-full-destructive-reference.sql"]),
  "10-db-data-clear-catalogue-optional.sql"
];

let tableIndex = 20;

for (const tableName of CATALOGUE_RELOAD_ORDER) {
  const columns = columnsByTable[tableName] ?? [];
  const primaryKey = primaryKeys[tableName] ?? [];

  if (columns.length < 1) {
    throw new Error(`No column metadata found for public.${tableName}`);
  }

  if (primaryKey.length < 1) {
    throw new Error(`No primary key found for public.${tableName}`);
  }

  const orderBy = primaryKey.map(quoteIdent).join(", ");
  const rows = normalizeRows(
    tableName,
    await sql.unsafe<Record<string, unknown>[]>(
      `select * from public.${quoteIdent(tableName)} order by ${orderBy}`
    )
  );
  counts[tableName] = rows.length;

  const chunks = chunkRows(rows, chunkSize);

  if (chunks.length < 1) {
    const fileName = `${String(tableIndex).padStart(2, "0")}-db-data-${tableName}-empty.sql`;
    await writeFile(
      resolve(outputDir, fileName),
      [
        sqlHeader(`No rows for public.${tableName}.`),
        `-- public.${tableName} has no rows in the source database.`,
        ""
      ].join("\n"),
      "utf8"
    );
    files.push(fileName);
    tableIndex += 1;
    continue;
  }

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const fileName = `${String(tableIndex).padStart(2, "0")}-db-data-${tableName}-${String(chunkIndex + 1).padStart(3, "0")}.sql`;
    await writeFile(
      resolve(outputDir, fileName),
      [
        sqlHeader(`Seed public.${tableName}, batch ${chunkIndex + 1} of ${chunks.length}.`),
        "begin;",
        insertSql(tableName, chunk, columns, primaryKey),
        "commit;",
        ""
      ].join("\n"),
      "utf8"
    );
    files.push(fileName);
  }

  tableIndex += 1;
}

await writeFile(resolve(outputDir, "99-db-data-verify-counts.sql"), verifySql(counts), "utf8");
files.push("99-db-data-verify-counts.sql");

const readme = [
  "# MattaNutra DB Rollout SQL",
  "",
  `Generated at: ${new Date().toISOString()}`,
  "",
  "## Intended Use",
  "",
  "- `00-db-schema-safe-patch.sql`: non-destructive schema patch for payment/core version tables.",
  "- `01-db-schema-full-destructive-reference.sql`: full rebuild schema copied from `db-schema.sql`; use only for an intentional reset.",
  "- `10-db-data-clear-catalogue-optional.sql`: catalogue-only truncate; run only when you want the target catalogue to exactly mirror the exported source.",
  "- `20+ db-data` files: ordered catalogue seed/upsert batches.",
  "- `99-db-data-verify-counts.sql`: row-count check after import.",
  "",
  "For UAT reset-style rollout: backup UAT, run the full destructive schema or your existing reset, then run the data batches in filename order.",
  "",
  "For PRD migration-style rollout: backup PRD, run `00-db-schema-safe-patch.sql`, then review whether catalogue clear is appropriate. If not clearing, run data batches in filename order and stop on any unique-key conflict instead of forcing it.",
  "",
  "Append-only catalogue/version/audit tables use `ON CONFLICT DO NOTHING`; current projection tables use `ON CONFLICT DO UPDATE`.",
  "",
  "## Source Counts",
  "",
  ...CATALOGUE_RELOAD_ORDER.map((tableName) => `- ${tableName}: ${counts[tableName] ?? 0}`),
  ""
].join("\n");
await writeFile(resolve(outputDir, "README.md"), readme, "utf8");

const manifest = {
  chunkSize,
  counts,
  createdAt: new Date().toISOString(),
  files,
  outputDir,
  source: {
    database: "DB_CONNECTION",
    script: basename(import.meta.url)
  }
};
await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await sql.end({ timeout: 1 });

console.log(JSON.stringify({
  counts,
  files: files.length,
  outputDir,
  status: "ok"
}, null, 2));
