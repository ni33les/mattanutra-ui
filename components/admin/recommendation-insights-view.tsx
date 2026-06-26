"use client";

import {
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type {
  AdminProductRecommendationInsightRow,
  AdminProductRecommendationInsightsData,
  AdminSupplementImprovementInsightsData,
  ImprovementListStatus,
  ProductRecommendationInsightOutcome,
  SupplementDemandInsight
} from "@/lib/admin-recommendation-insights";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SafeImage } from "@/components/safe-image";

type TableColumn<T> = Readonly<{
  label: string;
  value: (row: T) => string;
}>;

const statusLabels: Record<ImprovementListStatus, string> = {
  active: "Active",
  banned: "Banned",
  blocked: "Blocked",
  ignored: "Ignored",
  inactive: "Inactive",
  missing: "Missing",
  review_required: "Review",
  unknown: "Unknown"
};

const productOutcomeLabels: Record<ProductRecommendationInsightOutcome, string> = {
  near_miss: "Near Miss",
  not_evaluated: "Not Evaluated",
  recommended: "Recommended",
  rejected: "Rejected"
};

const productOutcomeClasses: Record<ProductRecommendationInsightOutcome, string> = {
  near_miss: "bg-sky-50 text-sky-700 ring-sky-200",
  not_evaluated: "bg-gray-100 text-gray-700 ring-gray-200",
  recommended: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200"
};

const productOutcomeColors: Record<ProductRecommendationInsightOutcome, string> = {
  near_miss: "#0EA5E9",
  not_evaluated: "#6B7280",
  recommended: "#126B4F",
  rejected: "#DC2626"
};

type ProductInsightFilter = ProductRecommendationInsightOutcome | "all" | "stale";

const productInsightFilters: Array<{
  id: ProductInsightFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "recommended", label: "Recommended" },
  { id: "near_miss", label: "Near Miss" },
  { id: "rejected", label: "Rejected" },
  { id: "not_evaluated", label: "Not Evaluated" },
  { id: "stale", label: "Stale" }
];

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en"
  ).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(new Date(value));
}

