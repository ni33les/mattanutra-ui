import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";

export type AdminFinancialMetricId =
  | "operatingCost"
  | "payout"
  | "revenue"
  | "transactions";

export type AdminFinancialEntryType = "actual" | "nominal";
export type AdminFinancialCategory =
  | "ai"
  | "hosting"
  | "other"
  | "payment_fee"
  | "payout"
  | "refund"
  | "revenue";

export type AdminFinancialTransactionRow = Readonly<{
  amount: number;
  amountUsd: number;
  category: AdminFinancialCategory;
  currency: string;
  description: string;
  entryType: AdminFinancialEntryType;
  from: string;
  id: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  provider: string | null;
  source: string;
  sourceRef: string | null;
  taskId: string | null;
  to: string;
  usdRate: number;
}>;

export type AdminFinancialsData = Readonly<{
  bucketLabels: string[];
  databaseAvailable: boolean;
  generatedAt: string;
  range: AdminDashboardRange;
  rows: AdminFinancialTransactionRow[];
  series: Readonly<Record<AdminFinancialMetricId, number[]>>;
  summary: Readonly<{
    operatingCostUsd: number;
    payoutUsd: number;
    revenueUsd: number;
    transactions: number;
  }>;
}>;

type FinanceRow = Readonly<{
  amount: number | string;
  category: string;
  currency: string;
  description: string;
  entry_type: AdminFinancialEntryType | string | null;
  from_account: string;
  id: string;
  metadata: unknown;
  occurred_at: Date | string;
  provider: string | null;
  source: string;
  source_ref: string | null;
  task_id: string | null;
  to_account: string;
  usd_rate: number | string;
}>;

type Bucket = Readonly<{
  end: Date;
  label: string;
  start: Date;
}>;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);

  return next;
}

function startOfHour(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    )
  );
}

function startOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfFiveMinuteBucket(date: Date) {
  const bucketMinute = Math.floor(date.getUTCMinutes() / 5) * 5;

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      bucketMinute
    )
  );
}

function bucketFormatter(range: AdminDashboardRange) {
  if (range === "hour") {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC"
    });
  }

  if (range === "day") {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      timeZone: "UTC"
    });
  }

  if (range === "year" || range === "all") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC"
    });
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  });
}

