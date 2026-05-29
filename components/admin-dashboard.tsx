"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode
} from "react";
import {
  Bars3Icon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { HeartIcon, UserIcon } from "@heroicons/react/24/solid";
import type {
  AdminDashboardData,
  AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import type {
  AdminAgentsData,
  AdminAgentRow,
  AdminTaskVisibilityData,
  AdminTaskVisibilityRow
} from "@/lib/admin-execution";
import type {
  AdminCommunicationRow,
  AdminCommunicationsData,
  AdminCommunicationStatus
} from "@/lib/admin-communications";
import type {
  AdminReviewQueueData
} from "@/lib/admin-review-queue";
import type {
  AdminTechnicalAlertRow,
  AdminTechnicalAlertsData,
  AdminTechnicalSeverity
} from "@/lib/admin-technical";
import type {
  AdminSupplementsData
} from "@/lib/admin-supplements";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type {
  AdminFlowData
} from "@/lib/admin-flow-data";
import type {
  AdminFinancialCategory,
  AdminFinancialMetricId,
  AdminFinancialTransactionRow,
  AdminFinancialsData
} from "@/lib/admin-financials";
import type {
  AdminFoodsData
} from "@/lib/admin-foods";
import type {
  AdminProductsData
} from "@/lib/admin-products";
import type {
  AdminRecommendationInsightsData
} from "@/lib/admin-recommendation-insights";
import type {
  AdminCampaignsData,
  AdminContentInventoryData,
  AdminLeadsData
} from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";
import {
  content,
  type AdminContent,
  type AdminDashboardView,
  type TaskMetricId
} from "@/components/admin/dashboard-content";
import {
  SidebarContent,
  adminExecutionEventsHref,
  adminTaskVisibilityHref,
  classNames,
  formatGeneratedAt,
  formatMoney,
  formatMoneyNumber,
  formatNumber,
  formatPercent,
  TaskAgeTimer,
  PlanIdLink,
  compactId,
  readableToken,
  taskIsTerminal,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
  formatTaskDuration,
  BusinessStatsGrid,
  BusinessTrendChart,
  businessMetricColors,
  combinedSeries,
  flowNodeSeries,
  percentageMetricSeries,
  type BusinessMetric,
  useLiveAdminData
} from "@/components/admin/dashboard-shared";
import {
  AdminFilterPanel,
  LocaleFilterSelector,
  TimeframeSelector
} from "@/components/admin/dashboard-filters";
import { AdminAtAGlanceView, BusinessFunnelTable } from "@/components/admin/business-overview";
import { AdminCampaignsView } from "@/components/admin/marketing-campaigns";
import { AdminLeadsView } from "@/components/admin/marketing-leads";
import { AdminContentView, contentTypeForView } from "@/components/admin/content-view";
import {
  AdminFoodsView,
  AdminProductsView,
  AdminReviewQueueView,
  AdminSupplementsView,
  SupplementListMeta
} from "@/components/admin/safety-views";
import { AdminRecommendationInsightsView } from "@/components/admin/recommendation-insights-view";
import { AdminDrawer, AdminModal } from "@/components/admin/ui";



function taskMatchesMetric(
  row: AdminTaskVisibilityRow,
  metricId: TaskMetricId,
  generatedAt: string
) {
  const generatedAtTime = new Date(generatedAt).getTime();
  const leaseUntilTime = row.leaseUntil
    ? new Date(row.leaseUntil).getTime()
    : Number.POSITIVE_INFINITY;
  const scheduledForTime = new Date(row.scheduledFor).getTime();
  const isDue =
    !Number.isFinite(generatedAtTime) ||
    !Number.isFinite(scheduledForTime) ||
    scheduledForTime <= generatedAtTime;
  const staleLease =
    (row.status === "reserved" || row.status === "running") &&
    Number.isFinite(generatedAtTime) &&
    leaseUntilTime < generatedAtTime;

  if (metricId === "tasksQueued") {
    return (
      row.status === "queued" ||
      row.status === "needs_review" ||
      row.status === "waiting_approval"
    );
  }

  if (metricId === "tasksActive") {
    return row.status === "reserved" || row.status === "running";
  }

  if (metricId === "tasksHuman") {
    return (
      !taskIsTerminal(row.status) &&
      (
        row.actorType === "human" ||
        row.status === "needs_review" ||
        row.status === "waiting_approval"
      )
    );
  }

  if (metricId === "tasksBlocked") {
    return row.status === "queued" && isDue && row.blockedDependencyCount > 0;
  }

  if (metricId === "tasksFailed") {
    return row.status === "failed" || staleLease;
  }

  if (metricId === "tasksCompleted") {
    return row.status === "completed";
  }

  return true;
}


function taskActorClass(actorType: string) {
  if (actorType === "human") {
    return "bg-violet-50 text-violet-700 ring-violet-100";
  }

  return "bg-cyan-50 text-cyan-700 ring-cyan-100";
}

function taskActorLabel(actorType: string) {
  return actorType === "human" ? "Human" : "Agent";
}

function relativeDuration(
  value: string | null,
  snapshotAt: string,
  locale: Locale
) {
  if (!value) {
    return "";
  }

  const snapshotTime = new Date(snapshotAt).getTime();
  const valueTime = new Date(value).getTime();

  if (!Number.isFinite(snapshotTime) || !Number.isFinite(valueTime)) {
    return "";
  }

  return formatTaskDuration(snapshotTime - valueTime, locale);
}

function taskRuntimeWarning(row: AdminTaskVisibilityRow, snapshotAt: string) {
  const snapshotTime = new Date(snapshotAt).getTime();
  const lastSeenTime = row.workerSessionLastSeenAt
    ? new Date(row.workerSessionLastSeenAt).getTime()
    : null;
  const leaseUntilTime = row.leaseUntil
    ? new Date(row.leaseUntil).getTime()
    : null;
  const active = row.status === "reserved" || row.status === "running";

  if (!active || !Number.isFinite(snapshotTime)) {
    return "";
  }

  if (
    leaseUntilTime !== null &&
    Number.isFinite(leaseUntilTime) &&
    leaseUntilTime < snapshotTime
  ) {
    return "Lease expired before the agent completed the task.";
  }

  if (
    lastSeenTime !== null &&
    Number.isFinite(lastSeenTime) &&
    snapshotTime - lastSeenTime > 120_000
  ) {
    return "Agent heartbeat is stale.";
  }

  return "";
}

function taskRuntimeSummary(
  row: AdminTaskVisibilityRow,
  snapshotAt: string,
  locale: Locale
) {
  const parts = [
    row.agentName ?? null,
    row.reservationStatus
      ? `Reservation ${readableToken(row.reservationStatus)}`
      : null,
    row.reservedAt
      ? `reserved ${relativeDuration(row.reservedAt, snapshotAt, locale)} ago`
      : null,
    row.workerSessionStatus
      ? `session ${readableToken(row.workerSessionStatus)}`
      : null,
    row.workerSessionLastSeenAt
      ? `seen ${relativeDuration(row.workerSessionLastSeenAt, snapshotAt, locale)} ago`
      : null,
    row.latestEventType
      ? `last event ${readableToken(row.latestEventType)}`
      : null
  ].filter(Boolean);

  return parts.join(" · ");
}

function severityLabel(labels: AdminContent, value: AdminTechnicalSeverity) {
  return labels.technicalAlerts[value];
}

function severityClass(value: AdminTechnicalSeverity) {
  if (value === "critical") {
    return "bg-red-100 text-red-800 ring-red-200";
  }

  if (value === "high") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (value === "medium") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function jsonPreview(value: Record<string, unknown>) {
  const text = JSON.stringify(value, null, 2);

  return text === "{}" ? "" : text;
}

function alertDetailText(row: AdminTechnicalAlertRow, key: string) {
  const value = row.details[key];

  return typeof value === "string" ? value.trim() : "";
}

function alertTaskLabel(row: AdminTechnicalAlertRow) {
  const taskTitle = alertDetailText(row, "taskTitle");
  const taskType = row.taskType ?? alertDetailText(row, "taskType");
  const parts = [
    taskTitle,
    taskType ? readableToken(taskType) : "",
    row.taskId ? compactId(row.taskId) : ""
  ].filter(Boolean);

  return parts.join(" · ");
}

function alertGroupLabel(row: AdminTechnicalAlertRow) {
  return alertDetailText(row, "groupLabel");
}

function communicationStatusLabel(
  labels: AdminContent,
  status: AdminCommunicationStatus
) {
  if (status === "no_channel") {
    return labels.communications.noChannel;
  }

  return labels.communications[status];
}

function communicationStatusClass(status: AdminCommunicationStatus) {
  if (status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "no_channel") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "queued") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "sent" || status === "delivered") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function communicationTitle(row: AdminCommunicationRow) {
  return (
    row.subject ||
    row.taskTitle ||
    readableToken(row.messageType)
  );
}

function AdminCommunicationsView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminCommunicationsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [retryErrorId, setRetryErrorId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const communicationMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "communicationsTotal",
      label: labels.communications.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.contentScheduled,
      id: "communicationsQueued",
      label: labels.communications.queued,
      series: [],
      value: formatNumber(data.summary.queued, locale)
    },
    {
      color: businessMetricColors.freeRequests,
      id: "communicationsSent",
      label: labels.communications.sent,
      series: [],
      value: formatNumber(data.summary.sent, locale)
    },
    {
      color: businessMetricColors.contentPublished,
      id: "communicationsDelivered",
      label: labels.communications.delivered,
      series: [],
      value: formatNumber(data.summary.delivered, locale)
    },
    {
      color: businessMetricColors.communicationIssues,
      id: "communicationsFailed",
      label: labels.communications.failed,
      series: [],
      value: formatNumber(data.summary.failed, locale)
    },
    {
      color: businessMetricColors.noChannel,
      id: "communicationsNoChannel",
      label: labels.communications.noChannel,
      series: [],
      value: formatNumber(data.summary.noChannel, locale)
    }
  ];

  async function retryMessage(row: AdminCommunicationRow) {
    setRetryErrorId(null);
    setRetryingId(row.id);

    try {
      const response = await fetch(
        `/api/admin/communications/messages/${row.id}/retry`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to retry communication");
      }

      window.location.reload();
    } catch {
      setRetryErrorId(row.id);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
          <span className="size-2 rounded-full bg-[#1FA77A]" />
          Live · {labels.contentPages.updated}{" "}
          {formatGeneratedAt(data.generatedAt, locale)}
        </span>
      </div>

      <BusinessStatsGrid metrics={communicationMetrics} />

      {data.rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="divide-y divide-gray-100">
            {data.rows.map((row) => (
              <article key={row.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          communicationStatusClass(row.status),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {communicationStatusLabel(labels, row.status)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                        {readableToken(row.channelType ?? row.provider ?? "manual")}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {communicationTitle(row)}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                      {row.body}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <SupplementListMeta
                        label={labels.communications.time}
                        value={formatGeneratedAt(row.createdAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.communications.messageType}
                        value={readableToken(row.messageType)}
                      />
                      <SupplementListMeta
                        label={labels.communications.address}
                        value={row.address ?? ""}
                      />
                      <SupplementListMeta
                        label={labels.communications.plan}
                        value={<PlanIdLink locale={locale} planId={row.planId} />}
                      />
                      <SupplementListMeta
                        label={labels.communications.task}
                        value={row.taskTitle ?? row.taskId ?? ""}
                      />
                    </div>

                    {row.errorMessage ? (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
                        {row.errorMessage}
                      </p>
                    ) : null}
                    {retryErrorId === row.id ? (
                      <p className="mt-3 text-sm font-medium text-red-700">
                        Unable to retry this message.
                      </p>
                    ) : null}
                  </div>

                  {row.status === "failed" || row.status === "no_channel" ? (
                    <button
                      className="inline-flex w-max items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={retryingId === row.id}
                      onClick={() => retryMessage(row)}
                      type="button"
                    >
                      {retryingId === row.id
                        ? labels.communications.retrying
                        : labels.communications.retry}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.communications.empty}
        </div>
      )}
    </section>
  );
}

function AdminTechnicalAlertsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminTechnicalAlertsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const alertMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "alertsTotal",
      label: labels.technicalAlerts.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.critical,
      id: "alertsCritical",
      label: labels.technicalAlerts.critical,
      series: [],
      value: formatNumber(data.summary.critical, locale)
    },
    {
      color: businessMetricColors.high,
      id: "alertsHigh",
      label: labels.technicalAlerts.high,
      series: [],
      value: formatNumber(data.summary.high, locale)
    },
    {
      color: businessMetricColors.medium,
      id: "alertsMedium",
      label: labels.technicalAlerts.medium,
      series: [],
      value: formatNumber(data.summary.medium, locale)
    },
    {
      color: businessMetricColors.low,
      id: "alertsLow",
      label: labels.technicalAlerts.low,
      series: [],
      value: formatNumber(data.summary.low, locale)
    }
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={alertMetrics} />

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="divide-y divide-gray-100">
          {data.rows.map((row) => {
            const details = jsonPreview(row.details);

            return (
              <article key={`${row.source}:${row.id}`} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          severityClass(row.severity),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {severityLabel(labels, row.severity)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                        {readableToken(row.source)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {readableToken(row.title)}
                    </h3>
                    {alertGroupLabel(row) ? (
                      <p className="mt-1 text-sm font-medium text-gray-500">
                        {alertGroupLabel(row)}
                      </p>
                    ) : null}
                    <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
                      <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        {labels.technicalAlerts.rootCause}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-red-900">
                        {row.rootCause}
                      </p>
                    </div>
                    {row.message && row.message !== row.rootCause ? (
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {row.message}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <SupplementListMeta
                        label={labels.technicalAlerts.time}
                        value={formatGeneratedAt(row.occurredAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.plan}
                        value={<PlanIdLink locale={locale} planId={row.planId} />}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.task}
                        value={alertTaskLabel(row)}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.status}
                        value={row.status ?? ""}
                      />
                    </div>
                    {details ? (
                      <details className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 ring-1 ring-gray-100">
                        <summary className="cursor-pointer font-semibold text-gray-700">
                          {labels.technicalAlerts.event}
                        </summary>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">
                          {details}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {data.rows.length === 0 ? (
          <div className="border-t border-gray-100 px-5 py-12 text-center text-sm font-medium text-gray-500">
            {labels.technicalAlerts.empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LiveUpdatedBadge({
  generatedAt,
  labels,
  locale
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <div className="flex justify-end">
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
        <span className="size-2 rounded-full bg-[#1FA77A]" />
        Live · {labels.contentPages.updated}{" "}
        {formatGeneratedAt(generatedAt, locale)}
      </span>
    </div>
  );
}

function LiveStatusBadge({
  pulseAt
}: Readonly<{
  pulseAt: number;
}>) {
  const [now, setNow] = useState(() => Date.now());
  const displayNow = Math.max(now, pulseAt);
  const elapsedMs =
    pulseAt > 0 ? displayNow - pulseAt : Number.POSITIVE_INFINITY;
  const state =
    elapsedMs < 45_000
      ? "live"
      : elapsedMs < 120_000
        ? "idle"
        : "disconnected";
  const stateLabel =
    state === "live" ? "Live" : state === "idle" ? "Idle" : "Disconnected";
  const dotClass =
    state === "live"
      ? "bg-[#1FA77A]"
      : state === "idle"
        ? "bg-amber-400"
        : "bg-red-500";

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-end">
      <span
        aria-label={`Live updates ${state}`}
        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-200 transition-colors"
        title={`Live updates ${state}`}
      >
        <span
          aria-hidden="true"
          className={classNames("size-2 rounded-full", dotClass)}
        />
        {stateLabel}
      </span>
    </div>
  );
}

function taskStatusLabel(status: string, labels: AdminContent) {
  if (status === "reserved" || status === "running") {
    return labels.visibility.active;
  }

  if (status === "queued") {
    return labels.visibility.queued;
  }

  if (status === "completed") {
    return labels.visibility.completed;
  }

  if (status === "failed") {
    return labels.visibility.failed;
  }

  return readableToken(status);
}

function agentStatusClass(status: string) {
  if (status === "active") {
    return "bg-[#1FA77A]/10 text-[#126B4F] ring-[#1FA77A]/20";
  }

  if (status === "paused") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "offline") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function agentDescription(row: AdminAgentRow, locale: Locale) {
  const thai = locale === "th";
  const chinese = locale === "zh-CN";

  if (row.name === "Product Matcher") {
    return thai
      ? "ตัวทำงานแบบ deterministic สำหรับจับคู่แผนโภชนาการกับสินค้าที่อนุมัติแล้ว โดยใช้ full-beam matcher"
      : chinese
        ? "确定性产品推荐 worker，使用 full-beam matcher 将营养计划匹配到已批准目录产品。"
      : "Deterministic product recommendation worker. Matches nutrition plans to approved catalogue products using the full-beam matcher.";
  }

  if (row.name === "Nutrition Plan Formulator") {
    return thai
      ? "สร้างคำแนะนำอาหารเสริมจาก HealthScore และบริบทของลูกค้า"
      : chinese
        ? "根据 HealthScore 和客户背景生成补充剂指导。"
      : "Builds supplement guidance from the HealthScore and client context.";
  }

  if (row.name === "HealthScore Engine") {
    return thai
      ? "วิเคราะห์คำตอบแบบประเมินและสร้างคำอธิบาย HealthScore"
      : chinese
        ? "分析评估答案并生成 HealthScore 建议。"
      : "Analyzes assessment answers and produces HealthScore advice.";
  }

  if (row.name === "Nutrition Plan Advisor") {
    return thai
      ? "ปรับแต่งแผน ตอบแชต และสรุปแผนโภชนาการฉบับสุดท้าย"
      : chinese
        ? "处理计划优化、聊天回复和最终营养报告。"
      : "Handles plan refinement, chat replies, and final nutrition reports.";
  }

  if (row.name === "Communications Coordinator") {
    return thai
      ? "ประสานงานข้อความติดตามผลและการแจ้งเตือนลูกค้า"
      : chinese
        ? "协调跟进消息和客户通知。"
      : "Coordinates follow-up messages and client notifications.";
  }

  if (row.name === "Email Dispatcher") {
    return thai
      ? "ส่งอีเมลธุรกรรมและอีเมลประเมินซ้ำ"
      : chinese
        ? "发送交易邮件和复评邮件。"
      : "Sends transactional and reassessment emails.";
  }

  if (row.name === "Content Publisher") {
    return thai
      ? "จัดการงานเผยแพร่เนื้อหา"
      : chinese
        ? "运行内容发布工作流任务。"
      : "Runs content publishing workflow tasks.";
  }

  if (row.name === "Scheduler") {
    return thai
      ? "ดูแลงานตามกำหนดเวลาและงานแพลตฟอร์มเบื้องหลัง"
      : chinese
        ? "运行计划任务和平台维护工作。"
      : "Runs scheduled platform and housekeeping work.";
  }

  if (row.type === "human") {
    return thai
      ? "คิวงานตรวจสอบโดยคนสำหรับเคสที่ต้องใช้วิจารณญาณ"
      : chinese
        ? "人工审核队列，用于需要判断的案例。"
      : "Human review queue for cases that need judgement.";
  }

  return thai
    ? "ตัวทำงานของแพลตฟอร์มสำหรับงานที่มีความสามารถเฉพาะ"
    : chinese
      ? "面向特定能力范围任务的平台 worker。"
    : "Platform worker for capability-scoped operational tasks.";
}

function agentHeartbeatState(row: AdminAgentRow, generatedAt: string) {
  if (row.type === "human") {
    return "human";
  }

  if (row.sessionCount <= 0 && !row.lastSeenAt && row.activeTaskCount <= 0) {
    return "undeployed";
  }

  if (row.sessionCount <= 0 || !row.lastSeenAt) {
    return "offline";
  }

  const generatedAtTime = new Date(generatedAt).getTime();
  const lastSeenTime = new Date(row.lastSeenAt).getTime();

  if (!Number.isFinite(generatedAtTime) || !Number.isFinite(lastSeenTime)) {
    return "offline";
  }

  const ageMs = generatedAtTime - lastSeenTime;

  if (ageMs <= 45_000) {
    return "live";
  }

  if (ageMs <= 120_000) {
    return "idle";
  }

  return "offline";
}

function AgentHeartbeatIndicator({
  generatedAt,
  labels,
  locale,
  row
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
  row: AdminAgentRow;
}>) {
  const state = agentHeartbeatState(row, generatedAt);

  if (state === "human") {
    return (
      <span
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100"
        title={labels.agents.humanQueue}
      >
        <UserIcon aria-hidden="true" className="size-4" />
        {row.activeTaskCount > 0
          ? formatNumber(row.activeTaskCount, locale)
          : labels.agents.humanQueue}
        <span className="sr-only">{labels.agents.humanQueue}</span>
      </span>
    );
  }

  if (state === "undeployed") {
    return (
      <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-gray-50 px-2.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
        {labels.agents.undeployed}
      </span>
    );
  }

  const active = state !== "offline";

  return (
    <span
      className={classNames(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
        state === "live" && "bg-rose-50 text-rose-600 ring-rose-100",
        state === "idle" && "bg-amber-50 text-amber-600 ring-amber-100",
        state === "offline" && "bg-gray-50 text-gray-300 ring-gray-200"
      )}
      title={
        row.lastSeenAt
          ? `Last heartbeat ${formatGeneratedAt(row.lastSeenAt, locale)}`
          : "No worker heartbeat"
      }
    >
      <HeartIcon
        aria-hidden="true"
        className={classNames(
          "size-4",
          active && "animate-[worker-heartbeat_700ms_ease-out]"
        )}
        key={`${row.id}:${row.lastSeenAt ?? "none"}`}
      />
      <span className="sr-only">
        {active ? labels.agents.heartbeat : "No worker heartbeat"}
      </span>
    </span>
  );
}

function CapabilityList({ values }: Readonly<{ values: string[] }>) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 5).map((value) => (
        <span
          key={value}
          className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
        >
          {readableToken(value)}
        </span>
      ))}
      {values.length > 5 ? (
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
          +{values.length - 5}
        </span>
      ) : null}
    </div>
  );
}

function taskGroupTint(taskGroupId: string) {
  const palette = [
    "bg-emerald-50/70",
    "bg-sky-50/70",
    "bg-amber-50/70",
    "bg-violet-50/70",
    "bg-rose-50/70"
  ];
  const hash = [...taskGroupId].reduce(
    (total, char) => total + char.charCodeAt(0),
    0
  );

  return palette[hash % palette.length];
}

function AdminVisibilityView({
  data,
  heartbeatAt,
  labels,
  locale,
  selectedTaskId
}: Readonly<{
  data: AdminTaskVisibilityData;
  heartbeatAt: number;
  labels: AdminContent;
  locale: Locale;
  selectedTaskId?: string | null;
}>) {
  const [selectedTaskOverrideId, setSelectedTaskOverrideId] = useState<
    string | null | undefined
  >(undefined);
  const [selectedMetricId, setSelectedMetricId] =
    useState<TaskMetricId>("tasksTotal");
  const activeSelectedTaskId =
    selectedTaskOverrideId === undefined
      ? (selectedTaskId ?? null)
      : selectedTaskOverrideId;
  const selectedTask = activeSelectedTaskId
    ? data.rows.find((row) => row.id === activeSelectedTaskId) ?? null
    : null;
  const visibleRows = data.rows.filter((row) =>
    taskMatchesMetric(row, selectedMetricId, data.generatedAt)
  );
  const groupCounts = visibleRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.taskGroupId] = (counts[row.taskGroupId] ?? 0) + 1;
    return counts;
  }, {});
  const selectMetric = (metricId: BusinessMetric["id"]) => {
    setSelectedMetricId(metricId as TaskMetricId);
    setSelectedTaskOverrideId(null);
  };
  const visibilityMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "tasksTotal",
      label: labels.visibility.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.queued,
      id: "tasksQueued",
      label: labels.visibility.queued,
      series: [],
      value: formatNumber(data.summary.queued, locale)
    },
    {
      color: businessMetricColors.active,
      id: "tasksActive",
      label: labels.visibility.active,
      series: [],
      value: formatNumber(data.summary.active, locale)
    },
    {
      color: businessMetricColors.human,
      id: "tasksHuman",
      label: labels.visibility.human,
      series: [],
      value: formatNumber(data.summary.human, locale)
    },
    {
      color: businessMetricColors.blocked,
      id: "tasksBlocked",
      label: labels.visibility.blocked,
      series: [],
      value: formatNumber(data.summary.blocked, locale)
    },
    {
      color: businessMetricColors.failed,
      id: "tasksFailed",
      label: labels.visibility.failed,
      series: [],
      value: formatNumber(data.summary.failed, locale)
    },
    {
      color: businessMetricColors.completed,
      id: "tasksCompleted",
      label: labels.visibility.completed,
      series: [],
      value: formatNumber(data.summary.completed, locale)
    }
  ];

  return (
    <section className="mt-8 space-y-6">
      <LiveStatusBadge
        pulseAt={heartbeatAt}
      />

      <BusinessStatsGrid
        metrics={visibilityMetrics}
        onMetricSelect={selectMetric}
        selectedMetricId={selectedMetricId}
      />

      {visibleRows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="divide-y divide-gray-100">
            {visibleRows.map((row) => (
              <VisibilityTaskRow
                key={row.id}
                labels={labels}
                locale={locale}
                onClick={() => setSelectedTaskOverrideId(row.id)}
                row={row}
                groupCount={groupCounts[row.taskGroupId] ?? 1}
                snapshotAt={data.generatedAt}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.visibility.empty}
        </div>
      )}

      {selectedTask ? (
        <VisibilityTaskDetailsModal
          labels={labels}
          locale={locale}
          onClose={() => setSelectedTaskOverrideId(null)}
          row={selectedTask}
          snapshotAt={data.generatedAt}
        />
      ) : null}
    </section>
  );
}

function VisibilityTaskRow({
  groupCount,
  labels,
  locale,
  onClick,
  row,
  snapshotAt
}: Readonly<{
  groupCount: number;
  labels: AdminContent;
  locale: Locale;
  onClick: () => void;
  row: AdminTaskVisibilityRow;
  snapshotAt: string;
}>) {
  const runtimeSummary = taskRuntimeSummary(row, snapshotAt, locale);
  const runtimeWarning = taskRuntimeWarning(row, snapshotAt);
  const groupTint = groupCount > 1 ? taskGroupTint(row.taskGroupId) : "";

  return (
    <button
      aria-label={`${labels.supplements.details}: ${row.title}`}
      className={classNames(
        groupTint,
        "block w-full px-5 py-3 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1FA77A]"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="grid gap-3 sm:grid-cols-[9rem_8rem_8rem_minmax(0,1fr)_7rem] sm:items-center">
        <span
          className={classNames(
            taskStatusClass(row.status),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {taskStatusLabel(row.status, labels)}
        </span>
        <span
          className={classNames(
            taskValueClass(row.effectiveBusinessValue),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {taskValueLabel(row.effectiveBusinessValue, locale)}
        </span>
        <span
          className={classNames(
            taskActorClass(row.actorType),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {taskActorLabel(row.actorType)}
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
          {row.title}
        </h2>
        <span className="text-sm font-semibold tabular-nums text-gray-500 sm:justify-self-end">
          <TaskAgeTimer initialNow={snapshotAt} locale={locale} row={row} />
        </span>
      </div>
      {runtimeSummary || runtimeWarning ? (
        <p
          className={classNames(
            "mt-2 truncate text-xs font-medium",
            runtimeWarning ? "text-amber-700" : "text-gray-500"
          )}
        >
          {runtimeWarning || runtimeSummary}
        </p>
      ) : null}
    </button>
  );
}

function VisibilityTaskDetailsModal({
  labels,
  locale,
  onClose,
  row,
  snapshotAt
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  row: AdminTaskVisibilityRow;
  snapshotAt: string;
}>) {
  const runtimeSummary = taskRuntimeSummary(row, snapshotAt, locale);
  const runtimeWarning = taskRuntimeWarning(row, snapshotAt);

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    taskStatusClass(row.status),
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {taskStatusLabel(row.status, labels)}
                </span>
                <span
                  className={classNames(
                    taskValueClass(row.effectiveBusinessValue),
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {taskValueLabel(row.effectiveBusinessValue, locale)}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-gray-900">
                {row.title}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {readableToken(row.taskType)} · {compactId(row.id)}
              </p>
            </div>
            <button
              aria-label={labels.supplements.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SupplementListMeta
                label="Group"
                value={row.groupLabel ?? compactId(row.taskGroupId)}
              />
              <SupplementListMeta
                label={labels.visibility.actor}
                value={readableToken(row.actorType)}
              />
              <SupplementListMeta
                label={labels.visibility.agent}
                value={row.agentName ?? ""}
              />
              <SupplementListMeta
                label={labels.visibility.task}
                value={taskValueLabel(row.businessValue, locale)}
              />
              <SupplementListMeta
                label={labels.visibility.status}
                value={`${row.attempts}/${row.maxAttempts}`}
              />
              <SupplementListMeta
                label={labels.visibility.blocked}
                value={formatNumber(row.blockedDependencyCount, locale)}
              />
              <SupplementListMeta
                label={labels.contentPages.updated}
                value={formatGeneratedAt(row.updatedAt, locale)}
              />
              <SupplementListMeta
                label={labels.generated}
                value={formatGeneratedAt(row.createdAt, locale)}
              />
              <SupplementListMeta
                label="Scheduled"
                value={formatGeneratedAt(row.scheduledFor, locale)}
              />
              <SupplementListMeta
                label="Lease"
                value={
                  row.leaseUntil ? formatGeneratedAt(row.leaseUntil, locale) : ""
                }
              />
              <SupplementListMeta
                label="Plan"
                value={
                  <PlanIdLink
                    compact={true}
                    locale={locale}
                    planId={row.planId}
                  />
                }
              />
              <SupplementListMeta
                label="Ray"
                value={row.rayId ? compactId(row.rayId) : ""}
              />
              <SupplementListMeta
                label="Reasoning"
                value={readableToken(row.reasoningEffort)}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {labels.visibility.capabilities}
              </p>
              <CapabilityList values={row.requiredCapabilities} />
            </div>

            {row.errorMessage ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {row.errorMessage}
              </p>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Runtime
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SupplementListMeta
                  label="Reservation"
                  value={
                    row.reservationId
                      ? `${readableToken(row.reservationStatus ?? "unknown")} · ${compactId(row.reservationId)}`
                      : ""
                  }
                />
                <SupplementListMeta
                  label="Reserved"
                  value={
                    row.reservedAt
                      ? `${formatGeneratedAt(row.reservedAt, locale)} · ${relativeDuration(row.reservedAt, snapshotAt, locale)} ago`
                      : ""
                  }
                />
                <SupplementListMeta
                  label="Heartbeat"
                  value={
                    row.reservationHeartbeatAt
                      ? `${formatGeneratedAt(row.reservationHeartbeatAt, locale)} · ${relativeDuration(row.reservationHeartbeatAt, snapshotAt, locale)} ago`
                      : ""
                  }
                />
                <SupplementListMeta
                  label="Agent session"
                  value={
                    row.workerSessionId
                      ? `${readableToken(row.workerSessionStatus ?? "unknown")} · ${compactId(row.workerSessionId)}`
                      : ""
                  }
                />
                <SupplementListMeta
                  label="Agent seen"
                  value={
                    row.workerSessionLastSeenAt
                      ? `${formatGeneratedAt(row.workerSessionLastSeenAt, locale)} · ${relativeDuration(row.workerSessionLastSeenAt, snapshotAt, locale)} ago`
                      : ""
                  }
                />
                <SupplementListMeta
                  label="Last event"
                  value={
                    row.latestEventType
                      ? [
                          readableToken(row.latestEventType),
                          readableToken(row.latestEventStatus ?? "observed"),
                          row.latestEventSeverity
                            ? readableToken(row.latestEventSeverity)
                            : null,
                          row.latestEventAt
                            ? `${relativeDuration(row.latestEventAt, snapshotAt, locale)} ago`
                            : null
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : ""
                  }
                />
              </div>
              {runtimeWarning || runtimeSummary ? (
                <p
                  className={classNames(
                    "mt-4 rounded-xl px-3 py-2 text-sm font-medium ring-1",
                    runtimeWarning
                      ? "bg-amber-50 text-amber-800 ring-amber-100"
                      : "bg-gray-50 text-gray-700 ring-gray-200"
                  )}
                >
                  {runtimeWarning || runtimeSummary}
                </p>
              ) : null}
              {row.latestEventPayload ? (
                <pre className="mt-4 max-h-56 overflow-auto rounded-xl bg-gray-950 p-3 text-xs leading-5 text-gray-100">
                  {JSON.stringify(row.latestEventPayload, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
    </AdminModal>
  );
}

function AdminAgentsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminAgentsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const agentMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "agentsTotal",
      label: labels.agents.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.active,
      id: "agentsWorking",
      label: labels.agents.working,
      series: [],
      value: formatNumber(data.summary.working, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "agentsActive",
      label: labels.agents.active,
      series: [],
      value: formatNumber(data.summary.active, locale)
    },
    {
      color: businessMetricColors.offline,
      id: "agentsOffline",
      label: labels.agents.offline,
      series: [],
      value: formatNumber(data.summary.offline, locale)
    },
    {
      color: businessMetricColors.paused,
      id: "agentsPaused",
      label: labels.agents.paused,
      series: [],
      value: formatNumber(data.summary.paused, locale)
    },
    {
      color: businessMetricColors.retired,
      id: "agentsRetired",
      label: labels.agents.retired,
      series: [],
      value: formatNumber(data.summary.retired, locale)
    }
  ];

  return (
    <section className="mt-8 space-y-6">
      <LiveUpdatedBadge
        generatedAt={data.generatedAt}
        labels={labels}
        locale={locale}
      />

      <BusinessStatsGrid metrics={agentMetrics} />

      {data.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.rows.map((row) => (
            <AgentCard
              generatedAt={data.generatedAt}
              key={row.id}
              labels={labels}
              locale={locale}
              row={row}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.agents.empty}
        </div>
      )}
    </section>
  );
}

function AgentCard({
  generatedAt,
  labels,
  locale,
  row
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
  row: AdminAgentRow;
}>) {
  const runtimeState = agentHeartbeatState(row, generatedAt);
  const description = agentDescription(row, locale);

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">
            {row.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1FA77A]/10 px-2.5 py-1 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20">
              {readableToken(row.type)}
            </span>
            <span className="text-xs font-medium text-gray-400">
              {compactId(row.id)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AgentHeartbeatIndicator
            generatedAt={generatedAt}
            labels={labels}
            locale={locale}
            row={row}
          />
          {runtimeState !== "undeployed" ? (
            <span
              className={classNames(
                agentStatusClass(row.status),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              )}
            >
              {readableToken(row.status)}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-gray-600">
        {description}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SupplementListMeta
          label={labels.agents.currentTask}
          value={row.activeTaskTitle ?? row.activeTaskId ?? ""}
        />
        <SupplementListMeta
          label={labels.agents.model}
          value={row.model ?? ""}
        />
        <SupplementListMeta
          label={labels.agents.successRate}
          value={
            row.successRate === null
              ? ""
              : formatPercent(row.successRate * 100, locale)
          }
        />
        <SupplementListMeta
          label={labels.agents.failureRate}
          value={
            row.failureRate === null
              ? ""
              : formatPercent(row.failureRate * 100, locale)
          }
        />
        <SupplementListMeta
          label={labels.agents.completed}
          value={formatNumber(row.completedCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.failed}
          value={formatNumber(row.failedCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.lastSeen}
          value={row.lastSeenAt ? formatGeneratedAt(row.lastSeenAt, locale) : ""}
        />
        <SupplementListMeta
          label={labels.agents.sessions}
          value={formatNumber(row.sessionCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.working}
          value={formatNumber(row.activeTaskCount, locale)}
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
          {labels.agents.capabilities}
        </p>
        <CapabilityList values={row.capabilities} />
      </div>
    </article>
  );
}


function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataTextValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function financialMetadataValue(
  row: AdminFinancialTransactionRow,
  key: string,
  itemKeys: string[] = []
) {
  const direct = metadataTextValue(row.metadata[key]);

  if (direct) {
    return direct;
  }

  const item = objectRecord(row.metadata.item);

  for (const itemKey of itemKeys) {
    const value = metadataTextValue(item[itemKey]);

    if (value) {
      return value;
    }
  }

  return "";
}

function financialResourceSummary(row: AdminFinancialTransactionRow) {
  const product = financialMetadataValue(row, "providerProduct", ["product"]);
  const resourceType = financialMetadataValue(row, "resourceType", [
    "resource_type"
  ]);
  const resourceId = financialMetadataValue(row, "resourceId", [
    "resource_uuid",
    "resource_id",
    "uuid",
    "id"
  ]);

  return [product, resourceType, resourceId].filter(Boolean).join(" · ");
}

function financialBillingPeriod(
  row: AdminFinancialTransactionRow,
  locale: Locale
) {
  const start = financialMetadataValue(row, "periodStart", [
    "start_time",
    "start",
    "period_start"
  ]);
  const end = financialMetadataValue(row, "periodEnd", [
    "end_time",
    "end",
    "period_end"
  ]);

  if (start && end) {
    return `${formatGeneratedAt(start, locale)} - ${formatGeneratedAt(
      end,
      locale
    )}`;
  }

  return start || end ? formatGeneratedAt(start || end, locale) : "";
}

function financialMetadataDetailRows(
  row: AdminFinancialTransactionRow,
  labels: AdminContent,
  locale: Locale
) {
  const resourceType = financialMetadataValue(row, "resourceType", [
    "resource_type"
  ]);
  const values = [
    {
      label: labels.financials.project,
      value: financialMetadataValue(row, "project", [
        "project_name",
        "project_uuid"
      ])
    },
    {
      label: labels.financials.product,
      value: financialMetadataValue(row, "providerProduct", ["product"])
    },
    {
      label: labels.financials.resourceType,
      value: resourceType ? readableToken(resourceType) : ""
    },
    {
      label: labels.financials.resource,
      value: financialMetadataValue(row, "resourceId", [
        "resource_uuid",
        "resource_id",
        "uuid",
        "id"
      ])
    },
    {
      label: labels.financials.region,
      value: financialMetadataValue(row, "region", ["region"])
    },
    {
      label: labels.financials.billingPeriod,
      value: financialBillingPeriod(row, locale)
    },
    {
      label: labels.financials.providerDescription,
      value: financialMetadataValue(row, "providerDescription", [
        "description",
        "group_description"
      ])
    }
  ];

  return values.filter((item) => Boolean(item.value));
}

function AdminFlowView({
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

function AdminFinancialsView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminFinancialsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      format: "currency",
      id: "totalCost",
      label: `${labels.financials.totalCost} (USD)`,
      series: data.series.totalCost,
      value: formatMoneyNumber(data.summary.totalCostUsd, locale)
    },
    {
      color: businessMetricColors.healthScoreViews,
      format: "currency",
      id: "aiCost",
      label: `${labels.financials.aiCost} (USD)`,
      series: data.series.aiCost,
      value: formatMoneyNumber(data.summary.aiCostUsd, locale)
    },
    {
      color: businessMetricColors.contentScheduled,
      format: "currency",
      id: "hostingCost",
      label: `${labels.financials.hostingCost} (USD)`,
      series: data.series.hostingCost,
      value: formatMoneyNumber(data.summary.hostingCostUsd, locale)
    },
    {
      color: businessMetricColors.queued,
      id: "transactions",
      label: labels.financials.transactions,
      series: data.series.transactions,
      value: formatNumber(data.summary.transactions, locale)
    }
  ];
  const [selectedMetricId, setSelectedMetricId] =
    useState<AdminFinancialMetricId>("totalCost");
  const [selectedRow, setSelectedRow] =
    useState<AdminFinancialTransactionRow | null>(null);
  const selectedMetric =
    metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];
  const categoryLabel = (category: AdminFinancialCategory) =>
    category === "ai" ? "AI" : readableToken(category);

  return (
    <>
      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={(metricId) =>
          setSelectedMetricId(metricId as AdminFinancialMetricId)
        }
        selectedMetricId={selectedMetric.id}
      />

      <BusinessTrendChart
        bucketLabels={data.bucketLabels}
        locale={locale}
        metric={selectedMetric}
      />

      <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {labels.financials.transactions}
          </h2>
        </div>
        {data.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th
                    className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-900"
                    scope="col"
                  >
                    {labels.financials.time}
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    scope="col"
                  >
                    {labels.financials.description}
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    scope="col"
                  >
                    {labels.financials.category}
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    scope="col"
                  >
                    {labels.financials.entryType}
                  </th>
                  <th
                    className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                    scope="col"
                  >
                    {labels.financials.usd}
                  </th>
                  <th className="py-3.5 pl-3 text-right" scope="col">
                    <span className="sr-only">{labels.financials.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap py-4 pr-3 text-sm text-gray-500">
                      {formatGeneratedAt(row.occurredAt, locale)}
                    </td>
                    <td className="min-w-96 px-3 py-4 text-sm">
                      <div className="font-medium text-gray-900">
                        {row.description}
                      </div>
                      <div className="mt-1 max-w-xl truncate text-xs text-gray-400">
                        {financialResourceSummary(row) || row.sourceRef || row.source}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600">
                      {categoryLabel(row.category)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span
                        className={classNames(
                          row.entryType === "actual"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : "bg-gray-50 text-gray-600 ring-gray-200",
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {readableToken(row.entryType)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold text-gray-900">
                      {formatMoney(row.amountUsd, "USD", locale)}
                    </td>
                    <td className="whitespace-nowrap py-4 pl-3 text-right text-sm font-medium">
                      <button
                        className="text-[#1FA77A] hover:text-[#126B4F]"
                        onClick={() => setSelectedRow(row)}
                        type="button"
                      >
                        {labels.financials.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm font-medium text-gray-400">
            {labels.financials.empty}
          </p>
        )}
      </section>

      {selectedRow ? (
        <FinancialTransactionDetailModal
          accessToken={accessToken}
          categoryLabel={categoryLabel}
          labels={labels}
          locale={locale}
          onClose={() => setSelectedRow(null)}
          range={data.range}
          row={selectedRow}
        />
      ) : null}
    </>
  );
}

function FinancialTransactionDetailModal({
  accessToken,
  categoryLabel,
  labels,
  locale,
  onClose,
  range,
  row
}: Readonly<{
  accessToken: string;
  categoryLabel: (category: AdminFinancialCategory) => string;
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  range: AdminDashboardRange;
  row: AdminFinancialTransactionRow;
}>) {
  return (
    <AdminModal onClose={onClose} panelClassName="max-w-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900">
                  {row.description}
                </h2>
                <p className="mt-1 break-all text-xs text-gray-400">
                  {row.sourceRef ?? row.source}
                </p>
              </div>
              <button
                aria-label={labels.supplements.close}
                className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
                onClick={onClose}
                type="button"
              >
                <XMarkIcon aria-hidden={true} className="size-5" />
              </button>
            </div>

            <dl className="divide-y divide-gray-100 px-6 text-sm">
              <FinancialDetailRow
                label={labels.financials.time}
                value={formatGeneratedAt(row.occurredAt, locale)}
              />
              <FinancialDetailRow
                label={labels.financials.category}
                value={categoryLabel(row.category)}
              />
              <FinancialDetailRow
                label={labels.financials.entryType}
                value={readableToken(row.entryType)}
              />
              <FinancialDetailRow
                label={labels.financials.amount}
                value={formatMoney(row.amount / 1_000_000, row.currency, locale)}
              />
              <FinancialDetailRow
                label={labels.financials.usd}
                value={formatMoney(row.amountUsd, "USD", locale)}
              />
              <FinancialDetailRow
                label={labels.financials.provider}
                value={row.provider ?? row.source}
              />
              {financialMetadataDetailRows(row, labels, locale).map((detail) => (
                <FinancialDetailRow
                  key={detail.label}
                  label={detail.label}
                  value={
                    detail.label === labels.financials.resource ? (
                      <span className="break-all">{detail.value}</span>
                    ) : (
                      detail.value
                    )
                  }
                />
              ))}
              <FinancialDetailRow label={labels.financials.from} value={row.from} />
              <FinancialDetailRow label={labels.financials.to} value={row.to} />
              <FinancialDetailRow
                label={labels.financials.source}
                value={
                  <span className="break-all">{row.sourceRef ?? row.source}</span>
                }
              />
              <FinancialDetailRow
                label={labels.financials.task}
                value={
                  row.taskId ? (
                    <a
                      className="font-semibold text-[#1FA77A] underline-offset-2 hover:underline"
                      href={adminTaskVisibilityHref({
                        accessToken,
                        locale,
                        range,
                        taskId: row.taskId
                      })}
                      title={row.taskId}
                    >
                      {compactId(row.taskId)}
                    </a>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )
                }
              />
            </dl>
    </AdminModal>
  );
}

function FinancialDetailRow({
  label,
  value
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  return (
    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="font-medium text-gray-900">{label}</dt>
      <dd className="mt-1 text-gray-700 sm:col-span-2 sm:mt-0">{value}</dd>
    </div>
  );
}

function adminViewDatabaseAvailable({
  alertsData,
  agentsData,
  campaignsData,
  contentData,
  communicationsData,
  data,
  financialsData,
  foodsData,
  flowData,
  leadsData,
  productsData,
  recommendationInsightsData,
  reviewQueueData,
  supplementsData,
  visibilityData,
  view
}: Readonly<{
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  campaignsData: AdminCampaignsData;
  contentData: AdminContentInventoryData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodsData: AdminFoodsData;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  productsData: AdminProductsData;
  recommendationInsightsData: AdminRecommendationInsightsData;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  if (view === "glance") {
    return (
      alertsData.databaseAvailable &&
      communicationsData.databaseAvailable &&
      data.databaseAvailable &&
      flowData.databaseAvailable &&
      reviewQueueData.databaseAvailable
    );
  }

  if (view === "agents") {
    return agentsData.databaseAvailable;
  }

  if (view === "alerts") {
    return alertsData.databaseAvailable;
  }

  if (view === "campaigns") {
    return campaignsData.databaseAvailable;
  }

  if (view === "blogs" || view === "content" || view === "testimonials") {
    return contentData.databaseAvailable;
  }

  if (view === "communications") {
    return communicationsData.databaseAvailable;
  }

  if (view === "flow") {
    return flowData.databaseAvailable;
  }

  if (view === "financials") {
    return financialsData.databaseAvailable;
  }

  if (view === "foods") {
    return foodsData.databaseAvailable;
  }

  if (view === "leads") {
    return leadsData.databaseAvailable;
  }

  if (view === "products") {
    return productsData.databaseAvailable;
  }

  if (view === "product-insights" || view === "supplement-insights") {
    return recommendationInsightsData.databaseAvailable;
  }

  if (view === "reviews") {
    return reviewQueueData.databaseAvailable;
  }

  if (view === "supplements") {
    return supplementsData.databaseAvailable;
  }

  if (view === "visibility") {
    return visibilityData.databaseAvailable;
  }

  return data.databaseAvailable;
}

export function AdminDashboard({
  accessToken,
  alertsData,
  agentsData,
  campaignsData,
  contentData,
  communicationsData,
  data,
  financialsData,
  foodsData,
  filters,
  flowData,
  leadsData,
  locale,
  productsData,
  recommendationInsightsData,
  reviewQueueData,
  selectedReviewTaskId,
  selectedTaskId,
  supplementsData,
  visibilityData,
  view
}: Readonly<{
  accessToken: string;
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  campaignsData: AdminCampaignsData;
  contentData: AdminContentInventoryData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  financialsData: AdminFinancialsData;
  foodsData: AdminFoodsData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  leadsData: AdminLeadsData;
  locale: Locale;
  productsData: AdminProductsData;
  recommendationInsightsData: AdminRecommendationInsightsData;
  reviewQueueData: AdminReviewQueueData;
  selectedReviewTaskId?: string | null;
  selectedTaskId?: string | null;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  const labels = content[locale];
  const contentManagementView =
    view === "blogs" || view === "content" || view === "testimonials";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visibilityHeartbeatAt, setVisibilityHeartbeatAt] = useState(0);
  const recordVisibilityHeartbeat = useCallback(() => {
    setVisibilityHeartbeatAt(Date.now());
  }, []);
  const visibilityStreamKey = `${view}:${data.range}:visibility`;
  const liveVisibilityData = useLiveAdminData({
    enabled: view === "visibility" && Boolean(accessToken),
    eventName: "visibility",
    href:
      accessToken && view === "visibility"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "visibility"
          })
        : "",
    initialData: visibilityData,
    onHeartbeat: recordVisibilityHeartbeat,
    streamKey: visibilityStreamKey
  });
  const agentsStreamKey = `${view}:${data.range}:agents`;
  const liveAgentsData = useLiveAdminData({
    enabled: view === "agents" && Boolean(accessToken),
    eventName: "agents",
    href:
      accessToken && view === "agents"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "agents"
          })
        : "",
    initialData: agentsData,
    streamKey: agentsStreamKey
  });

  const databaseAvailable = adminViewDatabaseAvailable({
    alertsData,
    agentsData: liveAgentsData,
    campaignsData,
    contentData,
    communicationsData,
    data,
    financialsData,
    foodsData,
    flowData,
    leadsData,
    productsData,
    recommendationInsightsData,
    reviewQueueData,
    supplementsData,
    visibilityData: liveVisibilityData,
    view
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#20343A]">
      {sidebarOpen ? (
        <AdminDrawer onClose={() => setSidebarOpen(false)}>
          <SidebarContent
            accessToken={accessToken}
            filters={filters}
            labels={labels}
            locale={locale}
            onNavigate={() => setSidebarOpen(false)}
            range={data.range}
            view={view}
          />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute left-full top-5 ml-4 rounded-md p-2 text-white"
          >
            <span className="sr-only">{labels.closeSidebar}</span>
            <XMarkIcon aria-hidden={true} className="size-6" />
          </button>
        </AdminDrawer>
      ) : null}

      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <SidebarContent
          accessToken={accessToken}
          filters={filters}
          labels={labels}
          locale={locale}
          range={data.range}
          view={view}
        />
      </aside>

      <div className="sticky top-0 z-40 flex items-center gap-x-6 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900"
        >
          <span className="sr-only">{labels.openSidebar}</span>
          <Bars3Icon aria-hidden={true} className="size-6" />
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-gray-900">
          {labels.pageTitles[view]}
        </div>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#1FA77A]/10 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20">
          MN
        </span>
      </div>

      <main className="py-8 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                {labels.pageTitles[view]}
              </h1>
              {view === "glance" ? (
                <p className="mt-1 text-xs text-gray-400">
                  {labels.generated}: {formatGeneratedAt(data.generatedAt, locale)}
                </p>
              ) : null}
            </div>
          </div>

          {!databaseAvailable ? (
            <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {labels.dataUnavailable}
            </div>
          ) : null}

          {!contentManagementView &&
          (view === "agents" ||
          view === "alerts" ||
          view === "campaigns" ||
          view === "communications" ||
          view === "financials" ||
          view === "flow" ||
          view === "glance" ||
          view === "leads" ||
          view === "product-insights" ||
          view === "supplement-insights" ||
          view === "visibility") ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <TimeframeSelector
                  accessToken={accessToken}
                  data={data}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  view={view}
                />
                {view === "campaigns" ||
                view === "flow" ||
                view === "glance" ||
                view === "leads" ? (
                  <LocaleFilterSelector
                    accessToken={accessToken}
                    filters={filters}
                    locale={locale}
                    range={data.range}
                    view={view}
                  />
                ) : null}
              </div>

              {view === "campaigns" ||
              view === "flow" ||
              view === "glance" ||
              view === "leads" ? (
                <AdminFilterPanel
                  accessToken={accessToken}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  range={data.range}
                  view={view}
                />
              ) : null}
            </>
          ) : null}

          {view === "campaigns" ? (
            <AdminCampaignsView
              data={campaignsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "blogs" ||
            view === "content" ||
            view === "testimonials" ? (
            <AdminContentView
              accessToken={accessToken}
              contentTypeFilter={contentTypeForView(view)}
              data={contentData}
              labels={labels}
              locale={locale}
            />
          ) : view === "flow" ? (
            <AdminFlowView
              accessToken={accessToken}
              flowData={flowData}
              labels={labels}
              locale={locale}
            />
          ) : view === "financials" ? (
            <AdminFinancialsView
              accessToken={accessToken}
              data={financialsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "glance" ? (
            <AdminAtAGlanceView
              accessToken={accessToken}
              alertsData={alertsData}
              communicationsData={communicationsData}
              data={data}
              filters={filters}
              flowData={flowData}
              labels={labels}
              locale={locale}
              reviewQueueData={reviewQueueData}
            />
          ) : view === "leads" ? (
            <AdminLeadsView
              data={leadsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "agents" ? (
            <AdminAgentsView
              data={liveAgentsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "communications" ? (
            <AdminCommunicationsView
              accessToken={accessToken}
              data={communicationsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "alerts" ? (
            <AdminTechnicalAlertsView
              data={alertsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "reviews" ? (
            <AdminReviewQueueView
              accessToken={accessToken}
              data={reviewQueueData}
              labels={labels}
              locale={locale}
              productsData={productsData}
              selectedReviewTaskId={selectedReviewTaskId}
              supplementsData={supplementsData}
            />
          ) : view === "foods" ? (
            <AdminFoodsView
              accessToken={accessToken}
              data={foodsData}
              locale={locale}
            />
          ) : view === "products" ? (
            <AdminProductsView
              accessToken={accessToken}
              data={productsData}
              locale={locale}
            />
          ) : view === "product-insights" || view === "supplement-insights" ? (
            <AdminRecommendationInsightsView
              data={recommendationInsightsData}
              locale={locale}
              mode={view === "product-insights" ? "products" : "supplements"}
            />
          ) : view === "supplements" ? (
            <AdminSupplementsView
              accessToken={accessToken}
              data={supplementsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "visibility" ? (
            <AdminVisibilityView
              data={liveVisibilityData}
              heartbeatAt={visibilityHeartbeatAt}
              labels={labels}
              locale={locale}
              selectedTaskId={selectedTaskId}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
