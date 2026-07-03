import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";
import { quoteCatalogueIdentifier } from "@/lib/catalogue-snapshot-tables";

type Db = NonNullable<ReturnType<typeof getSql>>;

export type ProtectedDataTableSpec = Readonly<{
  name: string;
  sumColumns?: readonly string[];
}>;

export type ProtectedDataTableSnapshot = Readonly<{
  checksum: string | null;
  exists: boolean;
  rowCount: number;
  sums: Record<string, string>;
}>;

export type ProtectedDataSnapshot = Readonly<{
  capturedAt: string;
  tables: Record<string, ProtectedDataTableSnapshot>;
}>;

export type ProtectedDataVerificationIssue = Readonly<{
  after: string | number | null;
  before: string | number | null;
  column?: string;
  issue: "missing_table" | "row_count_decreased" | "sum_decreased";
  table: string;
}>;

export const PROTECTED_DATA_TABLES: readonly ProtectedDataTableSpec[] = [
  { name: "admin_audit_events" },
  { name: "admin_auth_challenges" },
  { name: "admin_passkey_credentials" },
  { name: "admin_sessions" },
  { name: "agent_credentials" },
  { name: "agents" },
  { name: "assessment_events" },
  { name: "assessment_formulations" },
  { name: "assessment_resume_drafts" },
  { name: "assessment_submissions" },
  { name: "assessment_versions" },
  { name: "assessments" },
  { name: "communication_channels" },
  { name: "communication_identities" },
  { name: "communication_messages" },
  { name: "customer_line_connect_tokens" },
  { name: "finance_accounts" },
  { name: "finance_fx_rates" },
  { name: "finance_transactions", sumColumns: ["amount"] },
  { name: "food_guidance" },
  { name: "formulations" },
  { name: "line_connect_tokens" },
  { name: "nutrition_plan_versions" },
  { name: "nutrition_reports" },
  { name: "organisation_communication_identities" },
  { name: "organisation_finance_accounts" },
  { name: "organisation_memberships" },
  { name: "organisation_notification_preferences" },
  { name: "organisations" },
  { name: "panya_config_versions" },
  { name: "panya_daily_usage", sumColumns: ["user_message_count", "quota_limit"] },
  { name: "payments", sumColumns: ["amount"] },
  { name: "payment_versions" },
  { name: "people" },
  { name: "plan_chat_messages" },
  { name: "plan_communication_identities" },
  { name: "plan_feedback" },
  { name: "plan_guidance_adjustments" },
  { name: "plan_runs" },
  {
    name: "product_recommendation_decisions",
    sumColumns: [
      "price_amount",
      "product_coverage_percent",
      "score",
      "serving_multiplier",
      "stack_contribution_percent",
      "unit_price_amount"
    ]
  },
  {
    name: "product_recommendation_items",
    sumColumns: [
      "price_amount",
      "product_coverage_percent",
      "score",
      "serving_multiplier",
      "stack_contribution_percent",
      "unit_price_amount"
    ]
  },
  {
    name: "product_recommendation_runs",
    sumColumns: [
      "food_coverage_percent",
      "stack_coverage_percent",
      "supplement_product_coverage_percent",
      "total_coverage_percent"
    ]
  },
  { name: "recommendations" },
  { name: "retail_carrier_accounts" },
  { name: "retail_checkout_payments", sumColumns: ["amount"] },
  { name: "retail_checkout_payment_versions" },
  {
    name: "retail_customer_order_lines",
    sumColumns: [
      "quantity_allocated",
      "quantity_ordered",
      "quantity_shipped",
      "retail_price_amount"
    ]
  },
  { name: "retail_customer_orders" },
  { name: "retail_order_allocations", sumColumns: ["quantity_allocated"] },
  {
    name: "retail_order_settlements",
    sumColumns: [
      "gross_customer_amount",
      "mattanutra_margin_amount",
      "paid_amount",
      "retailer_payable_amount"
    ]
  },
  { name: "retail_order_shipment_events" },
  { name: "retail_order_shipments" },
  {
    name: "retail_product_stock",
    sumColumns: ["retail_price_amount", "stock_quantity", "wholesale_price_amount"]
  },
  {
    name: "retail_product_stock_snapshots",
    sumColumns: ["retail_price_amount", "stock_quantity", "wholesale_price_amount"]
  },
  {
    name: "retail_sellable_products",
    sumColumns: ["rrp_price_amount", "wholesale_price_amount"]
  },
  {
    name: "retail_stock_lots",
    sumColumns: ["received_quantity", "remaining_quantity", "wholesale_price_amount"]
  },
  {
    name: "retail_stock_movements",
    sumColumns: ["retail_price_amount", "unit_cost_amount"]
  },
  {
    name: "retail_stock_reorder_advice",
    sumColumns: [
      "current_stock_quantity",
      "outflow_units_30d",
      "recommendation_pressure_count",
      "suggested_order_quantity"
    ]
  },
  { name: "stripe_webhook_events" },
  { name: "supplement_recommendation_selections", sumColumns: ["dose_amount"] },
  { name: "task_approvals" },
  { name: "task_comments" },
  { name: "task_dependencies" },
  { name: "task_events" },
  { name: "task_reservations" },
  { name: "tasks", sumColumns: ["business_value", "profit_impact_amount"] },
  { name: "worker_sessions" }
] as const;

