"use client";

import type { AdminCampaignRow, AdminCampaignsData } from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  formatPercent,
  optionalLabel,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

function marketingConversion(numerator: number, denominator: number, locale: Locale) {
  return denominator > 0 ? formatPercent((numerator / denominator) * 100, locale) : "";
}

export function AdminCampaignsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminCampaignsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const summary = data.summary;
  const campaignMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.landingVisitors,
      id: "landingVisitors",
      label: labels.marketingPages.landed,
      series: [],
      value: formatNumber(summary.landed, locale)
    },
    {
      color: businessMetricColors.healthScoreViews,
      id: "healthScoreViews",
      label: labels.marketingPages.healthScoreViews,
      series: [],
      value: formatNumber(summary.healthScoreViews, locale)
    },
    {
      color: businessMetricColors.freeRequests,
      id: "freeRequests",
      label: labels.marketingPages.freeRequests,
      series: [],
      value: formatNumber(summary.freeRequests, locale)
    },
    {
      color: businessMetricColors.converted,
      id: "converted",
      label: `${labels.marketingPages.precisionConversions} / ${labels.marketingPages.proConversions}`,
      series: [],
      value: `${formatNumber(summary.precisionConversions, locale)} / ${formatNumber(summary.proConversions, locale)}`
    }
  ];

  return (
    <section className="mt-8">
      <BusinessStatsGrid metrics={campaignMetrics} />

      <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  labels.marketingPages.campaign,
                  labels.marketingPages.source,
                  labels.marketingPages.medium,
                  labels.marketingPages.affiliate,
                  labels.marketingPages.landed,
                  labels.marketingPages.assessmentStarts,
                  labels.marketingPages.assessmentCompletions,
                  labels.marketingPages.healthScoreViews,
                  labels.marketingPages.freeRequests,
                  labels.marketingPages.precisionConversions,
                  labels.marketingPages.proConversions,
                  labels.marketingPages.lastSeen
                ].map((heading) => (
                  <th
                    className={classNames(
                      "px-4 py-3 text-left text-xs font-semibold text-gray-500",
                      locale === "en" ? "uppercase tracking-[0.14em]" : adminLocaleTextClass(locale, "label")
                    )}
                    key={heading}
                    scope="col"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.rows.length > 0 ? (
                data.rows.map((row) => (
                  <CampaignRow
                    key={[
                      row.source,
                      row.medium,
                      row.campaign,
                      row.campaignId,
                      row.affiliate,
                      row.promoCode
                    ].join(":")}
                    locale={locale}
                    row={row}
                  />
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-sm font-medium text-gray-500"
                    colSpan={12}
                  >
                    {labels.marketingPages.emptyCampaigns}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CampaignRow({
  locale,
  row
}: Readonly<{
  locale: Locale;
  row: AdminCampaignRow;
}>) {
  const paidConversions = row.precisionConversions + row.proConversions;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-4 text-sm font-semibold text-gray-900">
        <div>{optionalLabel(row.campaign)}</div>
        <div className="mt-1 text-xs font-medium text-gray-400">
          {optionalLabel(row.campaignId)}
          {row.promoCode ? ` · ${row.promoCode}` : ""}
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{optionalLabel(row.source)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{optionalLabel(row.medium)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{optionalLabel(row.affiliate)}</td>
      <td className="px-4 py-4 text-sm font-medium text-gray-900">
        {formatNumber(row.landed, locale)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.assessmentStarts, locale)}
        <span className="ml-2 text-xs text-gray-400">
          {marketingConversion(row.assessmentStarts, row.landed, locale)}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.assessmentCompletions, locale)}
        <span className="ml-2 text-xs text-gray-400">
          {marketingConversion(row.assessmentCompletions, row.assessmentStarts, locale)}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.healthScoreViews, locale)}
        <span className="ml-2 text-xs text-gray-400">
          {marketingConversion(row.healthScoreViews, row.assessmentCompletions, locale)}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatNumber(row.freeRequests, locale)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatNumber(row.precisionConversions, locale)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.proConversions, locale)}
        <span className="ml-2 text-xs text-gray-400">
          {marketingConversion(paidConversions, row.healthScoreViews, locale)}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">
        {formatGeneratedAt(row.lastSeenAt, locale)}
      </td>
    </tr>
  );
}

