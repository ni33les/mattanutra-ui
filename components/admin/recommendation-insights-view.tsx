"use client";

import type { Locale } from "@/lib/i18n";
import type {
  AdminRecommendationInsightsData,
  InsightBucketRow,
  InsightRankRow
} from "@/lib/admin-recommendation-insights";
import {
  BusinessStatsGrid,
  BusinessTrendChart,
  businessMetricColors,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

type BaseLocale = Exclude<Locale, "zh-CN">;

const baseLabels = {
  en: {
    coverage: "Coverage",
    doseBuckets: "Dose buckets",
    empty: "No recommendation insight data is available for this timeframe.",
    nearMisses: "Near misses",
    noDoseBuckets: "No dose buckets are available for this timeframe.",
    productOutcomes: "Product outcomes",
    products: "Products",
    rejectionReasons: "Rejection reasons",
    safetyHidden: "Safety hidden",
    servingBuckets: "Serving multipliers",
    supplements: "Supplements",
    topChosenProducts: "Top chosen products",
    topSupplements: "Top supplement needs",
    trendProducts: "Chosen products",
    trendSupplements: "Supplement needs",
    unmatched: "Unmatched supplements"
  },
  th: {
    coverage: "ความครอบคลุม",
    doseBuckets: "กลุ่มขนาดรับประทาน",
    empty: "ยังไม่มีข้อมูลเชิงลึกของคำแนะนำในช่วงเวลานี้",
    nearMisses: "สินค้าที่เกือบถูกเลือก",
    noDoseBuckets: "ยังไม่มีกลุ่มขนาดรับประทานในช่วงเวลานี้",
    productOutcomes: "ผลลัพธ์สินค้า",
    products: "สินค้า",
    rejectionReasons: "เหตุผลที่ไม่เลือก",
    safetyHidden: "ซ่อนเพื่อความปลอดภัย",
    servingBuckets: "จำนวนเสิร์ฟ",
    supplements: "อาหารเสริม",
    topChosenProducts: "สินค้าที่ถูกเลือกมากที่สุด",
    topSupplements: "ความต้องการอาหารเสริมสูงสุด",
    trendProducts: "สินค้าที่ถูกเลือก",
    trendSupplements: "ความต้องการอาหารเสริม",
    unmatched: "อาหารเสริมที่ยังไม่จับคู่"
  }
} satisfies Record<BaseLocale, Record<string, string>>;

const labels = {
  ...baseLabels,
  "zh-CN": {
    coverage: "覆盖率",
    doseBuckets: "剂量分组",
    empty: "此时间范围内没有推荐洞察数据。",
    nearMisses: "接近入选",
    noDoseBuckets: "此时间范围内没有剂量分组。",
    productOutcomes: "产品结果",
    products: "产品",
    rejectionReasons: "未选原因",
    safetyHidden: "因安全隐藏",
    servingBuckets: "服用倍数",
    supplements: "补充剂",
    topChosenProducts: "最常入选产品",
    topSupplements: "最高补充剂需求",
    trendProducts: "入选产品",
    trendSupplements: "补充剂需求",
    unmatched: "未匹配补充剂"
  }
} satisfies Record<Locale, Record<string, string>>;

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en"
  ).format(value);
}

