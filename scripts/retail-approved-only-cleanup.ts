import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  RETAIL_CATALOGUE_ORG_SLUGS,
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
type RetailCatalogueTable = "retail_sellable_products" | "retail_product_stock";

const RETAIL_CATALOGUE_TABLES: readonly RetailCatalogueTable[] = [
  "retail_sellable_products",
  "retail_product_stock"
];
const PROTECTED_ALLOWLIST = new Set<string>(RETAIL_CATALOGUE_TABLES);

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

function orgSlugs() {
  const value = argValue("org-slugs");

  return value
    ? value.split(",").map((slug) => slug.trim()).filter(Boolean)
    : [...RETAIL_CATALOGUE_ORG_SLUGS];
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

  if (environment === "uat") {
    if (!/(uat|mn-uat|mattanutra-uat)/i.test(label) || /(prd|prod|production)/i.test(label)) {
      throw new Error(`Refusing UAT approved-only cleanup against unexpected database "${label}".`);
    }
    return;
  }

  if (environment === "dev") {
    if (!/(dev|mn-dev|mattanutra-dev)/i.test(label) || /(uat|prd|prod|production)/i.test(label)) {
      throw new Error(`Refusing DEV approved-only cleanup against unexpected database "${label}".`);
    }
    return;
  }

  throw new Error("--target-env=dev, --target-env=uat, or --target-env=prd is required.");
}

function assertApplyConfirmation(environment: string) {
  if (environment === "prd" || environment === "prod" || environment === "production") {
    assertPrdPreserveConfirmation();
    assertPrdApplyConfirmation({
      envName: "MATTANUTRA_CONFIRM_PRD_RETAIL_APPROVED_ONLY_CLEANUP",
      expected: "delete",
      label: "PRD retail approved-only cleanup"
    });
    return;
  }

  if (
    environment === "uat" &&
    process.env.MATTANUTRA_CONFIRM_UAT_RETAIL_APPROVED_ONLY_CLEANUP !== "delete"
  ) {
    throw new Error(
      "Refusing UAT retail approved-only cleanup without MATTANUTRA_CONFIRM_UAT_RETAIL_APPROVED_ONLY_CLEANUP=delete."
    );
  }

  if (
    environment === "dev" &&
    process.env.MATTANUTRA_CONFIRM_DEV_RETAIL_APPROVED_ONLY_CLEANUP !== "delete"
  ) {
    throw new Error(
      "Refusing DEV retail approved-only cleanup without MATTANUTRA_CONFIRM_DEV_RETAIL_APPROVED_ONLY_CLEANUP=delete."
    );
  }
}

async function targetOrganisations(sql: Db, slugs: readonly string[]) {
  const rows = await sql<Array<{ id: string; slug: string }>>`
    select id::text, slug
    from public.organisations
    where slug = any(${[...slugs]}::text[])
      and organisation_type = 'tenant'
    order by slug
  `;

  if (rows.length < 1) {
    throw new Error(`No target retail organisations found for ${slugs.join(", ")}`);
  }

  return {
    ids: rows.map((row) => row.id),
    missingSlugs: slugs.filter((slug) => !rows.some((row) => row.slug === slug)),
    rows
  };
}

async function retailBreakdown(sql: Db, organisationIds: readonly string[]) {
  return sql`
    select
      source.table_name,
      organisations.slug,
      products.status as product_status,
      source.status as retail_status,
      count(*)::int as rows,
      coalesce(sum(source.stock_quantity), 0)::int as stock_quantity
    from (
      select
        'retail_sellable_products'::text as table_name,
        organisation_id,
        product_id,
        status,
        0::int as stock_quantity
      from public.retail_sellable_products
      union all
      select
        'retail_product_stock'::text as table_name,
        organisation_id,
        product_id,
        status,
        stock_quantity
      from public.retail_product_stock
    ) source
    join public.organisations
      on organisations.id = source.organisation_id
    join public.products
      on products.id = source.product_id
    where source.organisation_id = any(${[...organisationIds]}::uuid[])
    group by source.table_name, organisations.slug, products.status, source.status
    order by source.table_name, organisations.slug, products.status, source.status
  `;
}

