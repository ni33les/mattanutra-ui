"use client";

import {
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type {
  AdminSupplementImprovementInsightsData,
  ImprovementListStatus,
  SupplementDemandInsight
} from "@/lib/admin-recommendation-insights";
import {
  BusinessStatsGrid,
  businessMetricColors,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

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

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en"
  ).format(value);
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
  const outsideMasterList = data.outsideMasterList;
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
            filename="ai-recommendations-outside-master-list.csv"
            rows={csvRows(supplementColumns, outsideMasterList)}
          />
        }
        eyebrow="Outside master list"
        title="AI Recommendations Outside The Master List"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Supplement</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Demand</th>
                <th className="py-2 pr-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {outsideMasterList.length > 0 ? outsideMasterList.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-semibold text-gray-900">{row.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{row.category ?? "Uncategorised"}</td>
                  <td className="py-3 pr-4">{formatNumber(row.recommendationCount, locale)}</td>
                  <td className="max-w-xl py-3 pr-4 text-gray-600">{row.rationale}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={4}>
                    No unignored AI supplement recommendations are outside the master list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