function RankList({
  emptyLabel,
  locale,
  rows,
  title
}: Readonly<{
  emptyLabel: string;
  locale: Locale;
  rows: InsightRankRow[];
  title: string;
}>) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="mt-5 space-y-4">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <div key={`${row.id}:${row.label}:${index}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {row.label}
                  </p>
                  {row.secondaryLabel ? (
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {row.secondaryLabel}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {formatNumber(row.count, locale)}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#1FA77A]"
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

function BucketPanel({
  emptyLabel,
  locale,
  rows,
  title
}: Readonly<{
  emptyLabel: string;
  locale: Locale;
  rows: InsightBucketRow[];
  title: string;
}>) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {rows.length > 0 ? (
          rows.map((row) => (
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200"
              key={`${row.parentLabel ?? ""}:${row.label}`}
            >
              <span className="truncate">
                {row.parentLabel ? `${row.parentLabel}: ` : ""}
                {row.label}
              </span>
              <span className="text-gray-400">
                {formatNumber(row.count, locale)}
              </span>
            </span>
          ))
        ) : (
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

function DoseBucketChart({
  emptyLabel,
  locale,
  rows,
  title
}: Readonly<{
  emptyLabel: string;
  locale: Locale;
  rows: InsightBucketRow[];
  title: string;
}>) {
  const grouped = rows.reduce<Map<string, InsightBucketRow[]>>((map, row) => {
    const parent = row.parentLabel || "Other";
    const list = map.get(parent) ?? [];

    list.push(row);
    map.set(parent, list);

    return map;
  }, new Map());
  const groups = [...grouped.entries()]
    .map(([supplement, buckets]) => ({
      buckets: [...buckets].sort(
        (first, second) =>
          second.count - first.count || first.label.localeCompare(second.label)
      ),
      supplement,
      total: buckets.reduce((sum, bucket) => sum + bucket.count, 0)
    }))
    .sort(
      (first, second) =>
        second.total - first.total ||
        first.supplement.localeCompare(second.supplement)
    );
  const maxBucketCount = Math.max(
    1,
    ...groups.flatMap((group) => group.buckets.map((bucket) => bucket.count))
  );

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {groups.length > 0 ? (
          <p className="text-xs font-medium text-gray-400">
            {formatNumber(rows.reduce((sum, row) => sum + row.count, 0), locale)}
          </p>
        ) : null}
      </div>

      <div className="mt-5 space-y-6">
        {groups.length > 0 ? (
          groups.map((group) => (
            <div key={group.supplement}>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                  {group.supplement}
                </p>
                <p className="shrink-0 text-xs font-semibold text-gray-400">
                  {formatNumber(group.total, locale)}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {group.buckets.map((bucket) => (
                  <div
                    className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3"
                    key={`${group.supplement}:${bucket.label}`}
                  >
                    <p className="truncate text-xs font-medium text-gray-500">
                      {bucket.label}
                    </p>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#1FA77A]"
                        style={{
                          width: `${Math.max(5, (bucket.count / maxBucketCount) * 100)}%`
                        }}
                      />
                    </div>
                    <p className="text-xs font-semibold tabular-nums text-gray-700">
                      {formatNumber(bucket.count, locale)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

export function AdminRecommendationInsightsView({
  data,
  locale,
  mode
}: Readonly<{
  data: AdminRecommendationInsightsData;
  locale: Locale;
  mode: "products" | "supplements";
}>) {
  const copy = labels[locale];
  const supplementMode = mode === "supplements";
  const hasRows = supplementMode
    ? data.supplementTop.length > 0
    : data.productTopChosen.length > 0 || data.productTopNearMisses.length > 0;
  const metrics: BusinessMetric[] = supplementMode
    ? [
        {
          color: businessMetricColors.total,
          id: "supplementNeeds",
          label: copy.trendSupplements,
          series: data.trend.supplementChosen,
          value: formatNumber(data.summary.chosenSupplementPlans, locale)
        },
        {
          color: businessMetricColors.medium,
          id: "safetyHiddenSupplements",
          label: copy.safetyHidden,
          series: [],
          value: formatNumber(data.summary.safetyHiddenSupplements, locale)
        },
        {
          color: businessMetricColors.failed,
          id: "unmatchedSupplements",
          label: copy.unmatched,
          series: [],
          value: formatNumber(data.summary.unmatchedSupplements, locale)
        }
      ]
    : [
        {
          color: businessMetricColors.succeeded,
          id: "chosenProducts",
          label: copy.trendProducts,
          series: data.trend.productChosen,
          value: formatNumber(data.summary.chosenProductPlans, locale)
        },
        {
          color: businessMetricColors.medium,
          id: "nearMissProducts",
          label: copy.nearMisses,
          series: [],
          value: formatNumber(data.summary.nearMissProducts, locale)
        },
        {
          color: businessMetricColors.failed,
          id: "rejectedProducts",
          label: copy.rejectionReasons,
          series: [],
          value: formatNumber(data.summary.rejectedProducts, locale)
        }
      ];
  const trendMetric: BusinessMetric = {
    color: supplementMode ? businessMetricColors.total : businessMetricColors.succeeded,
    id: "trend",
    label: supplementMode ? copy.trendSupplements : copy.trendProducts,
    series: supplementMode ? data.trend.supplementChosen : data.trend.productChosen,
    value: formatNumber(
      supplementMode
        ? data.summary.chosenSupplementPlans
        : data.summary.chosenProductPlans,
      locale
    )
  };

  return (
    <div className="mt-8">
      <BusinessStatsGrid metrics={metrics} />

      {!hasRows ? (
        <div className="mt-6 rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
          {copy.empty}
        </div>
      ) : null}

      {data.trend.bucketLabels.length > 0 ? (
        <BusinessTrendChart
          bucketLabels={data.trend.bucketLabels}
          locale={locale}
          metric={trendMetric}
        />
      ) : null}

      {supplementMode ? (
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RankList
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.supplementTop}
            title={copy.topSupplements}
          />
          <DoseBucketChart
            emptyLabel={copy.noDoseBuckets}
            locale={locale}
            rows={data.supplementDoseBuckets}
            title={copy.doseBuckets}
          />
          <BucketPanel
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.supplementStatusMix}
            title={copy.supplements}
          />
          <RankList
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.unmatchedSupplements}
            title={copy.unmatched}
          />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RankList
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.productTopChosen}
            title={copy.topChosenProducts}
          />
          <BucketPanel
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.productServingBuckets}
            title={copy.servingBuckets}
          />
          <RankList
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.productTopNearMisses}
            title={copy.nearMisses}
          />
          <RankList
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.unmetOrCoveredNeeds}
            title={copy.coverage}
          />
          <BucketPanel
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.productOutcomeMix}
            title={copy.productOutcomes}
          />
          <BucketPanel
            emptyLabel={copy.empty}
            locale={locale}
            rows={data.productRejectionReasons}
            title={copy.rejectionReasons}
          />
        </div>
      )}
    </div>
  );
}
