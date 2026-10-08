"use client";

import { useState } from "react";
import { FunnelStageTable, type FunnelTableRow } from "./funnel-stage-table";
import { funnelReportCopy } from "@/lib/funnel-report-copy";
import { PharmacySourceFunnelTable } from "./pharmacy-source-funnel";
import { QuestionnaireFunnel } from "./questionnaire-funnel";
import { McpFunnelTable } from "./mcp-funnel-table";
import type { AdminDashboardData } from "@/lib/admin-dashboard-data";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { AdminCommunicationsData } from "@/lib/admin-communications";
import type { AdminTechnicalAlertsData } from "@/lib/admin-technical";
import type { AdminReviewQueueData } from "@/lib/admin-review-queue";
import type { AdminConversionTargetId, AdminConversionTargets, AdminFlowData } from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  BusinessTrendChart,
  adminLocaleTextClass,
  adminHref,
  businessMetricColors,
  classNames,
  flowNodeCount,
  flowNodeSeries,
  formatNumber,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

type BusinessFunnelStage = Readonly<{
  count: number;
  conversionBasis?: string;
  isOutcome?: boolean;
  id: AdminConversionTargetId;
  isEntry?: boolean;
  label: string;
  targetConversion: number;
}>;

function businessFunnelStages(
  flowData: AdminFlowData,
  labels: AdminContent,
  locale: Locale,
  targets: AdminConversionTargets = flowData.targets
): BusinessFunnelStage[] {
  const landed = flowNodeCount(flowData, "landingViewed");
  const started = flowNodeCount(flowData, "assessmentStarted");
  const completed = flowNodeCount(flowData, "assessmentSubmitted");
  const healthScore = flowNodeCount(flowData, "healthscoreViewed");

  return [
    {
      count: landed,
      id: "landingVisitors",
      isEntry: true,
      label: labels.atAGlance.landingVisitors,
      targetConversion: targets.landingVisitors
    },
    {
      count: started,
      conversionBasis: funnelReportCopy[locale].visits,
      id: "assessmentStarts",
      label: labels.atAGlance.assessmentStarts,
      targetConversion: targets.assessmentStarts
    },
    {
      count: completed,
      conversionBasis: labels.atAGlance.assessmentStarts,
      id: "assessmentCompletions",
      label: labels.atAGlance.assessmentCompletions,
      targetConversion: targets.assessmentCompletions
    },
    {
      count: healthScore,
      conversionBasis: labels.atAGlance.assessmentCompletions,
      id: "healthScoreViews",
      label: labels.atAGlance.healthScoreViews,
      targetConversion: targets.healthScoreViews
    },
    {
      count: flowNodeCount(flowData, "precisionPaid"),
      conversionBasis: funnelReportCopy[locale].reached,
      isOutcome: true,
      id: "precisionConversions",
      label: labels.atAGlance.precisionConversions,
      targetConversion: targets.precisionConversions
    },
    {
      count: flowNodeCount(flowData, "proPaid"),
      conversionBasis: funnelReportCopy[locale].reached,
      isOutcome: true,
      id: "proConversions",
      label: labels.atAGlance.proConversions,
      targetConversion: targets.proConversions
    },
    {
      count: flowNodeCount(flowData, "retailOrderCreated"),
      conversionBasis: funnelReportCopy[locale].reached,
      isOutcome: true,
      id: "productOrders",
      label: labels.atAGlance.productOrders,
      targetConversion: targets.productOrders
    }
  ];
}