async function activeUnapprovedCounts(sql: Db, organisationIds: readonly string[]) {
  const rows = await sql<Array<{
    active_rows: number;
    stock_quantity: number;
    table_name: RetailCatalogueTable;
  }>>`
    select
      source.table_name,
      count(*)::int as active_rows,
      coalesce(sum(source.stock_quantity), 0)::int as stock_quantity
    from (
      select
        'retail_sellable_products'::text as table_name,
        organisation_id,
        product_id,
        status,
        0::int as stock_quantity
      from public.retail_sellable_products
      union all
      select
        'retail_product_stock'::text as table_name,
        organisation_id,
        product_id,
        status,
        stock_quantity
      from public.retail_product_stock
    ) source
    join public.products
      on products.id = source.product_id
    where source.organisation_id = any(${[...organisationIds]}::uuid[])
      and source.status <> 'deleted'
      and products.status <> 'approved'
    group by source.table_name
    order by source.table_name
  `;

  return Object.fromEntries(
    RETAIL_CATALOGUE_TABLES.map((tableName) => {
      const row = rows.find((candidate) => candidate.table_name === tableName);

      return [
        tableName,
        {
          activeRows: Number(row?.active_rows ?? 0),
          stockQuantity: Number(row?.stock_quantity ?? 0)
        }
      ];
    })
  );
}

async function dependencyCounts(sql: Db, organisationIds: readonly string[]) {
  return sql<Array<{ rows: number; table_name: string }>>`
    with unapproved as (
      select stock.id, stock.organisation_id, stock.product_id
      from public.retail_product_stock stock
      join public.products products on products.id = stock.product_id
      where stock.organisation_id = any(${[...organisationIds]}::uuid[])
        and stock.status <> 'deleted'
        and products.status <> 'approved'
    )
    select 'retail_customer_order_lines' as table_name, count(*)::int as rows
    from public.retail_customer_order_lines lines
    join unapproved on unapproved.organisation_id = lines.organisation_id
      and unapproved.product_id = lines.product_id
    union all
    select 'retail_order_allocations', count(*)::int
    from public.retail_order_allocations allocations
    join unapproved on unapproved.organisation_id = allocations.organisation_id
      and unapproved.product_id = allocations.product_id
    union all
    select 'retail_stock_movements', count(*)::int
    from public.retail_stock_movements movements
    join unapproved on unapproved.organisation_id = movements.organisation_id
      and unapproved.product_id = movements.product_id
    union all
    select 'retail_stock_lots', count(*)::int
    from public.retail_stock_lots lots
    join unapproved on unapproved.id = lots.retail_product_stock_id
    union all
    select 'retail_product_stock_snapshots', count(*)::int
    from public.retail_product_stock_snapshots snapshots
    join unapproved on unapproved.id = snapshots.retail_product_stock_id
    union all
    select 'retail_stock_reorder_advice', count(*)::int
    from public.retail_stock_reorder_advice advice
    join unapproved on unapproved.id = advice.retail_product_stock_id
    union all
    select 'retail_shopping_list_lines', count(*)::int
    from public.retail_shopping_list_lines lines
    join unapproved on unapproved.organisation_id = lines.organisation_id
      and unapproved.product_id = lines.product_id
    order by table_name
  `;
}

const HISTORICAL_CLEANUP_DEPENDENCIES = new Set(["retail_customer_order_lines"]);

function blockers(input: Readonly<{
  counts: Awaited<ReturnType<typeof activeUnapprovedCounts>>;
  dependencies: Array<{ rows: number; table_name: string }>;
}>) {
  const issues: string[] = [];

  if (input.counts.retail_product_stock.stockQuantity !== 0) {
    issues.push(`nonzero_stock=${input.counts.retail_product_stock.stockQuantity}`);
  }

  for (const dependency of input.dependencies) {
    if (
      Number(dependency.rows) > 0 &&
      !HISTORICAL_CLEANUP_DEPENDENCIES.has(dependency.table_name)
    ) {
      issues.push(`${dependency.table_name}=${dependency.rows}`);
    }
  }

  return issues;
}