function productDetailHref(
  row: AdminProductRecommendationInsightRow,
  locale: Locale,
  accessToken: string
) {
  const params = new URLSearchParams();

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/${locale}/admin/products/${row.id}${params.size > 0 ? `?${params.toString()}` : ""}`;
}

function productInsightSearchText(row: AdminProductRecommendationInsightRow) {
  return [
    row.title,
    row.brandName,
    row.productKind,
    row.productStatus,
    row.validationStatus,
    row.validationSummary,
    row.primaryReason
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: readonly string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvRows<T>(columns: readonly TableColumn<T>[], rows: readonly T[]) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => column.value(row)))
  ];
}

function Section({
  action,
  children,
  eyebrow,
  title
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
  title: string;
}>) {
  return (
    <section className="rounded-md bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1FA77A]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CsvButton({
  filename,
  rows
}: Readonly<{
  filename: string;
  rows: readonly string[][];
}>) {
  return (
    <button
      className="inline-flex items-center rounded-md bg-[#20343A] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#16252A]"
      onClick={() => downloadCsv(filename, rows)}
      type="button"
    >
      Export CSV
    </button>
  );
}

function SelectFilter({
  label,
  onChange,
  options,
  value
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}>) {
  return (
    <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-semibold text-gray-500">
      {label}
      <select
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusPill({
  status
}: Readonly<{
  status: ImprovementListStatus;
}>) {
  const colors: Record<ImprovementListStatus, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    banned: "bg-red-50 text-red-700 ring-red-200",
    blocked: "bg-amber-50 text-amber-800 ring-amber-200",
    ignored: "bg-gray-100 text-gray-700 ring-gray-200",
    inactive: "bg-gray-100 text-gray-700 ring-gray-200",
    missing: "bg-rose-50 text-rose-700 ring-rose-200",
    review_required: "bg-sky-50 text-sky-700 ring-sky-200",
    unknown: "bg-gray-100 text-gray-700 ring-gray-200"
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${colors[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function EmptyState({ label }: Readonly<{ label: string }>) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500">
      {label}
    </div>
  );
}

function ProductOutcomePill({
  outcome
}: Readonly<{
  outcome: ProductRecommendationInsightOutcome;
}>) {
  return (
    <span className={classNames(
      "inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1",
      productOutcomeClasses[outcome]
    )}>
      {productOutcomeLabels[outcome]}
    </span>
  );
}

function ProductInsightDistributionBar({
  data,
  locale
}: Readonly<{
  data: AdminProductRecommendationInsightsData;
  locale: Locale;
}>) {
  const total = Math.max(1, data.summary.totalProducts);
  const segments: Array<{
    id: ProductRecommendationInsightOutcome;
    value: number;
  }> = [
    { id: "recommended", value: data.summary.recommendedProducts },
    { id: "near_miss", value: data.summary.nearMissProducts },
    { id: "rejected", value: data.summary.rejectedProducts },
    { id: "not_evaluated", value: data.summary.notEvaluatedProducts }
  ];

  return (
    <Section eyebrow="Outcome mix" title="Product recommendation distribution">
      <div className="h-5 overflow-hidden rounded-full bg-gray-100">
        <div className="flex h-full">
          {segments.map((segment) =>
            segment.value > 0 ? (
              <div
                className="h-full"
                key={segment.id}
                style={{
                  backgroundColor: productOutcomeColors[segment.id],
                  width: `${(segment.value / total) * 100}%`
                }}
                title={`${productOutcomeLabels[segment.id]}: ${formatNumber(segment.value, locale)}`}
              />
            ) : null
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-gray-600">
        {segments.map((segment) => (
          <span className="inline-flex items-center gap-2" key={segment.id}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: productOutcomeColors[segment.id] }}
            />
            {productOutcomeLabels[segment.id]} {formatNumber(segment.value, locale)}
          </span>
        ))}
      </div>
    </Section>
  );
}

function DistributionBars<T>({
  labelFor,
  locale,
  rows,
  valueFor
}: Readonly<{
  labelFor: (row: T) => string;
  locale: Locale;
  rows: readonly T[];
  valueFor: (row: T) => number;
}>) {
  const max = Math.max(1, ...rows.map(valueFor));

  return (
    <div className="space-y-3">
      {rows.length > 0 ? rows.map((row) => {
        const value = valueFor(row);

        return (
          <div
            className="grid grid-cols-[minmax(8rem,16rem)_1fr_auto] items-center gap-3"
            key={labelFor(row)}
          >
            <p className="truncate text-sm font-semibold text-gray-800">
              {labelFor(row)}
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#1FA77A]"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
            <p className="text-sm font-semibold tabular-nums text-gray-700">
              {formatNumber(value, locale)}
            </p>
          </div>
        );
      }) : (
        <EmptyState label="No distribution data is available for this timeframe." />
      )}
    </div>
  );
}

const productInsightColumns: TableColumn<AdminProductRecommendationInsightRow>[] = [
  { label: "product", value: (row) => row.title },
  { label: "brand", value: (row) => row.brandName ?? "" },
  { label: "outcome", value: (row) => row.primaryOutcome },
  { label: "chosen", value: (row) => String(row.chosenCount) },
  { label: "near_miss", value: (row) => String(row.nearMissCount) },
  { label: "rejected", value: (row) => String(row.rejectedCount) },
  { label: "affected_plans", value: (row) => String(row.affectedPlanCount) },
  { label: "average_coverage", value: (row) => String(row.averageCoveragePercent ?? "") },
  { label: "stale", value: (row) => String(row.isStale) },
  { label: "reason", value: (row) => row.primaryReason },
  { label: "last_decision_at", value: (row) => row.lastDecisionAt ?? "" }
];

function ProductInsightRow({
  accessToken,
  locale,
  row
}: Readonly<{
  accessToken: string;
  locale: Locale;
  row: AdminProductRecommendationInsightRow;
}>) {
  const href = productDetailHref(row, locale, accessToken);

  return (
    <a
      className="grid gap-4 px-4 py-4 transition hover:bg-gray-50 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]"
      href={href}
    >
      <div className="flex min-w-0 gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
          <SafeImage
            alt={row.title}
            className="object-cover"
            fallback={
              <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-400">
                IMG
              </div>
            }
            fill
            sizes="64px"
            src={row.imageUrl}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ProductOutcomePill outcome={row.primaryOutcome} />
            {row.isStale ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Stale
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-gray-950">
            {row.title}
          </h3>
          <p className="mt-1 text-xs font-medium text-gray-500">
            {[
              row.brandName || "Unknown brand",
              readableToken(row.productKind),
              readableToken(row.productStatus),
              row.validationStatus
                ? `validation ${readableToken(row.validationStatus)}`
                : "validation unknown"
            ].join(" · ")}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            {row.primaryReason}
          </p>
          {row.isStale ? (
            <p className="mt-1 text-xs font-medium text-amber-800">
              Product or validation changed after the latest recommendation decision.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {[
          ["Chosen", formatNumber(row.chosenCount, locale)],
          ["Near Miss", formatNumber(row.nearMissCount, locale)],
          ["Rejected", formatNumber(row.rejectedCount, locale)],
          ["Plans", formatNumber(row.affectedPlanCount, locale)],
          ["Coverage", formatPercent(row.averageCoveragePercent)],
          ["Last", formatDate(row.lastDecisionAt, locale)]
        ].map(([label, value]) => (
          <div
            className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
            key={label}
          >
            <p className="font-semibold uppercase tracking-wide text-gray-400">
              {label}
            </p>
            <p className="mt-1 truncate font-semibold text-gray-800">
              {value}
            </p>
          </div>
        ))}
      </div>
    </a>
  );
}

export function AdminProductRecommendationInsightsView({
  accessToken = "",
  data,
  locale
}: Readonly<{
  accessToken?: string;
  data: AdminProductRecommendationInsightsData;
  locale: Locale;
}>) {
  const [filter, setFilter] = useState<ProductInsightFilter>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) => {
        if (filter === "stale" && !row.isStale) {
          return false;
        }

        if (filter !== "all" && filter !== "stale" && row.primaryOutcome !== filter) {
          return false;
        }

        return !normalizedQuery || productInsightSearchText(row).includes(normalizedQuery);
      }),
    [data.rows, filter, normalizedQuery]
  );
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.succeeded,
      id: "recommended",
      label: "Recommended",
      series: [],
      value: formatNumber(data.summary.recommendedProducts, locale)
    },
    {
      color: businessMetricColors.queued,
      id: "near-miss",
      label: "Near Miss",
      series: [],
      value: formatNumber(data.summary.nearMissProducts, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "rejected",
      label: "Rejected",
      series: [],
      value: formatNumber(data.summary.rejectedProducts, locale)
    },
    {
      color: businessMetricColors.contentDeleted,
      id: "not-evaluated",
      label: "Not Evaluated",
      series: [],
      value: formatNumber(data.summary.notEvaluatedProducts, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "stale",
      label: "Stale",
      series: [],
      value: formatNumber(data.summary.staleProducts, locale)
    }
  ];

  if (!data.databaseAvailable) {
    return (
      <div className="mt-8">
        <EmptyState label="Product insight data is unavailable." />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={metrics} />
      <ProductInsightDistributionBar data={data} locale={locale} />

      <Section
        action={
          <CsvButton
            filename="product-recommendation-insights.csv"
            rows={csvRows(productInsightColumns, filteredRows)}
          />
        }
        eyebrow="Products"
        title="Product Recommendation Insights"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {productInsightFilters.map((item) => (
              <button
                className={classNames(
                  "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  filter === item.id
                    ? "bg-[#20343A] text-white ring-[#20343A]"
                    : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
                )}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex min-w-[16rem] flex-col gap-1 text-xs font-semibold text-gray-500">
            Search
            <input
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Product, brand, reason"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-gray-200">
          {filteredRows.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredRows.map((row) => (
                <ProductInsightRow
                  accessToken={accessToken}
                  key={row.id}
                  locale={locale}
                  row={row}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="No products match the current filters." />
          )}
        </div>
      </Section>
    </div>
  );
}

const supplementColumns: TableColumn<SupplementDemandInsight>[] = [
  { label: "supplement", value: (row) => row.name },
  { label: "status", value: (row) => row.listStatus },
  { label: "category", value: (row) => row.category ?? "" },
  { label: "recommendations", value: (row) => String(row.recommendationCount) },
  { label: "covered", value: (row) => String(row.coveredCount) },
  { label: "reason", value: (row) => row.rationale },
  { label: "last_recommended_at", value: (row) => row.lastRecommendedAt ?? "" }
];

export function AdminSupplementImprovementInsightsView({
  data,
  locale
}: Readonly<{
  data: AdminSupplementImprovementInsightsData;
  locale: Locale;
}>) {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const managedDistribution = useMemo(
    () => data.distribution.filter((row) => row.listStatus !== "missing"),
    [data.distribution]
  );
  const filtered = useMemo(
    () =>
      managedDistribution.filter((row) =>
        (status === "all" || row.listStatus === status) &&
        (category === "all" || row.category === category)
      ),
    [category, managedDistribution, status]
  );
  const managedListStatuses = useMemo(
    () => [...new Set(managedDistribution.map((row) => row.listStatus))],
    [managedDistribution]
  );
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "recommendations",
      label: "Recommendation demand",
      series: [],
      value: formatNumber(data.summary.totalRecommendations, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "active",
      label: "Active supplements",
      series: [],
      value: formatNumber(data.summary.activeSupplementsRecommended, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "missing",
      label: "Missing from list",
      series: [],
      value: formatNumber(data.summary.missingSupplements, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "blocked",
      label: "Blocked demand",
      series: [],
      value: formatNumber(data.summary.blockedOrHiddenRecommendations, locale)
    }
  ];

  return (
    <div className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={metrics} />

      <div className="flex flex-wrap gap-3">
        <SelectFilter
          label="Status"
          onChange={setStatus}
          options={managedListStatuses}
          value={status}
        />
        <SelectFilter
          label="Category"
          onChange={setCategory}
          options={data.filters.categories}
          value={category}
        />
      </div>

      <Section
        action={
          <CsvButton
            filename="managed-list-recommendations.csv"
            rows={csvRows(supplementColumns, filtered)}
          />
        }
        eyebrow="Managed list"
        title="Managed list recommendations"
      >
        <DistributionBars
          labelFor={(row) => row.name}
          locale={locale}
          rows={filtered.slice(0, 30)}
          valueFor={(row) => row.recommendationCount}
        />
      </Section>

      <Section
        action={
          <CsvButton
            filename="supplements-missing-blocked-review.csv"
            rows={csvRows(supplementColumns, data.missingOrBlocked)}
          />
        }
        eyebrow="Action list"
        title="Recommended By AI But Not Cleanly Usable"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Supplement</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Demand</th>
                <th className="py-2 pr-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.missingOrBlocked.length > 0 ? data.missingOrBlocked.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-semibold text-gray-900">{row.name}</td>
                  <td className="py-3 pr-4"><StatusPill status={row.listStatus} /></td>
                  <td className="py-3 pr-4">{formatNumber(row.recommendationCount, locale)}</td>
                  <td className="max-w-xl py-3 pr-4 text-gray-600">{row.rationale}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={4}>
                    No blocked or review-only supplement demand.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
