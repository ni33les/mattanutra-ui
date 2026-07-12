import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST,
  RETAIL_CATALOGUE_IDENTITY_COLUMNS,
  RETAIL_CATALOGUE_ORG_SLUGS,
  RETAIL_CATALOGUE_TABLES,
  RETAIL_STOCK_LIVE_COLUMNS,
  quoteCatalogueAlignmentIdentifier
} from "@/lib/catalogue-alignment";
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

type RetailSnapshot = Readonly<{
  tables?: {
    organisations?: Row[];
    retail_product_stock?: Row[];
    retail_sellable_products?: Row[];
  };
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
      throw new Error(`Refusing DEV retail catalogue alignment against unexpected database "${label}".`);
    }
    return;
  }

  throw new Error("--target-env=dev or --target-env=prd is required.");
}

function assertApplyConfirmation(environment: string) {
  if (environment === "prd" || environment === "prod" || environment === "production") {
    assertPrdPreserveConfirmation();
    assertPrdApplyConfirmation({
      envName: "MATTANUTRA_CONFIRM_PRD_RETAIL_CATALOGUE_ALIGN",
      expected: "mirror",
      label: "PRD retail catalogue alignment"
    });
    return;
  }

  if (environment === "dev" && process.env.MATTANUTRA_CONFIRM_DEV_RETAIL_CATALOGUE_ALIGN !== "mirror") {
    throw new Error(
      "Refusing DEV retail catalogue alignment without MATTANUTRA_CONFIRM_DEV_RETAIL_CATALOGUE_ALIGN=mirror."
    );
  }
}

function normalizeRows(rows: unknown): Row[] {
  return Array.isArray(rows)
    ? rows.filter((row): row is Row => Boolean(row) && typeof row === "object")
    : [];
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

async function targetOrganisations(sql: Db, slugs: readonly string[]) {
  const rows = await sql<Array<{ id: string; slug: string }>>`
    select id::text, slug
    from public.organisations
    where slug = any(${[...slugs]}::text[])
      and organisation_type = 'tenant'
    order by slug
  `;
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));

  if (missing.length > 0) {
    if (hasArg("target-existing-orgs-only") && bySlug.size > 0) {
      return bySlug;
    }

    throw new Error(`Target is missing tenant organisation(s): ${missing.join(", ")}`);
  }

  return bySlug;
}

function sourceOrganisationMap(snapshotRows: readonly Row[], slugs: readonly string[]) {
  const byId = new Map<string, string>();

  for (const row of snapshotRows) {
    if (typeof row.id === "string" && typeof row.slug === "string") {
      byId.set(row.id, row.slug);
    }
  }

  const missing = slugs.filter(
    (slug) => ![...byId.values()].includes(slug)
  );

  if (missing.length > 0) {
    throw new Error(
      `Retail snapshot is missing organisation mapping(s): ${missing.join(", ")}. Recreate it with the updated retail:snapshot script.`
    );
  }

  return byId;
}

function rowsForTargetSlugs(
  rows: readonly Row[],
  input: Readonly<{
    sourceOrgById: ReadonlyMap<string, string>;
    targetSlugs: ReadonlySet<string>;
  }>
) {
  return rows.filter((row) => {
    const sourceOrgId = typeof row.organisation_id === "string" ? row.organisation_id : "";
    const slug = input.sourceOrgById.get(sourceOrgId);

    return Boolean(slug && input.targetSlugs.has(slug));
  });
}

function remapRows(
  rows: readonly Row[],
  input: Readonly<{
    sourceOrgById: ReadonlyMap<string, string>;
    targetOrgBySlug: ReadonlyMap<string, string>;
  }>
) {
  return rows.map((row) => {
    const sourceOrgId = typeof row.organisation_id === "string" ? row.organisation_id : "";
    const slug = input.sourceOrgById.get(sourceOrgId);
    const targetOrgId = slug ? input.targetOrgBySlug.get(slug) : null;

    if (!slug || !targetOrgId) {
      throw new Error(`Retail row references unmapped organisation ${sourceOrgId}`);
    }

    return {
      ...row,
      organisation_id: targetOrgId
    };
  });
}

