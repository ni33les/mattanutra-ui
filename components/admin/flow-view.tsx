"use client";

import { useState } from "react";
import type { AdminFlowData } from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessFunnelTable
} from "@/components/admin/business-overview";
import {
  BusinessStatsGrid,
  BusinessTrendChart,
  businessMetricColors,
  combinedSeries,
  flowNodeSeries,
  formatNumber,
  formatPercent,
  percentageMetricSeries,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

export function AdminFlowView({
  accessToken,
  flowData,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const freeSeries = flowNodeSeries(flowData, "freeEmailRequested");
  const precisionSeries = flowNodeSeries(flowData, "precisionPaid");
  const proSeries = flowNodeSeries(flowData, "proPaid");
  const convertedSeries = combinedSeries(freeSeries, precisionSeries, proSeries);
  const healthScoreSeries = flowNodeSeries(flowData, "healthscoreViewed");
  const conversionRateSeries = percentageMetricSeries(
    convertedSeries,
    healthScoreSeries
  );
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.landingVisitors,
      id: "landingVisitors",
      label: labels.flowSummary.entered,
      series: flowNodeSeries(flowData, "landingViewed"),
      value: formatNumber(flowData.summary.entered, locale)
    },
    {
      color: businessMetricColors.healthScoreViews,
      id: "healthScoreViews",
      label: labels.flowSummary.reachedHealthScore,
      series: healthScoreSeries,
      value: formatNumber(flowData.summary.reachedHealthScore, locale)
    },
    {
      color: businessMetricColors.converted,
      id: "converted",
      label: labels.flowSummary.converted,
      series: convertedSeries,
      value: formatNumber(flowData.summary.converted, locale)
    },
    {
      color: businessMetricColors.conversionRate,
      format: "percent",
      id: "conversionRate",
      label: labels.flowSummary.conversionRate,
      series: conversionRateSeries,
      value: formatPercent(flowData.summary.conversionRate, locale)
    }
  ];
  const [selectedMetricId, setSelectedMetricId] =
    useState<BusinessMetric["id"]>("landingVisitors");
  const selectedMetric =
    metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];

  return (
    <>
      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={setSelectedMetricId}
        selectedMetricId={selectedMetric.id}
      />

      <BusinessTrendChart
        bucketLabels={flowData.series.bucketLabels}
        locale={locale}
        metric={selectedMetric}
      />

      <div className="mt-8">
        <BusinessFunnelTable
          accessToken={accessToken}
          flowData={flowData}
          labels={labels}
          locale={locale}
          showTargets={true}
        />
      </div>
    </>
  );
}
