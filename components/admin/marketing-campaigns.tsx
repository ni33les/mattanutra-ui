"use client";

import { PharmacySourceFunnelTable } from "./pharmacy-source-funnel";
import { McpFunnelTable } from "./mcp-funnel-table";
import { funnelReportCopy } from "@/lib/funnel-report-copy";
import { funnelStageColors } from "./funnel-stage-table";
import { MetaCampaignPanel } from "./meta-campaign-panel";
import type { AdminCampaignRow, AdminCampaignsData } from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";
import { connectCopy } from "@/lib/connect-copy";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  optionalLabel,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";


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
      label: funnelReportCopy[locale].reached,
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
      <h2 className="mb-3 text-lg font-semibold">Web</h2>
      <p className="mb-3 text-sm text-gray-600">{funnelReportCopy[locale].webNote}</p>
      <BusinessStatsGrid metrics={campaignMetrics} />
      <p className="mt-3 text-xs text-gray-600">{funnelReportCopy[locale].evidence
        .replace("{displayed}", formatNumber(data.healthScoreDisplayed ?? 0, locale))
        .replace("{arrivals}", formatNumber(data.summary.healthScoreViews - (data.healthScoreDisplayed ?? 0), locale))}</p>
      {data.connections && <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="font-semibold">{connectCopy[locale].summaryTitle} · {data.connections.environment.toUpperCase()}</h2>
        <p className="mt-2 text-sm">{connectCopy[locale].summaryNote}</p>
        {!data.connections.available ? <p>{connectCopy[locale].summaryUnavailable}</p> : <div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm">
          <thead><tr>{connectCopy[locale].summaryColumns.map(label => <th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.connections.rows.map(row => <tr key={`${row.provider}:${row.locale}`}>
            {[row.provider, row.locale, row.visits, row.selected, row.copied, row.opened].map((value, index) => <td key={index} className="p-2">{value}</td>)}
          </tr>)}</tbody>
        </table></div>}
      </div>}
      {data.meta && <MetaCampaignPanel data={data.meta} locale={locale} />}

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
                  funnelReportCopy[locale].reached,
                  labels.marketingPages.freeRequests,
                  labels.marketingPages.precisionConversions,
                  labels.marketingPages.proConversions,
                  labels.marketingPages.lastSeen
                ].map((heading, index) => (
                  <th
                    className={classNames(
                      "px-4 py-3 text-left text-xs font-semibold text-gray-500",
                      locale === "en" ? "uppercase tracking-[0.14em]" : adminLocaleTextClass(locale, "label")
                    )}
                    style={index >= 4 && index <= 10 ? { borderTop: `3px solid ${funnelStageColors[(["entry", "start", "complete", "result", "result", "conversion", "conversion"] as const)[index - 4]]}` } : undefined}
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
      <PharmacySourceFunnelTable rows={data.pharmacySources ?? []} locale={locale} />
      <McpFunnelTable data={data.mcp} locale={locale} />
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
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.assessmentCompletions, locale)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.healthScoreViews, locale)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatNumber(row.freeRequests, locale)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatNumber(row.precisionConversions, locale)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {formatNumber(row.proConversions, locale)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">
        {formatGeneratedAt(row.lastSeenAt, locale)}
      </td>
    </tr>
  );
}
