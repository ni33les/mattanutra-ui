import { getSql } from "@/lib/db";
import {
  adminDashboardFilterSql,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";

export type AdminDashboardRange =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "all";

export type AdminDashboardKpiId = "free" | "precision" | "pro";
export type AdminDashboardRateId =
  | "freeRate"
  | "paidRate"
  | "precisionRate"
  | "proRate";

export type AdminDashboardKpi = Readonly<{
  forecast: number[];
  id: AdminDashboardKpiId;
  series: number[];
  trend: "down" | "flat" | "up";
  value: number;
}>;

export type AdminDashboardRate = Readonly<{
  denominator: number;
  forecast: number[];
  id: AdminDashboardRateId;
  numerator: number;
  series: number[];
  trend: "down" | "flat" | "up";
  value: number;
}>;

export type AdminDashboardData = Readonly<{
  bucketLabel: string;
  bucketLabels: string[];
  databaseAvailable: boolean;
  generatedAt: string;
  kpis: AdminDashboardKpi[];
  rates: AdminDashboardRate[];
  range: AdminDashboardRange;
}>;

type BpmConversionRow = Readonly<{
  event_name: string;
  event_status: string | null;
  event_type: string | null;
  example_request_id: string | null;
  id: string;
  occurred_at: Date | string;
  plan_id: string | null;
  ray: string | null;
  selected_plan: string | null;
}>;

const ranges = new Set<AdminDashboardRange>([
  "hour",
  "day",
  "week",
  "month",
  "year",
  "all"
]);

const kpiIds: AdminDashboardKpiId[] = ["free", "precision", "pro"];
const rateIds: AdminDashboardRateId[] = [
  "freeRate",
  "precisionRate",
  "proRate",
  "paidRate"
];

const paidEventNames = new Set([
  "checkout_completed",
  "checkout_paid",
  "payment_completed",
  "payment_confirmed",
  "payment_succeeded",
  "plan_paid"
]);

const paidEventStatuses = new Set([
  "complete",
  "completed",
  "paid",
  "success",
  "succeeded"
]);

export function normalizeAdminDashboardRange(
  value: string | string[] | undefined
): AdminDashboardRange {
  const range = Array.isArray(value) ? value[0] : value;

  return range && ranges.has(range as AdminDashboardRange)
    ? (range as AdminDashboardRange)
    : "day";
}

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

function bucketDateFormatter(range: AdminDashboardRange) {
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

function buildBuckets(range: AdminDashboardRange, rows: BpmConversionRow[]) {
  const now = new Date();
  const buckets: Array<{ end: Date; label: string; start: Date }> = [];
  const formatter = bucketDateFormatter(range);

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

  if (range === "week") {
    const end = addDays(startOfDay(now), 1);
    const start = addDays(end, -7);

    for (let bucketStart = start; bucketStart < end; bucketStart = addDays(bucketStart, 1)) {
      buckets.push({
        end: addDays(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "month") {
    const end = addDays(startOfDay(now), 1);
    const start = addDays(end, -30);

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
    rows.length > 0
      ? startOfMonth(
          rows.reduce((min, row) => {
            const occurredAt = new Date(row.occurred_at);

            return occurredAt < min ? occurredAt : min;
          }, now)
        )
      : addMonths(end, -12);
  const start = range === "all" ? earliest : addMonths(end, -12);

  for (let bucketStart = start; bucketStart < end; bucketStart = addMonths(bucketStart, 1)) {
    buckets.push({
      end: addMonths(bucketStart, 1),
      label: formatter.format(bucketStart),
      start: bucketStart
    });
  }

  return buckets;
}

function bucketQueryStart(range: AdminDashboardRange) {
  const now = new Date();

  if (range === "all") {
    return null;
  }

  if (range === "hour") {
    return addMinutes(addMinutes(startOfFiveMinuteBucket(now), 5), -60);
  }

  if (range === "day") {
    return addHours(addHours(startOfHour(now), 1), -24);
  }

  if (range === "week") {
    return addDays(addDays(startOfDay(now), 1), -7);
  }

  if (range === "month") {
    return addDays(addDays(startOfDay(now), 1), -30);
  }

  return addMonths(addMonths(startOfMonth(now), 1), -12);
}

function rowKpiId(row: BpmConversionRow): AdminDashboardKpiId | null {
  if (row.event_name === "free_email_requested") {
    return "free";
  }

  const isPaidEvent =
    paidEventNames.has(row.event_name) ||
    (row.event_type === "payment" &&
      Boolean(row.event_status && paidEventStatuses.has(row.event_status)));

  if (!isPaidEvent) {
    return null;
  }

  if (row.selected_plan === "precision") {
    return "precision";
  }

  if (row.selected_plan === "pro") {
    return "pro";
  }

  return null;
}

function rowDedupKey(row: BpmConversionRow) {
  if (row.event_name === "free_email_requested") {
    return row.example_request_id ?? row.id;
  }

  return row.plan_id ?? row.id;
}

function denominatorDedupKey(row: BpmConversionRow) {
  return row.plan_id ?? row.ray ?? row.id;
}

function rateNumeratorIds(id: AdminDashboardRateId): AdminDashboardKpiId[] {
  if (id === "freeRate") {
    return ["free"];
  }

  if (id === "precisionRate") {
    return ["precision"];
  }

  if (id === "proRate") {
    return ["pro"];
  }

  return ["precision", "pro"];
}

function percentageSeries(numerators: number[], denominators: number[]) {
  return numerators.map((numerator, index) => {
    const denominator = denominators[index] ?? 0;

    return denominator > 0 ? (numerator / denominator) * 100 : 0;
  });
}

function forecastSeries(series: number[]) {
  const last = series.at(-1) ?? 0;

  if (series.length < 2) {
    return [last, last, last];
  }

  const recent = series.slice(-Math.min(6, series.length));
  const slope =
    recent.length > 1 ? (recent.at(-1)! - recent[0]) / (recent.length - 1) : 0;

  return [1, 2, 3].map((step) => Math.max(0, Math.round(last + slope * step)));
}

function forecastRateSeries(series: number[]) {
  const last = series.at(-1) ?? 0;

  if (series.length < 2) {
    return [last, last, last];
  }

  const recent = series.slice(-Math.min(6, series.length));
  const slope =
    recent.length > 1 ? (recent.at(-1)! - recent[0]) / (recent.length - 1) : 0;

  return [1, 2, 3].map((step) =>
    Math.min(100, Math.max(0, Number((last + slope * step).toFixed(1))))
  );
}

function trendFor(series: number[]): "down" | "flat" | "up" {
  const current = series.at(-1) ?? 0;
  const previous = series.at(-2) ?? current;

  if (current > previous) {
    return "up";
  }

  if (current < previous) {
    return "down";
  }

  return "flat";
}

function emptyData(range: AdminDashboardRange): AdminDashboardData {
  const buckets = buildBuckets(range, []);
  const emptySeries = buckets.map(() => 0);

  return {
    bucketLabel: bucketLabelFor(range),
    bucketLabels: buckets.map((bucket) => bucket.label),
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    kpis: kpiIds.map((id) => ({
      forecast: forecastSeries(emptySeries),
      id,
      series: emptySeries,
      trend: "flat",
      value: 0
    })),
    rates: rateIds.map((id) => ({
      denominator: 0,
      forecast: forecastRateSeries(emptySeries),
      id,
      numerator: 0,
      series: emptySeries,
      trend: "flat",
      value: 0
    })),
    range
  };
}

function bucketLabelFor(range: AdminDashboardRange) {
  if (range === "hour") {
    return "5 min";
  }

  if (range === "day") {
    return "hour";
  }

  if (range === "year" || range === "all") {
    return "month";
  }

  return "day";
}

export async function getAdminDashboardData(
  range: AdminDashboardRange,
  filters: AdminDashboardFilters
): Promise<AdminDashboardData> {
  const sql = getSql();

  if (!sql) {
    return emptyData(range);
  }

  try {
    const start = bucketQueryStart(range);
    const rows = start
      ? await sql<BpmConversionRow[]>`
          select
            id::text,
            ray::text,
            event_name,
            event_status,
            event_type,
            selected_plan::text,
            plan_id::text,
            example_request_id::text,
            occurred_at
          from public.bpm
          where occurred_at >= ${start}
            and ${adminDashboardFilterSql(sql, filters)}
            and (
              event_name in ('free_email_requested', 'healthscore_viewed')
              or (
                (
                  event_name in (
                    'checkout_completed',
                    'checkout_paid',
                    'payment_completed',
                    'payment_confirmed',
                    'payment_succeeded',
                    'plan_paid'
                  )
                  or (
                    event_type = 'payment'
                    and event_status in (
                      'complete',
                      'completed',
                      'paid',
                      'success',
                      'succeeded'
                    )
                  )
                )
                and selected_plan in ('precision', 'pro')
              )
            )
          order by occurred_at asc
          limit 50000
        `
      : await sql<BpmConversionRow[]>`
          select
            id::text,
            ray::text,
            event_name,
            event_status,
            event_type,
            selected_plan::text,
            plan_id::text,
            example_request_id::text,
            occurred_at
          from public.bpm
          where ${adminDashboardFilterSql(sql, filters)}
            and (
              event_name in ('free_email_requested', 'healthscore_viewed')
            or (
              (
                event_name in (
                  'checkout_completed',
                  'checkout_paid',
                  'payment_completed',
                  'payment_confirmed',
                  'payment_succeeded',
                  'plan_paid'
                )
                or (
                  event_type = 'payment'
                  and event_status in (
                    'complete',
                    'completed',
                    'paid',
                    'success',
                    'succeeded'
                  )
                )
              )
              and selected_plan in ('precision', 'pro')
            )
            )
          order by occurred_at asc
          limit 50000
        `;
    const buckets = buildBuckets(range, rows);
    const denominatorSeen = new Set<string>();
    const denominatorSeries = buckets.map(() => 0);
    const seen = new Set<string>();
    const series = new Map<AdminDashboardKpiId, number[]>(
      kpiIds.map((id) => [id, buckets.map(() => 0)])
    );

    rows.forEach((row) => {
      const occurredAt = new Date(row.occurred_at);
      const bucketIndex = buckets.findIndex(
        (bucket) => occurredAt >= bucket.start && occurredAt < bucket.end
      );

      if (bucketIndex === -1) {
        return;
      }

      if (row.event_name === "healthscore_viewed") {
        const denominatorKey = `healthscore:${denominatorDedupKey(row)}`;

        if (!denominatorSeen.has(denominatorKey)) {
          denominatorSeen.add(denominatorKey);
          denominatorSeries[bucketIndex] += 1;
        }

        return;
      }

      const kpiId = rowKpiId(row);

      if (!kpiId) {
        return;
      }

      const dedupKey = `${kpiId}:${rowDedupKey(row)}`;

      if (seen.has(dedupKey)) {
        return;
      }

      seen.add(dedupKey);
      series.get(kpiId)![bucketIndex] += 1;
    });

    const rates = rateIds.map((id) => {
      const numeratorIds = rateNumeratorIds(id);
      const numeratorSeries = buckets.map((_, index) =>
        numeratorIds.reduce(
          (total, kpiId) => total + (series.get(kpiId)?.[index] ?? 0),
          0
        )
      );
      const rateSeries = percentageSeries(numeratorSeries, denominatorSeries);
      const numerator = numeratorSeries.reduce((total, value) => total + value, 0);
      const denominator = denominatorSeries.reduce(
        (total, value) => total + value,
        0
      );
      const value = denominator > 0 ? (numerator / denominator) * 100 : 0;

      return {
        denominator,
        forecast: forecastRateSeries(rateSeries),
        id,
        numerator,
        series: rateSeries,
        trend: trendFor(rateSeries),
        value: Number(value.toFixed(1))
      };
    });

    return {
      bucketLabel: bucketLabelFor(range),
      bucketLabels: buckets.map((bucket) => bucket.label),
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      kpis: kpiIds.map((id) => {
        const values = series.get(id) ?? buckets.map(() => 0);

        return {
          forecast: forecastSeries(values),
          id,
          series: values,
          trend: trendFor(values),
          value: values.reduce((total, value) => total + value, 0)
        };
      }),
      rates,
      range
    };
  } catch (error) {
    console.error("Unable to load admin dashboard data", error);
    return emptyData(range);
  }
}
