"use client";

import { useMemo, useState } from "react";
import type {
  AdminCoverageImprovementInsightsData,
  CoverageFreshnessState,
  CoverageImprovementPlan
} from "@/lib/admin-coverage-improvement-insights";
import type { Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

type FilterState = Readonly<{
  coverageBand: string;
  freshness: string;
  locale: string;
  planType: string;
  retailer: string;
  supplement: string;
  threshold: number;
}>;

const labels = {
  en: {
    aiFallback: "AI fallback",
    aiGenerated: "AI generated",
    aiUnavailable: "AI unavailable",
    all: "All",
    averageCoverage: "Average coverage",
    blockers: "Blockers",
    candidates: "External candidate suggestions",
    coverage: "Coverage",
    coverageBand: "Coverage band",
    distribution: "Coverage distribution",
    downloadLowCoverage: "Export low-coverage plans",
    downloadSupplements: "Export least-matched supplements",
    empty: "No product coverage gaps are visible for this timeframe.",
    exactPlans: "Exact low-coverage customers and plans",
    freshness: "Freshness",
    generated: "Generated",
    leastMatched: "Least-matched supplements",
    locale: "Locale",
    masterOpportunities: "Master-list opportunities",
    medianCoverage: "Median coverage",
    planType: "Plan",
    refreshing: "stale",
    retailer: "Retailer",
    supplement: "Supplement",
    threshold: "Low coverage threshold",
    underThreshold: "Plans below threshold"
  },
  th: {
    aiFallback: "ใช้ข้อความสำรอง AI",
    aiGenerated: "สร้างด้วย AI",
    aiUnavailable: "AI ไม่พร้อมใช้งาน",
    all: "ทั้งหมด",
    averageCoverage: "ความครอบคลุมเฉลี่ย",
    blockers: "สาเหตุที่ติดขัด",
    candidates: "คำแนะนำสินค้าภายนอก",
    coverage: "ความครอบคลุม",
    coverageBand: "ช่วงความครอบคลุม",
    distribution: "การกระจายความครอบคลุม",
    downloadLowCoverage: "ส่งออกแผนความครอบคลุมต่ำ",
    downloadSupplements: "ส่งออกอาหารเสริมที่จับคู่ได้น้อย",
    empty: "ยังไม่พบช่องว่างความครอบคลุมสินค้าในช่วงเวลานี้",
    exactPlans: "ลูกค้าและแผนที่ความครอบคลุมต่ำ",
    freshness: "ความสดของข้อมูล",
    generated: "สร้างเมื่อ",
    leastMatched: "อาหารเสริมที่จับคู่ได้น้อย",
    locale: "ภาษา",
    masterOpportunities: "โอกาสใน master list",
    medianCoverage: "ค่ากลางความครอบคลุม",
    planType: "แผน",
    refreshing: "ข้อมูลเก่า",
    retailer: "ร้านค้า",
    supplement: "อาหารเสริม",
    threshold: "เกณฑ์ความครอบคลุมต่ำ",
    underThreshold: "แผนต่ำกว่าเกณฑ์"
  },
  "zh-CN": {
    aiFallback: "AI 后备",
    aiGenerated: "AI 已生成",
    aiUnavailable: "AI 不可用",
    all: "全部",
    averageCoverage: "平均覆盖率",
    blockers: "阻碍",
    candidates: "外部候选建议",
    coverage: "覆盖率",
    coverageBand: "覆盖区间",
    distribution: "覆盖率分布",
    downloadLowCoverage: "导出低覆盖计划",
    downloadSupplements: "导出低匹配补充剂",
    empty: "此时间范围内没有可见的产品覆盖缺口。",
    exactPlans: "低覆盖客户和计划",
    freshness: "新鲜度",
    generated: "生成时间",
    leastMatched: "最低匹配补充剂",
    locale: "语言",
    masterOpportunities: "主清单机会",
    medianCoverage: "覆盖率中位数",
    planType: "计划",
    refreshing: "过期",
    retailer: "零售商",
    supplement: "补充剂",
    threshold: "低覆盖阈值",
    underThreshold: "低于阈值计划"
  }
} satisfies Record<Locale, Record<string, string>>;

function percent(value: number, locale: Locale) {
  return `${formatNumber(value, locale)}%`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: readonly Record<string, unknown>[]) {
  if (rows.length < 1 || typeof window === "undefined") {
    return;
  }

  const headers = Object.keys(rows[0] ?? {});
  const body = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([body], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function SelectControl({
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
    <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span>{label}</span>
      <select
        className="mt-1 block h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm font-medium normal-case tracking-normal text-gray-900 shadow-sm focus:border-[#1FA77A] focus:outline-none focus:ring-1 focus:ring-[#1FA77A]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function freshnessLabel(state: CoverageFreshnessState) {
  if (state === "fresh") {
    return "fresh";
  }

  if (state === "missing") {
    return "missing run";
  }

  return "stale";
}

function coverageBand(value: number) {
  if (value < 25) {
    return "0-24%";
  }

  if (value < 50) {
    return "25-49%";
  }

  if (value < 75) {
    return "50-74%";
  }

  if (value < 90) {
    return "75-89%";
  }

  return "90-100%";
}

function planMatchesFilters(plan: CoverageImprovementPlan, filters: FilterState) {
  const retailers = plan.selectedProducts
    .map((product) => product.retailerName)
    .filter(Boolean);

  return (
    plan.coveragePercent < filters.threshold &&
    (filters.planType === "All" || plan.selectedPlan === filters.planType) &&
    (filters.locale === "All" || String(plan.locale) === filters.locale) &&
    (filters.freshness === "All" ||
      freshnessLabel(plan.freshnessState) === filters.freshness) &&
    (filters.coverageBand === "All" ||
      coverageBand(plan.coveragePercent) === filters.coverageBand) &&
    (filters.retailer === "All" || retailers.includes(filters.retailer)) &&
    (filters.supplement === "All" ||
      plan.unmatchedSupplements.some(
        (supplement) => supplement === filters.supplement
      ))
  );
}

export function AdminCoverageImprovementInsightsView({
  data,
  locale
}: Readonly<{
  data: AdminCoverageImprovementInsightsData;
  locale: Locale;
}>) {
  const copy = labels[locale];
  const [filters, setFilters] = useState<FilterState>({
    coverageBand: "All",
    freshness: "All",
    locale: "All",
    planType: "All",
    retailer: "All",
    supplement: "All",
    threshold: data.thresholdPercent
  });
  const filteredPlans = useMemo(
    () => data.plans.filter((plan) => planMatchesFilters(plan, filters)),
    [data.plans, filters]
  );
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "averageCoverage",
      label: copy.averageCoverage,
      series: data.coverageDistribution.map((bucket) => bucket.count),
      value: percent(data.summary.averageCoveragePercent, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "medianCoverage",
      label: copy.medianCoverage,
      series: [],
      value: percent(data.summary.medianCoveragePercent, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "belowThreshold",
      label: copy.underThreshold,
      series: [],
      value: formatNumber(filteredPlans.length, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "staleRuns",
      label: copy.refreshing,
      series: [],
      value: formatNumber(data.summary.staleRecommendationRuns, locale)
    }
  ];
  const aiStatus =
    data.aiStatus === "generated"
      ? copy.aiGenerated
      : data.aiStatus === "fallback"
        ? copy.aiFallback
        : copy.aiUnavailable;
  const allOption = copy.all;
  const selectAllOption = "All";
  const freshnessOptions = [
    selectAllOption,
    "fresh",
    "stale",
    "missing run"
  ];
  const bandOptions = [
    selectAllOption,
    "0-24%",
    "25-49%",
    "50-74%",
    "75-89%",
    "90-100%"
  ];

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-500">
            {copy.generated}: {formatGeneratedAt(data.generatedAt, locale)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {aiStatus} · {formatNumber(data.summary.totalPlans, locale)} plans
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
            onClick={() =>
              downloadCsv(
                "coverage-low-plans.csv",
                filteredPlans.map((plan) => ({
                  contactEmail: plan.contactEmail,
                  country: plan.countryCode,
                  coveragePercent: plan.coveragePercent,
                  firstName: plan.firstName,
                  freshness: freshnessLabel(plan.freshnessState),
                  generatedAt: plan.generatedAt,
                  locale: plan.locale,
                  orderNumber: plan.orderNumber,
                  orderStatus: plan.orderStatus,
                  planId: plan.planId,
                  refreshReason: plan.refreshReason,
                  selectedPlan: plan.selectedPlan,
                  unmatchedSupplements: plan.unmatchedSupplements.join("; ")
                }))
              )
            }
            type="button"
          >
            {copy.downloadLowCoverage}
          </button>
          <button
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
            onClick={() =>
              downloadCsv(
                "coverage-least-matched-supplements.csv",
                data.leastMatchedSupplements.map((supplement) => ({
                  affectedPlanCount: supplement.affectedPlanCount,
                  blockerMix: supplement.blockerMix
                    .map((blocker) => `${blocker.reason} (${blocker.count})`)
                    .join("; "),
                  country: supplement.country,
                  demandPlanCount: supplement.demandPlanCount,
                  gapScore: supplement.gapScore,
                  matchRatePercent: supplement.matchRatePercent,
                  matchedPlanCount: supplement.matchedPlanCount,
                  name: supplement.name,
                  unmatchedPlanCount: supplement.unmatchedPlanCount
                }))
              )
            }
            type="button"
          >
            {copy.downloadSupplements}
          </button>
        </div>
      </div>

      <BusinessStatsGrid metrics={metrics} />

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>{copy.threshold}</span>
            <input
              className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-sm font-medium normal-case tracking-normal text-gray-900 shadow-sm focus:border-[#1FA77A] focus:outline-none focus:ring-1 focus:ring-[#1FA77A]"
              max={100}
              min={1}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  threshold: Number(event.target.value) || data.thresholdPercent
                }))
              }
              type="number"
              value={filters.threshold}
            />
          </label>
          <SelectControl
            label={copy.planType}
            onChange={(value) => setFilters((current) => ({ ...current, planType: value }))}
            options={[selectAllOption, ...data.filters.planTypes]}
            value={filters.planType}
          />
          <SelectControl
            label={copy.locale}
            onChange={(value) => setFilters((current) => ({ ...current, locale: value }))}
            options={[selectAllOption, ...data.filters.locales]}
            value={filters.locale}
          />
          <SelectControl
            label={copy.freshness}
            onChange={(value) => setFilters((current) => ({ ...current, freshness: value }))}
            options={freshnessOptions}
            value={filters.freshness}
          />
          <SelectControl
            label={copy.coverageBand}
            onChange={(value) => setFilters((current) => ({ ...current, coverageBand: value }))}
            options={bandOptions}
            value={filters.coverageBand}
          />
          <SelectControl
            label={copy.retailer}
            onChange={(value) => setFilters((current) => ({ ...current, retailer: value }))}
            options={[selectAllOption, ...data.filters.retailers]}
            value={filters.retailer}
          />
          <SelectControl
            label={copy.supplement}
            onChange={(value) => setFilters((current) => ({ ...current, supplement: value }))}
            options={[selectAllOption, ...data.filters.supplements]}
            value={filters.supplement}
          />
        </div>
        <p className="sr-only">{allOption}</p>
      </section>

      {data.summary.totalPlans < 1 ? (
        <section className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
          {copy.empty}
        </section>
      ) : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{copy.distribution}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {data.coverageDistribution.map((bucket) => {
            const max = Math.max(
              1,
              ...data.coverageDistribution.map((item) => item.count)
            );

            return (
              <div key={bucket.id}>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                  <span>{bucket.label}</span>
                  <span>{formatNumber(bucket.count, locale)}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={classNames(
                      "h-full rounded-full",
                      bucket.max < data.thresholdPercent
                        ? "bg-rose-500"
                        : "bg-[#1FA77A]"
                    )}
                    style={{ width: `${Math.max(4, (bucket.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {copy.leastMatched}
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Need</th>
                  <th className="px-4 py-2">{copy.coverage}</th>
                  <th className="px-4 py-2">Plans</th>
                  <th className="py-2 pl-4">{copy.blockers}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.leastMatchedSupplements.slice(0, 18).map((supplement) => (
                  <tr key={supplement.id}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-gray-900">{supplement.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{supplement.country}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {percent(supplement.matchRatePercent, locale)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatNumber(supplement.affectedPlanCount, locale)} affected
                    </td>
                    <td className="py-3 pl-4 text-gray-600">
                      {supplement.blockerMix.length > 0
                        ? supplement.blockerMix
                            .map((blocker) => `${blocker.reason} (${blocker.count})`)
                            .join(", ")
                        : "No suitable retail product"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {copy.candidates}
          </h2>
          <div className="mt-4 space-y-3">
            {data.externalCandidateSuggestions.slice(0, 8).map((candidate) => (
              <div
                className="rounded-lg border border-gray-200 p-3"
                key={`${candidate.supplementId}:${candidate.candidateProductOrSearchPhrase}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {candidate.candidateProductOrSearchPhrase}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {candidate.supplementName} · {candidate.likelyBrandOrSource}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                    {candidate.reviewPriority}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{candidate.whyItMayHelp}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{copy.exactPlans}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Customer</th>
                <th className="px-4 py-2">{copy.coverage}</th>
                <th className="px-4 py-2">{copy.freshness}</th>
                <th className="px-4 py-2">{copy.supplement}</th>
                <th className="px-4 py-2">Products</th>
                <th className="py-2 pl-4">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPlans.slice(0, 80).map((plan) => (
                <tr key={plan.planId}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-gray-900">
                      {plan.firstName || "Unnamed"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{plan.contactEmail}</p>
                    <p className="mt-1 font-mono text-xs text-gray-400">{plan.planId}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {percent(plan.coveragePercent, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={classNames(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        plan.freshnessState === "fresh"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      )}
                    >
                      {freshnessLabel(plan.freshnessState)}
                    </span>
                    {plan.refreshReason ? (
                      <p className="mt-1 text-xs text-gray-500">{plan.refreshReason}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {plan.unmatchedSupplements.slice(0, 5).join(", ") || "None"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {plan.selectedProducts
                      .slice(0, 4)
                      .map((product) => product.title)
                      .join(", ") || "No selected products"}
                  </td>
                  <td className="py-3 pl-4 text-gray-600">
                    {plan.orderNumber ? `${plan.orderNumber} · ${plan.orderStatus}` : "No order"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-base font-semibold text-gray-900">
          {copy.masterOpportunities}
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.masterListOpportunities.slice(0, 20).map((opportunity) => (
            <div
              className="rounded-lg border border-gray-200 p-4"
              key={opportunity.productId}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">
                    {opportunity.productTitle}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {opportunity.opportunityType.replace(/_/g, " ")} ·{" "}
                    {formatNumber(opportunity.affectedPlanCount, locale)} plans
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                  {opportunity.retailerCount} retailers
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-600">{opportunity.action}</p>
              {opportunity.blockerReason ? (
                <p className="mt-2 text-xs text-gray-500">
                  {opportunity.blockerReason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
