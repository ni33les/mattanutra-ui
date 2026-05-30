"use client";

import { useEffect, useState } from "react";
import type {
  AdminTaskVisibilityData,
  AdminTaskVisibilityRow,
} from "@/lib/admin-execution";
import type { Locale } from "@/lib/i18n";
import type {
  AdminContent,
  TaskMetricId,
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  TaskAgeTimer,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatNumber,
  formatTaskDuration,
  readableToken,
  taskIsTerminal,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
  type BusinessMetric,
} from "@/components/admin/dashboard-shared";
import { CapabilityList } from "@/components/admin/capability-list";
import { SupplementListMeta } from "@/components/admin/supplement-view";
import { AdminModal } from "@/components/admin/ui";

function taskMatchesMetric(
  row: AdminTaskVisibilityRow,
  metricId: TaskMetricId,
  generatedAt: string,
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
      (row.actorType === "human" ||
        row.status === "needs_review" ||
        row.status === "waiting_approval")
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

function taskActorLabel(actorType: string, labels: AdminContent) {
  return actorType === "human" ? labels.visibility.human : labels.visibility.agent;
}

function relativeDuration(
  value: string | null,
  snapshotAt: string,
  locale: Locale,
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

function taskRuntimeWarning(
  row: AdminTaskVisibilityRow,
  snapshotAt: string,
  labels: AdminContent,
) {
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
    return labels.visibility.leaseExpired;
  }

  if (
    lastSeenTime !== null &&
    Number.isFinite(lastSeenTime) &&
    snapshotTime - lastSeenTime > 120_000
  ) {
    return labels.visibility.heartbeatStale;
  }

  return "";
}

function taskRuntimeSummary(
  row: AdminTaskVisibilityRow,
  snapshotAt: string,
  labels: AdminContent,
  locale: Locale,
) {
  const parts = [
    row.agentName ?? null,
    row.reservationStatus
      ? `${labels.visibility.reservation} ${readableToken(row.reservationStatus)}`
      : null,
    row.reservedAt
      ? `${labels.visibility.reserved} ${relativeDuration(row.reservedAt, snapshotAt, locale)}`
      : null,
    row.workerSessionStatus
      ? `${labels.visibility.session} ${readableToken(row.workerSessionStatus)}`
      : null,
    row.workerSessionLastSeenAt
      ? `${labels.visibility.seen} ${relativeDuration(row.workerSessionLastSeenAt, snapshotAt, locale)}`
      : null,
    row.latestEventType
      ? `${labels.visibility.lastEvent} ${readableToken(row.latestEventType)}`
      : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function LiveStatusBadge({
  labels,
  pulseAt,
}: Readonly<{
  labels: AdminContent;
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
    state === "live"
      ? labels.visibility.live
      : state === "idle"
        ? labels.visibility.idle
        : labels.visibility.disconnected;
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
        aria-label={`${labels.visibility.liveUpdates}: ${stateLabel}`}
        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-200 transition-colors"
        title={`${labels.visibility.liveUpdates}: ${stateLabel}`}
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

function taskGroupTint(taskGroupId: string) {
  const palette = [
    "bg-emerald-50/70",
    "bg-sky-50/70",
    "bg-amber-50/70",
    "bg-violet-50/70",
    "bg-rose-50/70",
  ];
  const hash = [...taskGroupId].reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );

  return palette[hash % palette.length];
}

export function AdminVisibilityView({
  data,
  heartbeatAt,
  labels,
  locale,
  selectedTaskId,
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
    taskMatchesMetric(row, selectedMetricId, data.generatedAt),
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
      value: formatNumber(data.summary.total, locale),
    },
    {
      color: businessMetricColors.queued,
      id: "tasksQueued",
      label: labels.visibility.queued,
      series: [],
      value: formatNumber(data.summary.queued, locale),
    },
    {
      color: businessMetricColors.active,
      id: "tasksActive",
      label: labels.visibility.active,
      series: [],
      value: formatNumber(data.summary.active, locale),
    },
    {
      color: businessMetricColors.human,
      id: "tasksHuman",
      label: labels.visibility.human,
      series: [],
      value: formatNumber(data.summary.human, locale),
    },
    {
      color: businessMetricColors.blocked,
      id: "tasksBlocked",
      label: labels.visibility.blocked,
      series: [],
      value: formatNumber(data.summary.blocked, locale),
    },
    {
      color: businessMetricColors.failed,
      id: "tasksFailed",
      label: labels.visibility.failed,
      series: [],
      value: formatNumber(data.summary.failed, locale),
    },
    {
      color: businessMetricColors.completed,
      id: "tasksCompleted",
      label: labels.visibility.completed,
      series: [],
      value: formatNumber(data.summary.completed, locale),
    },
  ];

  return (
    <section className="mt-8 space-y-6">
      <LiveStatusBadge labels={labels} pulseAt={heartbeatAt} />

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
                groupCount={groupCounts[row.taskGroupId] ?? 1}
                key={row.id}
                labels={labels}
                locale={locale}
                onClick={() => setSelectedTaskOverrideId(row.id)}
                row={row}
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
  snapshotAt,
}: Readonly<{
  groupCount: number;
  labels: AdminContent;
  locale: Locale;
  onClick: () => void;
  row: AdminTaskVisibilityRow;
  snapshotAt: string;
}>) {
  const runtimeSummary = taskRuntimeSummary(row, snapshotAt, labels, locale);
  const runtimeWarning = taskRuntimeWarning(row, snapshotAt, labels);
  const groupTint = groupCount > 1 ? taskGroupTint(row.taskGroupId) : "";

  return (
    <button
      aria-label={`${labels.supplements.details}: ${row.title}`}
      className={classNames(
        groupTint,
        "block w-full px-5 py-3 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1FA77A]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="grid gap-3 sm:grid-cols-[9rem_8rem_8rem_minmax(0,1fr)_7rem] sm:items-center">
        <span
          className={classNames(
            taskStatusClass(row.status),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
          )}
        >
          {taskStatusLabel(row.status, labels)}
        </span>
        <span
          className={classNames(
            taskValueClass(row.effectiveBusinessValue),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
          )}
        >
          {taskValueLabel(row.effectiveBusinessValue, locale)}
        </span>
        <span
          className={classNames(
            taskActorClass(row.actorType),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
          )}
        >
          {taskActorLabel(row.actorType, labels)}
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
            runtimeWarning ? "text-amber-700" : "text-gray-500",
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
  snapshotAt,
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  row: AdminTaskVisibilityRow;
  snapshotAt: string;
}>) {
  const runtimeSummary = taskRuntimeSummary(row, snapshotAt, labels, locale);
  const runtimeWarning = taskRuntimeWarning(row, snapshotAt, labels);

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={classNames(
                taskStatusClass(row.status),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
              )}
            >
              {taskStatusLabel(row.status, labels)}
            </span>
            <span
              className={classNames(
                taskValueClass(row.effectiveBusinessValue),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
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
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
          onClick={onClose}
          type="button"
        >
          {labels.supplements.close}
        </button>
      </div>

      <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SupplementListMeta
            label={labels.visibility.group}
            value={row.groupLabel ?? compactId(row.taskGroupId)}
          />
          <SupplementListMeta
            label={labels.visibility.actor}
            value={taskActorLabel(row.actorType, labels)}
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
            label={labels.visibility.scheduled}
            value={formatGeneratedAt(row.scheduledFor, locale)}
          />
          <SupplementListMeta
            label={labels.visibility.lease}
            value={row.leaseUntil ? formatGeneratedAt(row.leaseUntil, locale) : ""}
          />
          <SupplementListMeta
            label={labels.visibility.plan}
            value={
              <PlanIdLink compact={true} locale={locale} planId={row.planId} />
            }
          />
          <SupplementListMeta
            label={labels.visibility.ray}
            value={row.rayId ? compactId(row.rayId) : ""}
          />
          <SupplementListMeta
            label={labels.visibility.reasoning}
            value={readableToken(row.reasoningEffort)}
          />
        </div>

        <div>
          <p
            className={classNames(
              "mb-2 text-xs font-semibold text-gray-400",
              locale === "en"
                ? "uppercase tracking-[0.16em]"
                : adminLocaleTextClass(locale, "label"),
            )}
          >
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
          <p
            className={classNames(
              "mb-2 text-xs font-semibold text-gray-400",
              locale === "en"
                ? "uppercase tracking-[0.16em]"
                : adminLocaleTextClass(locale, "label"),
            )}
          >
            {labels.visibility.runtime}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SupplementListMeta
              label={labels.visibility.reservation}
              value={
                row.reservationId
                  ? `${readableToken(row.reservationStatus ?? "unknown")} · ${compactId(row.reservationId)}`
                  : ""
              }
            />
            <SupplementListMeta
              label={labels.visibility.reserved}
              value={
                row.reservedAt
                  ? `${formatGeneratedAt(row.reservedAt, locale)} · ${relativeDuration(row.reservedAt, snapshotAt, locale)}`
                  : ""
              }
            />
            <SupplementListMeta
              label={labels.visibility.heartbeat}
              value={
                row.reservationHeartbeatAt
                  ? `${formatGeneratedAt(row.reservationHeartbeatAt, locale)} · ${relativeDuration(row.reservationHeartbeatAt, snapshotAt, locale)}`
                  : ""
              }
            />
            <SupplementListMeta
              label={labels.visibility.agentSession}
              value={
                row.workerSessionId
                  ? `${readableToken(row.workerSessionStatus ?? "unknown")} · ${compactId(row.workerSessionId)}`
                  : ""
              }
            />
            <SupplementListMeta
              label={labels.visibility.agentSeen}
              value={
                row.workerSessionLastSeenAt
                  ? `${formatGeneratedAt(row.workerSessionLastSeenAt, locale)} · ${relativeDuration(row.workerSessionLastSeenAt, snapshotAt, locale)}`
                  : ""
              }
            />
            <SupplementListMeta
              label={labels.visibility.lastEvent}
              value={
                row.latestEventType
                  ? [
                      readableToken(row.latestEventType),
                      readableToken(row.latestEventStatus ?? "observed"),
                      row.latestEventSeverity
                        ? readableToken(row.latestEventSeverity)
                        : null,
                      row.latestEventAt
                        ? relativeDuration(row.latestEventAt, snapshotAt, locale)
                        : null,
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
                  : "bg-gray-50 text-gray-700 ring-gray-200",
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