export function BusinessFunnelTable({
  canReadLeads = false,
  accessToken,
  flowData,
  labels,
  locale,
  showTargets = false
}: Readonly<{
  canReadLeads?: boolean;
  accessToken?: string;
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
  showTargets?: boolean;
}>) {
  const [editingTargets, setEditingTargets] = useState(false);
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [targetSaveError, setTargetSaveError] = useState<string | null>(null);
  const [targets, setTargets] = useState<AdminConversionTargets>(
    flowData.targets
  );
  const [draftTargets, setDraftTargets] = useState<AdminConversionTargets>(
    flowData.targets
  );

  const activeTargets = editingTargets ? draftTargets : targets;

  async function saveTargets() {
    if (!accessToken) {
      setTargetSaveError(labels.atAGlance.targetSaveError);
      return;
    }

    setIsSavingTargets(true);
    setTargetSaveError(null);

    try {
      const response = await fetch("/api/admin/conversion-targets", {
        body: JSON.stringify({
          accessToken,
          targets: draftTargets
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to save targets");
      }

      const payload = (await response.json()) as {
        targets?: AdminConversionTargets;
      };
      const savedTargets = payload.targets ?? draftTargets;

      setTargets(savedTargets);
      setDraftTargets(savedTargets);
      setEditingTargets(false);
    } catch {
      setTargetSaveError(labels.atAGlance.targetSaveError);
    } finally {
      setIsSavingTargets(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {funnelReportCopy[locale].web}
        </h2>
        {showTargets ? (
          <div className="flex items-center gap-2">
            {editingTargets ? (
              <>
                <button
                  type="button"
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60"
                  disabled={isSavingTargets}
                  onClick={() => {
                    setDraftTargets(targets);
                    setEditingTargets(false);
                    setTargetSaveError(null);
                  }}
                >
                  {labels.atAGlance.cancel}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#168B65] disabled:opacity-60"
                  disabled={isSavingTargets}
                  onClick={saveTargets}
                >
                  {labels.atAGlance.saveTargets}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                onClick={() => {
                  setDraftTargets(targets);
                  setEditingTargets(true);
                  setTargetSaveError(null);
                }}
              >
                {labels.atAGlance.editTargets}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {targetSaveError ? (
        <p className="mt-3 text-sm font-medium text-red-700">
          {targetSaveError}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-gray-600">{funnelReportCopy[locale].webNote}</p>
      <FunnelStageTable locale={locale} caption={funnelReportCopy[locale].web} targets={showTargets}
        rows={businessFunnelStages(flowData, labels, locale, activeTargets).map((stage, index): FunnelTableRow => ({
          id: stage.id,
          label: stage.id === "landingVisitors" ? funnelReportCopy[locale].visits : stage.id === "healthScoreViews" ? funnelReportCopy[locale].reached : stage.label,
          count: stage.count,
          color: (["entry", "start", "complete", "result", "conversion", "conversion", "order"] as const)[index],
          entry: stage.isEntry,
          denominator: flowData.transitions?.[stage.id]?.denominator,
          numerator: flowData.transitions?.[stage.id]?.numerator,
          conversionBasis: stage.conversionBasis,
          showDropoff: !stage.isOutcome,
          target: stage.targetConversion,
          targetControl: editingTargets ? <input
            aria-label={`${labels.atAGlance.target}: ${stage.label}`}
            className="ml-auto block w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right"
            max={100} min={0} step={0.1} type="number" value={draftTargets[stage.id]}
            onChange={event => {
              const parsed = Number(event.target.value);
              setDraftTargets(current => ({ ...current, [stage.id]: Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0 }));
            }} /> : undefined
        }))} />
      <p className="mt-3 text-xs text-gray-600">{funnelReportCopy[locale].outcomesNote}</p>
      <p className="mt-3 text-xs text-gray-600">{funnelReportCopy[locale].evidence
        .replace("{displayed}", formatNumber(flowNodeCount(flowData, "healthscoreDisplayed"), locale))
        .replace("{arrivals}", formatNumber(flowNodeCount(flowData, "healthscoreViewed") - flowNodeCount(flowData, "healthscoreDisplayed"), locale))}</p>
      <QuestionnaireFunnel report={flowData.questionnaire} journey="web" locale={locale} labels={labels} canReadLeads={canReadLeads} />
    </section>
  );
}

export function AdminAtAGlanceView({
  canReadLeads = false,
  accessToken,
  alertsData,
  communicationsData,
  data,
  filters,
  flowData,
  labels,
  locale,
  reviewQueueData
}: Readonly<{
  canReadLeads?: boolean;
  accessToken: string;
  alertsData: AdminTechnicalAlertsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
  reviewQueueData: AdminReviewQueueData;
}>) {
  const communicationIssues =
    communicationsData.summary.failed + communicationsData.summary.noChannel;
  const siteIssues =
    alertsData.summary.critical + alertsData.summary.high;
  const attentionItems = [
    {
      count: reviewQueueData.summary.total,
      href: adminHref(locale, accessToken, data.range, "reviews", filters),
      label: labels.atAGlance.pendingReviews
    },
    {
      count: reviewQueueData.summary.unknown,
      href: adminHref(locale, accessToken, data.range, "reviews", filters),
      label: labels.reviewQueue.unknown
    },
    {
      count: communicationIssues,
      href: adminHref(locale, accessToken, data.range, "communications", filters),
      label: labels.atAGlance.customerContactIssues
    },
    {
      count: siteIssues,
      href: adminHref(locale, accessToken, data.range, "alerts", filters),
      label: labels.atAGlance.criticalAlerts
    }
  ].filter((item) => item.count > 0);
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.landingVisitors,
      id: "landingVisitors",
      label: labels.atAGlance.landingVisitors,
      series: flowNodeSeries(flowData, "landingViewed"),
      value: formatNumber(flowNodeCount(flowData, "landingViewed"), locale)
    },
    {
      color: businessMetricColors.assessmentStarts,
      id: "assessmentStarts",
      label: labels.atAGlance.assessmentStarts,
      series: flowNodeSeries(flowData, "assessmentStarted"),
      value: formatNumber(flowNodeCount(flowData, "assessmentStarted"), locale)
    },
    {
      color: businessMetricColors.assessmentCompletions,
      id: "assessmentCompletions",
      label: labels.atAGlance.assessmentCompletions,
      series: flowNodeSeries(flowData, "assessmentSubmitted"),
      value: formatNumber(flowNodeCount(flowData, "assessmentSubmitted"), locale)
    },
    {
      color: businessMetricColors.healthScoreViews,
      id: "healthScoreViews",
      label: labels.atAGlance.healthScoreViews,
      series: flowNodeSeries(flowData, "healthscoreViewed"),
      value: formatNumber(flowNodeCount(flowData, "healthscoreViewed"), locale)
    },
    {
      color: businessMetricColors.precisionConversions,
      id: "precisionConversions",
      label: labels.atAGlance.precisionConversions,
      series: flowNodeSeries(flowData, "precisionPaid"),
      value: formatNumber(flowNodeCount(flowData, "precisionPaid"), locale)
    },
    {
      color: businessMetricColors.proConversions,
      id: "proConversions",
      label: labels.atAGlance.proConversions,
      series: flowNodeSeries(flowData, "proPaid"),
      value: formatNumber(flowNodeCount(flowData, "proPaid"), locale)
    },
    {
      color: businessMetricColors.contentScheduled,
      id: "productOrders",
      label: labels.atAGlance.productOrders,
      series: flowNodeSeries(flowData, "retailOrderCreated"),
      value: formatNumber(flowNodeCount(flowData, "retailOrderCreated"), locale)
    },
    {
      color: businessMetricColors.pendingReviews,
      id: "pendingReviews",
      label: labels.atAGlance.pendingReviews,
      series: flowData.series.bucketLabels.map(() => reviewQueueData.summary.total),
      value: formatNumber(reviewQueueData.summary.total, locale)
    }
  ];
  const [selectedMetricId, setSelectedMetricId] =
    useState<BusinessMetric["id"]>("landingVisitors");
  const selectedMetric =
    metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];

  return (
    <>
      <BusinessStatsGrid
        layout="stacked"
        metrics={metrics}
        onMetricSelect={setSelectedMetricId}
        selectedMetricId={selectedMetric.id}
      />

      <BusinessTrendChart
        bucketLabels={flowData.series.bucketLabels}
        locale={locale}
        metric={selectedMetric}
      />

      <div className="mt-8 grid w-full min-w-0 grid-cols-1 gap-8 [&>section]:mt-0 [&>section]:min-w-0">
        <BusinessFunnelTable flowData={flowData} labels={labels} locale={locale} canReadLeads={canReadLeads} />
        <PharmacySourceFunnelTable rows={flowData.pharmacySources ?? []} locale={locale} report={flowData.questionnaire} labels={labels} canReadLeads={canReadLeads} />
        <McpFunnelTable data={flowData.mcp} locale={locale} />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2
            className={classNames(
              "text-sm font-semibold text-gray-500",
              locale === "en" ? "uppercase tracking-[0.16em]" : adminLocaleTextClass(locale, "label")
            )}
          >
            {labels.atAGlance.attentionTitle}
          </h2>
          <div className="mt-4 space-y-3">
            {attentionItems.length > 0 ? (
              attentionItems.map((item) => (
                <a
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 ring-1 ring-gray-100 transition hover:bg-gray-100"
                  href={item.href}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 ring-1 ring-gray-200">
                    {formatNumber(item.count, locale)}
                  </span>
                </a>
              ))
            ) : (
              <p className="rounded-xl bg-[#ECFDF5] px-4 py-3 text-sm font-medium text-[#126B4F] ring-1 ring-[#A7F3D0]">
                {labels.atAGlance.attentionClear}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