function buildBuckets(range: AdminDashboardRange, rows: FinanceRow[]) {
  const now = new Date();
  const buckets: Bucket[] = [];
  const formatter = bucketFormatter(range);

  if (range === "hour") {
    const end = addMinutes(startOfFiveMinuteBucket(now), 5);
    const start = addMinutes(end, -60);

    for (let bucketStart = start; bucketStart < end; bucketStart = addMinutes(bucketStart, 5)) {
      buckets.push({
        end: addMinutes(bucketStart, 5),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "day") {
    const end = addHours(startOfHour(now), 1);
    const start = addHours(end, -24);

    for (let bucketStart = start; bucketStart < end; bucketStart = addHours(bucketStart, 1)) {
      buckets.push({
        end: addHours(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "week" || range === "month") {
    const end = addDays(startOfDay(now), 1);
    const start = addDays(end, range === "week" ? -7 : -30);

    for (let bucketStart = start; bucketStart < end; bucketStart = addDays(bucketStart, 1)) {
      buckets.push({
        end: addDays(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  const end = addMonths(startOfMonth(now), 1);
  const earliest =
    range === "all" && rows.length > 0
      ? startOfMonth(
          rows.reduce((min, row) => {
            const occurredAt = new Date(row.occurred_at);

            return occurredAt < min ? occurredAt : min;
          }, now)
        )
      : addMonths(end, -12);

  for (let bucketStart = earliest; bucketStart < end; bucketStart = addMonths(bucketStart, 1)) {
    buckets.push({
      end: addMonths(bucketStart, 1),
      label: formatter.format(bucketStart),
      start: bucketStart
    });
  }

  return buckets;
}

function usdAmount(row: FinanceRow) {
  return (Number(row.amount) * Number(row.usd_rate)) / 1_000_000;
}

function financeCategory(value: string | null | undefined): AdminFinancialCategory {
  if (value === "ai") {
    return "ai";
  }

  if (value === "hosting" || value === "infrastructure") {
    return "hosting";
  }

  if (
    value === "payment_fee" ||
    value === "payout" ||
    value === "refund" ||
    value === "revenue"
  ) {
    return value;
  }

  return "other";
}

function isOperatingCostCategory(category: AdminFinancialCategory) {
  return category === "ai" || category === "hosting" || category === "payment_fee";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function emptyFinancials(range: AdminDashboardRange): AdminFinancialsData {
  const buckets = buildBuckets(range, []);
  const empty = buckets.map(() => 0);

  return {
    bucketLabels: buckets.map((bucket) => bucket.label),
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    range,
    rows: [],
    series: {
      operatingCost: empty,
      payout: empty,
      revenue: empty,
      transactions: empty
    },
    summary: {
      operatingCostUsd: 0,
      payoutUsd: 0,
      revenueUsd: 0,
      transactions: 0
    }
  };
}

function mapRow(row: FinanceRow): AdminFinancialTransactionRow {
  return {
    amount: Number(row.amount),
    amountUsd: usdAmount(row),
    category: financeCategory(row.category),
    currency: row.currency,
    description: row.description,
    entryType: row.entry_type === "actual" ? "actual" : "nominal",
    from: row.from_account,
    id: row.id,
    metadata: objectValue(row.metadata),
    occurredAt: new Date(row.occurred_at).toISOString(),
    provider: row.provider,
    source: row.source,
    sourceRef: row.source_ref,
    taskId: row.task_id,
    to: row.to_account,
    usdRate: Number(row.usd_rate)
  };
}

function bucketIndex(buckets: Bucket[], date: Date) {
  return buckets.findIndex(
    (bucket) => date >= bucket.start && date < bucket.end
  );
}

export async function getAdminFinancialsData(
  range: AdminDashboardRange
): Promise<AdminFinancialsData> {
  const sql = getSql();

  if (!sql) {
    return emptyFinancials(range);
  }

  try {
    const start = adminDashboardRangeStart(range);
    const rows = start
      ? await sql<FinanceRow[]>`
          select
            id::text,
            occurred_at,
            category,
            entry_type,
            source,
            source_ref,
            task_id::text,
            provider,
            "from" as from_account,
            "to" as to_account,
            amount,
            currency,
            usd_rate,
            description,
            metadata
          from public.finance_transactions
          where occurred_at >= ${start}
          order by occurred_at desc
          limit 50000
        `
      : await sql<FinanceRow[]>`
          select
            id::text,
            occurred_at,
            category,
            entry_type,
            source,
            source_ref,
            task_id::text,
            provider,
            "from" as from_account,
            "to" as to_account,
            amount,
            currency,
            usd_rate,
            description,
            metadata
          from public.finance_transactions
          order by occurred_at desc
          limit 50000
        `;

    const buckets = buildBuckets(range, rows);
    const operatingCost = buckets.map(() => 0);
    const payout = buckets.map(() => 0);
    const revenue = buckets.map(() => 0);
    const transactions = buckets.map(() => 0);
    let operatingCostUsd = 0;
    let payoutUsd = 0;
    let revenueUsd = 0;

    for (const row of rows) {
      const amountUsd = usdAmount(row);
      const index = bucketIndex(buckets, new Date(row.occurred_at));
      const category = financeCategory(row.category);

      if (category === "revenue") {
        revenueUsd += amountUsd;
      }

      if (category === "payout") {
        payoutUsd += amountUsd;
      }

      if (isOperatingCostCategory(category)) {
        operatingCostUsd += amountUsd;
      }

      if (index >= 0) {
        if (category === "revenue") {
          revenue[index] += amountUsd;
        }

        if (category === "payout") {
          payout[index] += amountUsd;
        }

        if (isOperatingCostCategory(category)) {
          operatingCost[index] += amountUsd;
        }

        transactions[index] += 1;
      }
    }

    return {
      bucketLabels: buckets.map((bucket) => bucket.label),
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      range,
      rows: rows.slice(0, 100).map(mapRow),
      series: {
        operatingCost,
        payout,
        revenue,
        transactions
      },
      summary: {
        operatingCostUsd,
        payoutUsd,
        revenueUsd,
        transactions: rows.length
      }
    };
  } catch (error) {
    console.error("Unable to load financials data", error);
    return emptyFinancials(range);
  }
}
