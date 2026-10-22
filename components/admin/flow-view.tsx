"use client";

import { McpFunnelTable } from "./mcp-funnel-table";
import { PharmacySourceFunnelTable } from "./pharmacy-source-funnel";
import { useState } from "react";
import type { AdminFlowData } from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessFunnelTable,
  webProductSummaryMetrics,
  WebProductConversionNote
} from "@/components/admin/business-overview";
import {
  BusinessStatsGrid,
  BusinessTrendChart,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

export function AdminFlowView({
  canReadLeads = false,
  accessToken,
  flowData,
  labels,
  locale
}: Readonly<{
  canReadLeads?: boolean;
  accessToken: string;
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const metrics = webProductSummaryMetrics(flowData, locale);
  const [selectedMetricId, setSelectedMetricId] =
    useState<BusinessMetric["id"]>("quizLandingViewed");
  const selectedMetric =
    metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];

  return (
    <>
      {!flowData.reportingLimitExceeded && <>
      <div data-testid="web-product-summary">
      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={setSelectedMetricId}
        selectedMetricId={selectedMetric.id}
      />
      </div>

      <WebProductConversionNote flowData={flowData} locale={locale} />

      <BusinessTrendChart
        bucketLabels={flowData.series.bucketLabels}
        locale={locale}
        metric={selectedMetric}
      />

      </>}

      <div className="mt-8 grid w-full min-w-0 grid-cols-1 gap-8 [&>section]:mt-0 [&>section]:min-w-0">
        <BusinessFunnelTable
          canReadLeads={canReadLeads}
          accessToken={accessToken}
          flowData={flowData}
          labels={labels}
          locale={locale}
          showTargets={true}
        />
        <PharmacySourceFunnelTable rows={flowData.pharmacySources ?? []} locale={locale} report={flowData.questionnaire} labels={labels} canReadLeads={canReadLeads} />
        <McpFunnelTable data={flowData.mcp} locale={locale} />
      </div>
    </>
  );
}