function productIds(rows: readonly Row[]) {
  return [
    ...new Set(
      rows
        .map((row) => row.product_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ];
}

async function assertProductsExist(sql: Db, ids: readonly string[]) {
  if (ids.length < 1) {
    return;
  }

  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.products
    where id = any(${[...ids]}::uuid[])
  `;
  const existing = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !existing.has(id));

  if (missing.length > 0) {
    throw new Error(
      `Target platform catalogue is missing ${missing.length} retail product(s): ${missing
        .slice(0, 10)
        .join(", ")}`
    );
  }
}

async function approvedProductIds(sql: Db, ids: readonly string[]) {
  if (ids.length < 1) {
    return new Set<string>();
  }

  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.products
    where id = any(${[...ids]}::uuid[])
      and status = 'approved'
  `;

  return new Set(rows.map((row) => row.id));
}

async function fetchTargetRows(
  sql: Db,
  tableName: string,
  organisationIds: readonly string[]
) {
  return sql<Row[]>`
    select *
    from public.${sql(tableName)}
    where organisation_id = any(${[...organisationIds]}::uuid[])
  `;
}

function keyFor(row: Row) {
  return `${row.organisation_id ?? ""}:${row.product_id ?? ""}`;
}

async function markTargetOnlyDeleted(
  sql: Db,
  tableName: string,
  input: Readonly<{
    organisationIds: readonly string[];
    sourceKeys: ReadonlySet<string>;
  }>
) {
  const targetRows = await fetchTargetRows(sql, tableName, input.organisationIds);
  const targetOnlyRows = targetRows.filter(
    (row) =>
      row.status !== "deleted" &&
      !input.sourceKeys.has(keyFor(row)) &&
      typeof row.organisation_id === "string" &&
      typeof row.product_id === "string"
  );

  if (targetOnlyRows.length < 1) {
    return 0;
  }

  let count = 0;

  for (const row of targetOnlyRows) {
    const organisationId = typeof row.organisation_id === "string" ? row.organisation_id : "";
    const productId = typeof row.product_id === "string" ? row.product_id : "";

    if (!organisationId || !productId) {
      continue;
    }

    const result = await sql.unsafe(
      `
        update public.${quoteCatalogueAlignmentIdentifier(tableName)}
        set
          status = 'deleted',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'catalogueAlignedDeletedAt', now(),
            'deleteReason', 'uat_retail_catalogue_alignment'
          ),
          updated_at = now()
        where organisation_id = $1::uuid
          and product_id = $2::uuid
          and status <> 'deleted'
      `,
      [organisationId, productId]
    );

    count += result.count;
  }

  return count;
}

async function upsertRetailRows(
  sql: Db,
  tableName: string,
  rows: readonly Row[]
) {
  if (rows.length < 1) {
    return 0;
  }

  const targetColumns = await tableColumns(sql, tableName);
  const preserveColumns = new Set<string>(RETAIL_CATALOGUE_IDENTITY_COLUMNS);

  if (tableName === "retail_product_stock") {
    for (const column of RETAIL_STOCK_LIVE_COLUMNS) {
      preserveColumns.add(column);
    }
  }

  const identityColumns = RETAIL_CATALOGUE_IDENTITY_COLUMNS as readonly string[];
  const insertColumns = targetColumns.filter((column) =>
    !identityColumns.includes(column) ||
    column === "organisation_id" ||
    column === "product_id"
  ).filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );
  const updateColumns = insertColumns.filter(
    (column) => !preserveColumns.has(column) && column !== "organisation_id" && column !== "product_id"
  );
  const updateSql = updateColumns
    .map((column) => {
      const quoted = quoteCatalogueAlignmentIdentifier(column);

      return `${quoted} = excluded.${quoted}`;
    })
    .join(", ");
  let count = 0;

  for (let index = 0; index < rows.length; index += 150) {
    const chunk = rows.slice(index, index + 150);

    await sql`
      insert into public.${sql(tableName)}
      ${sql(chunk, ...insertColumns)}
      on conflict (organisation_id, product_id)
      ${sql.unsafe(updateSql ? `do update set ${updateSql}` : "do nothing")}
    `;
    count += chunk.length;
  }

  return count;
}

function protectedDataIssues(
  before: ProtectedDataSnapshot,
  after: ProtectedDataSnapshot
) {
  const allowlist = new Set<string>(PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST);
  const issues: Array<{ after: unknown; before: unknown; issue: string; table: string }> = [];

  for (const [tableName, beforeTable] of Object.entries(before.tables)) {
    if (allowlist.has(tableName)) {
      continue;
    }

    const afterTable = after.tables[tableName];

    if (!afterTable) {
      continue;
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
  }

  return issues;
}

async function writeSummary(outputDir: string, summary: unknown) {
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "retail-catalogue-alignment-summary.json");

  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return outputPath;
}

async function main() {
  const inputPath = argValue("snapshot") ?? argValue("input");

  if (!inputPath) {
    throw new Error("--snapshot=<uat-retail-snapshot.json> is required.");
  }

  const apply = hasArg("apply");
  const environment = targetEnv();
  const connection = dbUrl();
  const outputDir = argValue(
    "out",
    path.join("reports", "retail-catalogue-alignment", `${environment || "unknown"}-${timestampSlug()}`)
  )!;

  assertConnectionMatchesEnv(connection, environment);

  if (apply) {
    assertApplyConfirmation(environment);
  }

  process.env.DB_URL = connection!;

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured.");
  }

  const targetOrgBySlug = await targetOrganisations(sql, RETAIL_CATALOGUE_ORG_SLUGS);
  const targetSlugs = [...targetOrgBySlug.keys()];
  const targetSlugSet = new Set(targetSlugs);
  const missingTargetOrganisationSlugs = RETAIL_CATALOGUE_ORG_SLUGS.filter(
    (slug) => !targetOrgBySlug.has(slug)
  );
  const snapshot = JSON.parse(await readFile(inputPath, "utf8")) as RetailSnapshot;
  const sourceOrgById = sourceOrganisationMap(
    normalizeRows(snapshot.tables?.organisations),
    targetSlugs
  );
  const targetOrgIds = [...targetOrgBySlug.values()];
  const rawSourceRows = {
    retail_product_stock: remapRows(
      rowsForTargetSlugs(normalizeRows(snapshot.tables?.retail_product_stock), {
        sourceOrgById,
        targetSlugs: targetSlugSet
      }),
      {
        sourceOrgById,
        targetOrgBySlug
      }
    ),
    retail_sellable_products: remapRows(
      rowsForTargetSlugs(normalizeRows(snapshot.tables?.retail_sellable_products), {
        sourceOrgById,
        targetSlugs: targetSlugSet
      }),
      {
        sourceOrgById,
        targetOrgBySlug
      }
    )
  };
  const allProductIds = [
    ...new Set([
      ...productIds(rawSourceRows.retail_product_stock),
      ...productIds(rawSourceRows.retail_sellable_products)
    ])
  ];

  await assertProductsExist(sql, allProductIds);

  const approvedIds = await approvedProductIds(sql, allProductIds);
  const sourceRows = {
    retail_product_stock: rawSourceRows.retail_product_stock.filter(
      (row: Row) => typeof row.product_id === "string" && approvedIds.has(row.product_id)
    ),
    retail_sellable_products: rawSourceRows.retail_sellable_products.filter(
      (row: Row) => typeof row.product_id === "string" && approvedIds.has(row.product_id)
    )
  };
  const rejectedSourceRows = {
    retail_product_stock:
      rawSourceRows.retail_product_stock.length - sourceRows.retail_product_stock.length,
    retail_sellable_products:
      rawSourceRows.retail_sellable_products.length - sourceRows.retail_sellable_products.length
  };

  const sourceKeys = Object.fromEntries(
    RETAIL_CATALOGUE_TABLES.map((tableName) => [
      tableName,
      new Set(sourceRows[tableName].map(keyFor))
    ])
  ) as Record<(typeof RETAIL_CATALOGUE_TABLES)[number], Set<string>>;
  const dryRunReport = Object.fromEntries(
    await Promise.all(
      RETAIL_CATALOGUE_TABLES.map(async (tableName) => {
        const targetRows = await fetchTargetRows(sql, tableName, targetOrgIds);

        return [
          tableName,
          {
            rejectedSourceRows: rejectedSourceRows[tableName],
            sourceRows: sourceRows[tableName].length,
            targetRows: targetRows.filter((row) => row.status !== "deleted").length,
            targetOnlyRows: targetRows.filter(
              (row) => row.status !== "deleted" && !sourceKeys[tableName].has(keyFor(row))
            ).length
          }
        ];
      })
    )
  );
  let applyReport: unknown = null;
  let protectedIssues: ReturnType<typeof protectedDataIssues> = [];

  if (apply) {
    applyReport = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as Db;

      if (environment.startsWith("prd")) {
        await tx`set transaction isolation level repeatable read`;
      }

      const protectedBefore = environment.startsWith("prd")
        ? await captureProtectedDataSnapshot(tx)
        : null;
      const upserted: Record<string, number> = {};
      const markedDeleted: Record<string, number> = {};

      for (const tableName of RETAIL_CATALOGUE_TABLES) {
        upserted[tableName] = await upsertRetailRows(tx, tableName, sourceRows[tableName]);
        markedDeleted[tableName] = await markTargetOnlyDeleted(tx, tableName, {
          organisationIds: targetOrgIds,
          sourceKeys: sourceKeys[tableName]
        });
      }

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

      return {
        markedDeleted,
        upserted
      };
    });
  }

  const summary = {
    applied: apply,
    applyReport,
    dryRun: !apply,
    generatedAt: new Date().toISOString(),
    inputPath,
    missingTargetOrganisationSlugs,
    protectedIssues,
    report: dryRunReport,
    targetEnv: environment
  };
  const outputPath = await writeSummary(outputDir, summary);

  console.log(JSON.stringify({ ...summary, outputPath }, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[retail:catalogue-align] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