const NUMERIC_DATA_TYPES = new Set([
  "bigint",
  "decimal",
  "double precision",
  "integer",
  "numeric",
  "real",
  "smallint"
]);

function decimalStringToNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

async function tableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

async function numericColumns(
  sql: Db,
  tableName: string,
  candidates: readonly string[]
) {
  if (candidates.length < 1) {
    return [];
  }

  const rows = await sql<Array<{ column_name: string; data_type: string }>>`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = any(${[...candidates]}::text[])
  `;

  return rows
    .filter((row) => NUMERIC_DATA_TYPES.has(row.data_type))
    .map((row) => row.column_name);
}

async function countRows(sql: Db, tableName: string) {
  const rows = await sql.unsafe<Array<{ count: string }>>(
    `select count(*)::text as count from public.${quoteCatalogueIdentifier(tableName)}`
  );

  return Number(rows[0]?.count ?? 0);
}

async function checksumRows(sql: Db, tableName: string) {
  if (process.env.MATTANUTRA_SKIP_PROTECTED_CHECKSUM === "true") {
    return null;
  }

  const table = quoteCatalogueIdentifier(tableName);
  const rows = await sql.unsafe<Array<{ checksum: string | null }>>(
    `
      select md5(
        coalesce(
          string_agg(md5(row_to_json(protected_row)::text), '' order by md5(row_to_json(protected_row)::text)),
          ''
        )
      ) as checksum
      from public.${table} protected_row
    `
  );

  return rows[0]?.checksum ?? null;
}

async function sumColumn(sql: Db, tableName: string, columnName: string) {
  const rows = await sql.unsafe<Array<{ sum: string }>>(
    `
      select coalesce(sum(${quoteCatalogueIdentifier(columnName)}), 0)::text as sum
      from public.${quoteCatalogueIdentifier(tableName)}
    `
  );

  return rows[0]?.sum ?? "0";
}

export async function captureProtectedDataSnapshot(
  sql: Db,
  specs: readonly ProtectedDataTableSpec[] = PROTECTED_DATA_TABLES
): Promise<ProtectedDataSnapshot> {
  const tables: Record<string, ProtectedDataTableSnapshot> = {};

  for (const spec of specs) {
    const exists = await tableExists(sql, spec.name);

    if (!exists) {
      tables[spec.name] = {
        checksum: null,
        exists: false,
        rowCount: 0,
        sums: {}
      };
      continue;
    }

    const sumColumns = await numericColumns(sql, spec.name, spec.sumColumns ?? []);
    const sums: Record<string, string> = {};

    for (const columnName of sumColumns) {
      sums[columnName] = await sumColumn(sql, spec.name, columnName);
    }

    tables[spec.name] = {
      checksum: await checksumRows(sql, spec.name),
      exists: true,
      rowCount: await countRows(sql, spec.name),
      sums
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    tables
  };
}

export function compareProtectedDataSnapshots(
  before: ProtectedDataSnapshot,
  after: ProtectedDataSnapshot
) {
  const issues: ProtectedDataVerificationIssue[] = [];

  for (const [table, beforeTable] of Object.entries(before.tables)) {
    const afterTable = after.tables[table];

    if (beforeTable.exists && !afterTable?.exists) {
      issues.push({
        after: null,
        before: beforeTable.rowCount,
        issue: "missing_table",
        table
      });
      continue;
    }

    if (!afterTable) {
      continue;
    }

    if (afterTable.rowCount < beforeTable.rowCount) {
      issues.push({
        after: afterTable.rowCount,
        before: beforeTable.rowCount,
        issue: "row_count_decreased",
        table
      });
    }

    for (const [column, beforeSum] of Object.entries(beforeTable.sums)) {
      const afterSum = afterTable.sums[column] ?? "0";

      if (decimalStringToNumber(afterSum) < decimalStringToNumber(beforeSum)) {
        issues.push({
          after: afterSum,
          before: beforeSum,
          column,
          issue: "sum_decreased",
          table
        });
      }
    }
  }

  return {
    issues,
    ok: issues.length === 0
  };
}

async function atomicWriteFile(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;

  await writeFile(tmp, contents, "utf8");
  await rename(tmp, filePath);
}

export async function writeProtectedDataSnapshot(
  filePath: string,
  snapshot: ProtectedDataSnapshot
) {
  await atomicWriteFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
}