async function softDeleteUnapproved(
  sql: Db,
  tableName: RetailCatalogueTable,
  organisationIds: readonly string[]
) {
  const result = await sql.unsafe(
    `
      update public.${quoteCatalogueAlignmentIdentifier(tableName)} retail
      set
        status = 'deleted',
        metadata = coalesce(retail.metadata, '{}'::jsonb) || jsonb_build_object(
          'approvedOnlyDeletedAt', now(),
          'deleteReason', 'retail_approved_only_cleanup',
          'previousProductStatus', products.status
        ),
        updated_at = now()
      from public.products products
      where products.id = retail.product_id
        and retail.organisation_id = any($1::uuid[])
        and retail.status <> 'deleted'
        and products.status <> 'approved'
    `,
    [[...organisationIds]]
  );

  return result.count;
}

function protectedIssues(
  before: ProtectedDataSnapshot,
  after: ProtectedDataSnapshot
) {
  const issues: Array<{ after: unknown; before: unknown; issue: string; table: string }> = [];

  for (const [tableName, beforeTable] of Object.entries(before.tables)) {
    if (PROTECTED_ALLOWLIST.has(tableName)) {
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

async function main() {
  const apply = hasArg("apply");
  const environment = targetEnv();
  const connection = dbUrl();
  const slugs = orgSlugs();
  const outputDir = argValue(
    "out",
    path.join("reports", "retail-approved-only-cleanup", `${environment || "unknown"}-${timestampSlug()}`)
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

  try {
    const organisations = await targetOrganisations(sql, slugs);
    const beforeBreakdown = await retailBreakdown(sql, organisations.ids);
    const beforeCounts = await activeUnapprovedCounts(sql, organisations.ids);
    const dependencies = await dependencyCounts(sql, organisations.ids);
    const blockingIssues = blockers({ counts: beforeCounts, dependencies });
    let applyReport: null | {
      protectedIssues: ReturnType<typeof protectedIssues>;
      softDeleted: Record<RetailCatalogueTable, number>;
    } = null;

    if (apply) {
      if (blockingIssues.length > 0) {
        throw new Error(
          `Refusing approved-only cleanup with protected/nonzero dependencies: ${blockingIssues.join(", ")}`
        );
      }

      applyReport = await sql.begin(async (transaction) => {
        const tx = transaction as unknown as Db;

        if (environment.startsWith("prd")) {
          await tx`set transaction isolation level repeatable read`;
        }

        const protectedBefore = environment.startsWith("prd")
          ? await captureProtectedDataSnapshot(tx)
          : null;
        const softDeleted = {
          retail_product_stock: await softDeleteUnapproved(
            tx,
            "retail_product_stock",
            organisations.ids
          ),
          retail_sellable_products: await softDeleteUnapproved(
            tx,
            "retail_sellable_products",
            organisations.ids
          )
        };
        const protectedAfter = protectedBefore
          ? await captureProtectedDataSnapshot(tx)
          : null;
        const issues = protectedBefore && protectedAfter
          ? protectedIssues(protectedBefore, protectedAfter)
          : [];

        if (issues.length > 0) {
          throw new Error(
            `Protected data would change outside retail catalogue tables: ${issues
              .map((issue) => `${issue.table}:${issue.issue}`)
              .join(", ")}`
          );
        }

        return { protectedIssues: issues, softDeleted };
      });
    }

    const afterBreakdown = await retailBreakdown(sql, organisations.ids);
    const afterCounts = await activeUnapprovedCounts(sql, organisations.ids);
    const summary = {
      afterBreakdown,
      afterCounts,
      applied: apply,
      applyReport,
      beforeBreakdown,
      beforeCounts,
      blockers: blockingIssues,
      checkedAt: new Date().toISOString(),
      dependencies,
      dryRun: !apply,
      environment,
      missingOrganisationSlugs: organisations.missingSlugs,
      organisationSlugs: organisations.rows.map((row) => row.slug)
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, "retail-approved-only-cleanup-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );

    console.log(JSON.stringify({
      afterCounts,
      applied: apply,
      beforeCounts,
      blockers: blockingIssues,
      outputDir,
      softDeleted: applyReport?.softDeleted ?? null
    }, null, 2));
  } finally {
    await closeSqlPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
