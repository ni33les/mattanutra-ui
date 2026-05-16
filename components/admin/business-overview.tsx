"use client";

import { useState } from "react";
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
  adminHref,
  businessMetricColors,
  classNames,
  flowNodeCount,
  flowNodeSeries,
  formatLocale,
  formatNumber,
  formatPercent,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

type BusinessFunnelStage = Readonly<{
  count: number;
  denominator: number | null;
  id: AdminConversionTargetId;
  isEntry?: boolean;
  label: string;
  targetConversion: number;
}>;

function businessFunnelStages(
  flowData: AdminFlowData,
  labels: AdminContent,
  targets: AdminConversionTargets = flowData.targets
): BusinessFunnelStage[] {
  const landed = flowNodeCount(flowData, "landingViewed");
  const started = flowNodeCount(flowData, "assessmentStarted");
  const completed = flowNodeCount(flowData, "assessmentSubmitted");
  const healthScore = flowNodeCount(flowData, "healthscoreViewed");

  return [
    {
      count: landed,
      denominator: null,
      id: "landingVisitors",
      isEntry: true,
      label: labels.atAGlance.landingVisitors,
      targetConversion: targets.landingVisitors
    },
    {
      count: started,
      denominator: landed,
      id: "assessmentStarts",
      label: labels.atAGlance.assessmentStarts,
      targetConversion: targets.assessmentStarts
    },
    {
      count: completed,
      denominator: started,
      id: "assessmentCompletions",
      label: labels.atAGlance.assessmentCompletions,
      targetConversion: targets.assessmentCompletions
    },
    {
      count: healthScore,
      denominator: completed,
      id: "healthScoreViews",
      label: labels.atAGlance.healthScoreViews,
      targetConversion: targets.healthScoreViews
    },
    {
      count: flowNodeCount(flowData, "freeEmailRequested"),
      denominator: healthScore,
      id: "freeRequests",
      label: labels.atAGlance.freeRequests,
      targetConversion: targets.freeRequests
    },
    {
      count: flowNodeCount(flowData, "precisionPaid"),
      denominator: healthScore,
      id: "precisionConversions",
      label: labels.atAGlance.precisionConversions,
      targetConversion: targets.precisionConversions
    },
    {
      count: flowNodeCount(flowData, "proPaid"),
      denominator: healthScore,
      id: "proConversions",
      label: labels.atAGlance.proConversions,
      targetConversion: targets.proConversions
    }
  ];
}

function stageActualConversion(stage: BusinessFunnelStage) {
  if (stage.isEntry) {
    return stage.count > 0 ? 100 : null;
  }

  return stage.denominator && stage.denominator > 0
    ? (stage.count / stage.denominator) * 100
    : null;
}

function conversionTargetClass(
  actualConversion: number | null,
  targetConversion: number
) {
  if (actualConversion === null) {
    return "bg-white";
  }

  const targetAchievement =
    targetConversion > 0 ? actualConversion / targetConversion : 1;

  if (targetAchievement >= 1) {
    return "bg-[#ECFDF5]";
  }

  if (targetAchievement >= 0.75) {
    return "bg-amber-50";
  }

  return "bg-red-50";
}

function conversionDeltaClass(delta: number | null) {
  if (delta === null) {
    return "text-gray-500";
  }

  if (delta >= 0) {
    return "text-[#126B4F]";
  }

  if (delta >= -10) {
    return "text-amber-800";
  }

  return "text-red-700";
}

function formatConversionDelta(delta: number, locale: Locale) {
  const formatted = new Intl.NumberFormat(formatLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(delta) ? 0 : 1,
    signDisplay: "always"
  }).format(delta);

  return `${formatted} pp`;
}

export function BusinessFunnelTable({
  accessToken,
  flowData,
  labels,
  locale,
  showTargets = false
}: Readonly<{
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
          {labels.atAGlance.conversionSnapshot}
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
      <div className="mt-6 flow-root">
        <div className="-mx-5 -my-2 overflow-x-auto">
          <div className="inline-block min-w-full py-2 align-middle px-5">
            <div className="overflow-hidden shadow-sm outline-1 outline-black/5 sm:rounded-lg">
              <table className="relative min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                      scope="col"
                    >
                      {labels.atAGlance.stage}
                    </th>
                    <th
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.atAGlance.count}
                    </th>
                    <th
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.atAGlance.dropoff}
                    </th>
                    <th
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.atAGlance.conversion}
                    </th>
                    {showTargets ? (
                      <>
                        <th
                          className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                          scope="col"
                        >
                          {labels.atAGlance.target}
                        </th>
                        <th
                          className="py-3.5 pr-4 pl-3 text-right text-sm font-semibold text-gray-900 sm:pr-6"
                          scope="col"
                        >
                          {labels.atAGlance.deviation}
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {businessFunnelStages(
                    flowData,
                    labels,
                    activeTargets
                  ).map((stage) => {
                    const dropoff =
                      stage.denominator === null || stage.isEntry
                        ? null
                        : Math.max(0, stage.denominator - stage.count);
                    const conversion = stageActualConversion(stage);
                    const delta =
                      conversion === null
                        ? null
                        : conversion - stage.targetConversion;

                    return (
                      <tr
                        className={
                          showTargets
                            ? conversionTargetClass(
                                conversion,
                                stage.targetConversion
                              )
                            : undefined
                        }
                        key={stage.id}
                      >
                        <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6">
                          {stage.label}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {formatNumber(stage.count, locale)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {dropoff === null ? "" : formatNumber(dropoff, locale)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {conversion === null
                            ? ""
                            : formatPercent(conversion, locale)}
                        </td>
                        {showTargets ? (
                          <>
                            <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                              {editingTargets ? (
                                <input
                                  aria-label={`${labels.atAGlance.target}: ${stage.label}`}
                                  className="ml-auto block w-24 rounded-md bg-white px-2 py-1 text-right text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A]"
                                  max={100}
                                  min={0}
                                  onChange={(event) => {
                                    const parsed = Number(event.target.value);
                                    const nextValue = Number.isFinite(parsed)
                                      ? Math.max(0, Math.min(100, parsed))
                                      : 0;

                                    setDraftTargets((current) => ({
                                      ...current,
                                      [stage.id]: nextValue
                                    }));
                                  }}
                                  step={0.1}
                                  type="number"
                                  value={draftTargets[stage.id]}
                                />
                              ) : (
                                formatPercent(stage.targetConversion, locale)
                              )}
                            </td>
                            <td
                              className={classNames(
                                conversionDeltaClass(delta),
                                "py-4 pr-4 pl-3 text-right text-sm font-semibold whitespace-nowrap sm:pr-6"
                              )}
                            >
                              {delta === null
                                ? ""
                                : formatConversionDelta(delta, locale)}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AdminAtAGlanceView({
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
      color: businessMetricColors.freeRequests,
      id: "freeRequests",
      label: labels.atAGlance.freeRequests,
      series: flowNodeSeries(flowData, "freeEmailRequested"),
      value: formatNumber(flowNodeCount(flowData, "freeEmailRequested"), locale)
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
        metrics={metrics}
        onMetricSelect={setSelectedMetricId}
        selectedMetricId={selectedMetric.id}
      />

      <BusinessTrendChart
        bucketLabels={flowData.series.bucketLabels}
        locale={locale}
        metric={selectedMetric}
      />

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <BusinessFunnelTable flowData={flowData} labels={labels} locale={locale} />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
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


