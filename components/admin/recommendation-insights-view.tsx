"use client";

import {
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type {
  AdminFoodImprovementInsightsData,
  AdminProductImprovementInsightsData,
  AdminSupplementImprovementInsightsData,
  ExternalProductCandidate,
  FoodOpportunityInsight,
  ImprovementListStatus,
  MasterSupplementAvailabilityInsight,
  PlanCoverageComparison,
  ProductOpportunityInsight,
  SupplementAvailabilityState,
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

function formatPercent(value: number | null | undefined, locale: Locale) {
  if (value === null || value === undefined) {
    return "No score";
  }

  return `${formatNumber(Math.round(value), locale)}%`;
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

const supplementAvailabilityLabels: Record<SupplementAvailabilityState, string> = {
  covered: "Covered",
  missing_master_product: "Find/import product",
  missing_retail_product: "Retailers add product",
  weak_master_product: "Weak master coverage",
  weak_retail_product: "Weak retail coverage"
};

const supplementAvailabilityColors: Record<SupplementAvailabilityState, string> = {
  covered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  missing_master_product: "bg-rose-50 text-rose-700 ring-rose-200",
  missing_retail_product: "bg-amber-50 text-amber-800 ring-amber-200",
  weak_master_product: "bg-orange-50 text-orange-800 ring-orange-200",
  weak_retail_product: "bg-yellow-50 text-yellow-800 ring-yellow-200"
};

function doseText(labels: readonly string[]) {
  const usable = labels.filter((label) => label && label !== "Unparsed");

  return usable.length > 0 ? usable.join(", ") : "Dose not captured";
}

function availabilityPill(state: SupplementAvailabilityState) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${supplementAvailabilityColors[state]}`}>
      {supplementAvailabilityLabels[state]}
    </span>
  );
}

function SupplementAvailabilityTable({
  rows,
  locale
}: Readonly<{
  rows: readonly MasterSupplementAvailabilityInsight[];
  locale: Locale;
}>) {
  const gaps = rows.filter((row) => row.availabilityState !== "covered");

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-4">Supplement</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Demand</th>
            <th className="py-2 pr-4">Master list</th>
            <th className="py-2 pr-4">Retail list</th>
            <th className="py-2 pr-4">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {gaps.length > 0 ? gaps.slice(0, 40).map((row) => (
            <tr key={row.supplementId}>
              <td className="max-w-xs py-3 pr-4">
                <p className="font-semibold text-gray-900">{row.supplementName}</p>
                <p className="mt-1 text-xs text-gray-500">{doseText(row.topDoseLabels)}</p>
              </td>
              <td className="py-3 pr-4">{availabilityPill(row.availabilityState)}</td>
              <td className="py-3 pr-4 text-gray-600">
                {formatNumber(row.affectedPlanCount, locale)} plans
                {row.lowCoveragePlanCount > 0 ? (
                  <span className="block text-xs text-rose-700">
                    {formatNumber(row.lowCoveragePlanCount, locale)} low coverage
                  </span>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-gray-600">
                {formatNumber(row.masterProductCount, locale)} products
                <span className="block text-xs text-gray-500">
                  {formatNumber(row.masterProductsWithDoseCount, locale)} with dose facts
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-600">
                {formatNumber(row.activeRetailerCount, locale)} retailers
                <span className="block text-xs text-gray-500">
                  {formatNumber(row.availableRetailerCount, locale)} stocked now
                </span>
              </td>
              <td className="max-w-md py-3 pr-4 text-gray-600">
                <p>{row.action}</p>
                <p className="mt-1 text-xs text-gray-500">{row.rationale}</p>
              </td>
            </tr>
          )) : (
            <tr>
              <td className="py-4 text-gray-500" colSpan={6}>
                Master supplement coverage is resilient across the current Thailand retail catalogue.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
  { label: "add", value: (row) => String(row.addCount) },
  { label: "review", value: (row) => String(row.reviewCount) },
  { label: "covered", value: (row) => String(row.coveredCount) },
  { label: "hidden", value: (row) => String(row.hiddenCount) },
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
  const filtered = useMemo(
    () =>
      data.distribution.filter((row) =>
        (status === "all" || row.listStatus === status) &&
        (category === "all" || row.category === category)
      ),
    [category, data.distribution, status]
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
      label: "Blocked or hidden demand",
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
          options={data.filters.listStatuses.map((item) => item)}
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
            filename="supplement-improvement-gaps.csv"
            rows={csvRows(supplementColumns, filtered)}
          />
        }
        eyebrow="AI demand"
        title="Supplement Recommendations Across The Managed List"
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
                <th className="py-2 pr-4">Add</th>
                <th className="py-2 pr-4">Review</th>
                <th className="py-2 pr-4">Hidden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.missingOrBlocked.length > 0 ? data.missingOrBlocked.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-semibold text-gray-900">{row.name}</td>
                  <td className="py-3 pr-4"><StatusPill status={row.listStatus} /></td>
                  <td className="py-3 pr-4">{formatNumber(row.recommendationCount, locale)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.addCount, locale)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.reviewCount, locale)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.hiddenCount, locale)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={6}>
                    No missing, blocked, hidden, or review-only supplement demand.
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

const productOpportunityColumns: TableColumn<ProductOpportunityInsight>[] = [
  { label: "product", value: (row) => row.title },
  { label: "action_type", value: (row) => row.opportunityLabel },
  { label: "plan_count", value: (row) => String(row.planCount) },
  { label: "recommendation_count", value: (row) => String(row.recommendationCount) },
  { label: "retailer_count", value: (row) => String(row.retailerCount) },
  { label: "average_coverage_percent", value: (row) => String(row.averageCoveragePercent ?? "") },
  { label: "signals", value: (row) => row.supplementSignals.join("; ") },
  { label: "top_doses", value: (row) => row.topDoseLabels.join("; ") },
  { label: "blocker", value: (row) => row.blockerReason ?? "" },
  { label: "action", value: (row) => row.action },
  { label: "rationale", value: (row) => row.rationale }
];

const planComparisonColumns: TableColumn<PlanCoverageComparison>[] = [
  { label: "plan_id", value: (row) => row.planId },
  { label: "first_name", value: (row) => row.firstName ?? "" },
  { label: "email", value: (row) => row.contactEmail ?? "" },
  { label: "selected_plan", value: (row) => row.selectedPlan ?? "" },
  { label: "current_coverage_percent", value: (row) => String(row.currentCoveragePercent) },
  { label: "optimum_coverage_percent", value: (row) => String(row.optimumCoveragePercent) },
  { label: "optimum_delta_percent", value: (row) => String(row.optimumDeltaPercent) },
  { label: "current_products", value: (row) => row.currentProducts.join("; ") },
  { label: "optimum_products", value: (row) => row.optimumProducts.map((item) => item.title).join("; ") },
  { label: "unmatched_supplements", value: (row) => row.unmatchedSupplements.join("; ") }
];

function ProductCandidateList({
  candidates,
  locale
}: Readonly<{
  candidates: readonly ExternalProductCandidate[];
  locale: Locale;
}>) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {candidates.length > 0 ? candidates.map((candidate, index) => (
        <div
          className="grid grid-cols-[4.5rem_1fr] gap-3 rounded-md border border-gray-200 p-3"
          key={`${candidate.query}:${candidate.productUrl ?? index}`}
        >
          <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-md bg-gray-100">
            {candidate.imageUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                src={candidate.imageUrl}
              />
            ) : (
              <span className="text-xs font-semibold text-gray-400">No image</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1FA77A]">
                {candidate.matchedGapName}
              </p>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                {candidate.searchStatus}
              </span>
            </div>
            <a
              className="mt-1 block text-sm font-semibold text-gray-900 hover:text-[#126B4F]"
              href={candidate.productUrl ?? "#"}
              rel="noreferrer"
              target="_blank"
            >
              {candidate.title ?? "Marketplace product for review"}
            </a>
            <p className="mt-1 text-xs text-gray-500">
              {[candidate.platform, candidate.brandName].filter(Boolean).join(" · ") ||
                "Marketplace adapters returned no product snapshot."}
            </p>
            <p className="mt-2 text-xs text-gray-600">
              {candidate.rationale}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Gap: {candidate.matchedGapName}
              {candidate.matchedDoseLabel ? ` · ${candidate.matchedDoseLabel}` : ""}
              {" · "}
              {formatNumber(candidate.affectedPlanCount, locale)} affected plans
            </p>
            {candidate.evidenceRequired.length > 0 ? (
              <p className="mt-1 text-xs text-gray-500">
                Evidence needed: {candidate.evidenceRequired.join(", ")}
              </p>
            ) : null}
            {candidate.priceAmount !== null ? (
              <p className="mt-2 text-xs font-semibold text-gray-700">
                THB {formatNumber(Math.round(candidate.priceAmount), locale)}
              </p>
            ) : null}
          </div>
        </div>
      )) : (
        <EmptyState label="No external candidate searches have been generated yet." />
      )}
    </div>
  );
}

export function AdminProductImprovementInsightsView({
  data,
  locale
}: Readonly<{
  data: AdminProductImprovementInsightsData;
  locale: Locale;
}>) {
  const [type, setType] = useState("all");
  const types = [...new Set(data.masterListOpportunities.map((row) => row.opportunityType))];
  const filtered = data.masterListOpportunities.filter((row) =>
    type === "all" || row.opportunityType === type
  );
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "opportunities",
      label: "Retail add/restock actions",
      series: [],
      value: formatNumber(data.summary.masterListOpportunityCount, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "retailBlockers",
      label: "Retail blockers",
      series: [],
      value: formatNumber(data.summary.retailBlockerCount, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "lowCoverage",
      label: "Low coverage plans",
      series: [],
      value: formatNumber(data.summary.lowCoveragePlans, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "weakSupplements",
      label: "Weak supplement coverage",
      series: [],
      value: formatNumber(data.summary.weakSupplementCount, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "optimumDelta",
      label: "Avg optimum delta",
      series: [],
      value: formatPercent(data.summary.optimumAverageDeltaPercent, locale)
    }
  ];

  return (
    <div className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={metrics} />

      <Section
        action={
          <CsvButton
            filename="master-supplement-availability.csv"
            rows={csvRows([
              { label: "supplement", value: (row: MasterSupplementAvailabilityInsight) => row.supplementName },
              { label: "status", value: (row) => row.availabilityState },
              { label: "affected_plans", value: (row) => String(row.affectedPlanCount) },
              { label: "low_coverage_plans", value: (row) => String(row.lowCoveragePlanCount) },
              { label: "top_doses", value: (row) => row.topDoseLabels.join("; ") },
              { label: "master_products", value: (row) => String(row.masterProductCount) },
              { label: "dose_fact_products", value: (row) => String(row.masterProductsWithDoseCount) },
              { label: "active_retailers", value: (row) => String(row.activeRetailerCount) },
              { label: "stocked_retailers", value: (row) => String(row.availableRetailerCount) },
              { label: "action", value: (row) => row.action },
              { label: "rationale", value: (row) => row.rationale },
              { label: "search_query", value: (row) => row.recommendedSearchQuery }
            ], data.supplementAvailability)}
          />
        }
        eyebrow="Master supplement coverage"
        title="Master Supplement Availability Matrix"
      >
        <SupplementAvailabilityTable rows={data.supplementAvailability} locale={locale} />
      </Section>

      <div className="flex flex-wrap gap-3">
        <SelectFilter
          label="Opportunity"
          onChange={setType}
          options={types}
          value={type}
        />
      </div>

      <Section
        action={
          <div className="flex flex-wrap gap-2">
            <CsvButton
              filename="product-retail-add-restock-actions.csv"
              rows={csvRows(productOpportunityColumns, filtered)}
            />
            <CsvButton
              filename="product-secondary-review-blockers.csv"
              rows={csvRows(productOpportunityColumns, data.reviewOpportunities)}
            />
          </div>
        }
        eyebrow="Retail coverage"
        title="Retail Products To Add Or Restock"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Plans</th>
                <th className="py-2 pr-4">Avg fit</th>
                <th className="py-2 pr-4">Supplement / dose</th>
                <th className="py-2 pr-4">Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length > 0 ? filtered.map((row) => (
                <tr key={`${row.productId}:${row.opportunityType}`}>
                  <td className="max-w-sm py-3 pr-4 font-semibold text-gray-900">{row.title}</td>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-600">{row.opportunityLabel}</td>
                  <td className="py-3 pr-4">{formatNumber(row.planCount, locale)}</td>
                  <td className="py-3 pr-4">{formatPercent(row.averageCoveragePercent, locale)}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    <p>{row.supplementSignals.join(", ") || "Supplement not recorded"}</p>
                    <p className="mt-1 text-xs text-gray-500">{doseText(row.topDoseLabels)}</p>
                  </td>
                  <td className="max-w-md py-3 pr-4 text-gray-600">
                    <p>{row.action}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.rationale}</p>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={6}>
                    No approved master-list products currently need retail add, reactivation, or restock action.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="Wider search"
        title="External Products To Review For Master List"
      >
        <ProductCandidateList candidates={data.externalCandidates} locale={locale} />
      </Section>

      <Section
        action={
          <CsvButton
            filename="product-plan-current-vs-optimum.csv"
            rows={csvRows(planComparisonColumns, data.planComparisons)}
          />
        }
        eyebrow="Exact plans"
        title="Available Recommendation Vs Best Master-List Candidate"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Customer / plan</th>
                <th className="py-2 pr-4">Current</th>
                <th className="py-2 pr-4">Optimum</th>
                <th className="py-2 pr-4">Delta</th>
                <th className="py-2 pr-4">Optimum candidates</th>
                <th className="py-2 pr-4">Unmatched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.planComparisons.length > 0 ? data.planComparisons.map((row) => (
                <tr key={row.planId}>
                  <td className="max-w-xs py-3 pr-4">
                    <p className="font-semibold text-gray-900">{row.firstName ?? "Unknown"}</p>
                    <p className="text-xs text-gray-500">{row.contactEmail ?? row.planId}</p>
                  </td>
                  <td className="py-3 pr-4">{formatPercent(row.currentCoveragePercent, locale)}</td>
                  <td className="py-3 pr-4">{formatPercent(row.optimumCoveragePercent, locale)}</td>
                  <td className="py-3 pr-4 font-semibold text-[#126B4F]">{formatPercent(row.optimumDeltaPercent, locale)}</td>
                  <td className="max-w-md py-3 pr-4 text-gray-600">
                    {row.optimumProducts.map((item) => item.title).join(", ") || "No master-list candidate recorded"}
                  </td>
                  <td className="max-w-md py-3 pr-4 text-gray-600">
                    {row.unmatchedSupplements.join(", ") || "No unmatched supplements recorded"}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={6}>
                    No current-vs-optimum plan comparisons are available.
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

const foodColumns: TableColumn<FoodOpportunityInsight>[] = [
  { label: "food", value: (row) => row.foodName },
  { label: "status", value: (row) => row.listStatus },
  { label: "recommendations", value: (row) => String(row.recommendationCount) },
  { label: "plans", value: (row) => String(row.planCount) },
  { label: "blocked_plans", value: (row) => String(row.blockedPlanCount) },
  { label: "missing_profile", value: (row) => String(row.missingProfile) },
  { label: "gap_signals", value: (row) => row.gapSignals.join("; ") }
];

export function AdminFoodImprovementInsightsView({
  data,
  locale
}: Readonly<{
  data: AdminFoodImprovementInsightsData;
  locale: Locale;
}>) {
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "foodsRecommended",
      label: "Food recommendations",
      series: [],
      value: formatNumber(data.summary.foodsRecommended, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "uniqueFoods",
      label: "Unique foods",
      series: [],
      value: formatNumber(data.summary.uniqueFoods, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "missingProfiles",
      label: "Missing nutrient profiles",
      series: [],
      value: formatNumber(data.summary.missingNutrientProfiles, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "unknownFoods",
      label: "Unknown foods",
      series: [],
      value: formatNumber(data.summary.unknownFoods, locale)
    }
  ];

  return (
    <div className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={metrics} />

      <Section
        action={
          <CsvButton
            filename="food-improvement-opportunities.csv"
            rows={csvRows(foodColumns, data.foodOpportunities)}
          />
        }
        eyebrow="Food support"
        title="Foods To Improve Formula Outcomes"
      >
        <DistributionBars
          labelFor={(row) => row.foodName}
          locale={locale}
          rows={data.foodOpportunities.slice(0, 30)}
          valueFor={(row) => row.recommendationCount}
        />
      </Section>

      <Section
        title="Blocked, Missing Profile, Or Review-Needed Foods"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Food</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Demand</th>
                <th className="py-2 pr-4">Missing profile</th>
                <th className="py-2 pr-4">Gap signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.foodOpportunities
                .filter((row) => row.listStatus !== "active" || row.missingProfile)
                .map((row) => (
                  <tr key={row.foodId}>
                    <td className="py-3 pr-4 font-semibold text-gray-900">{row.foodName}</td>
                    <td className="py-3 pr-4"><StatusPill status={row.listStatus} /></td>
                    <td className="py-3 pr-4">{formatNumber(row.recommendationCount, locale)}</td>
                    <td className="py-3 pr-4">{row.missingProfile ? "Yes" : "No"}</td>
                    <td className="max-w-lg py-3 pr-4 text-gray-600">{row.gapSignals.join(", ") || "No gap signals recorded"}</td>
                  </tr>
                ))}
              {data.foodOpportunities.filter((row) => row.listStatus !== "active" || row.missingProfile).length < 1 ? (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={5}>
                    No blocked or nutrient-profile food opportunities found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Unknown Foods From Review Tasks">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Food</th>
                <th className="py-2 pr-4">Count</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.unknownFoods.length > 0 ? data.unknownFoods.map((row) => (
                <tr key={`${row.name}:${row.reviewStatus}`}>
                  <td className="py-3 pr-4 font-semibold text-gray-900">{row.name}</td>
                  <td className="py-3 pr-4">{formatNumber(row.count, locale)}</td>
                  <td className="py-3 pr-4 text-gray-600">{row.reviewStatus}</td>
                  <td className="py-3 pr-4 text-gray-600">{row.lastSeenAt ?? "Not recorded"}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={4}>
                    No unknown food review tasks are visible for this timeframe.
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
