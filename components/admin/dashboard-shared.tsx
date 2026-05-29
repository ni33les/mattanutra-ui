"use client";

import { useEffect, useState } from "react";
import { HealthspanLogo } from "@/components/healthspan-logo";
import { adminDashboardFilterEntries, type AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { AdminTaskVisibilityRow } from "@/lib/admin-execution";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminConversionTargetId, AdminFlowData, AdminFlowNodeId } from "@/lib/admin-flow-data";
import type { FoodConfidence, FoodListStatus } from "@/lib/admin-foods";
import type {
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import type { AdminContent, AdminDashboardView, AdminNavItem } from "@/components/admin/dashboard-content";

export function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function buttonGroupItemClasses(active: boolean, index: number, total: number) {
  return classNames(
    "relative inline-flex items-center px-3 py-2 text-sm font-semibold ring-1 ring-inset transition focus:z-10 focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A]",
    index === 0 && "rounded-l-md",
    index > 0 && "-ml-px",
    index === total - 1 && "rounded-r-md",
    active
      ? "z-10 bg-[#1FA77A] text-white ring-[#1FA77A]"
      : "bg-white text-gray-900 ring-gray-300 hover:bg-gray-50"
  );
}

export function adminLocaleTextClass(locale: Locale, intent: "body" | "heading" | "label" = "body") {
  if (locale === "zh-CN") {
    return intent === "heading"
      ? "font-sans tracking-normal leading-tight break-words"
      : "font-sans tracking-normal leading-relaxed";
  }

  if (locale === "th") {
    return intent === "heading"
      ? "font-sans tracking-normal leading-snug break-words"
      : "font-sans tracking-normal leading-relaxed";
  }

  return intent === "heading" ? "tracking-tight" : "";
}

export function adminHref(
  locale: Locale,
  accessToken: string,
  range: AdminDashboardRange,
  view: AdminDashboardView,
  filters?: AdminDashboardFilters,
  state?: Readonly<{
    reviewTaskId?: string | null;
    taskId?: string | null;
  }>
) {
  const params = new URLSearchParams({
    range,
    view
  });

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  if (filters) {
    adminDashboardFilterEntries(filters).forEach(([key, value]) => {
      params.set(key, value);
    });
  }

  if (state?.reviewTaskId) {
    params.set("review", state.reviewTaskId);
  }

  if (state?.taskId) {
    params.set("task", state.taskId);
  }

  return `/${locale}/admin/dashboard?${params.toString()}`;
}

export function adminTaskVisibilityHref({
  accessToken,
  locale,
  range,
  taskId
}: Readonly<{
  accessToken: string;
  locale: Locale;
  range: AdminDashboardRange;
  taskId: string;
}>) {
  const params = new URLSearchParams({
    range,
    task: taskId,
    view: "visibility"
  });

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/${locale}/admin/dashboard?${params.toString()}`;
}

export function adminExecutionEventsHref({
  accessToken,
  range,
  view
}: Readonly<{
  accessToken: string;
  range: AdminDashboardRange;
  view: "agents" | "visibility";
}>) {
  const params = new URLSearchParams({
    range
  });

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/api/admin/${view}/events?${params.toString()}`;
}

export function useLiveAdminData<T>({
  enabled,
  eventName,
  href,
  initialData,
  onHeartbeat,
  streamKey
}: Readonly<{
  enabled: boolean;
  eventName: string;
  href: string;
  initialData: T;
  onHeartbeat?: () => void;
  streamKey: string;
}>) {
  const [streamedData, setStreamedData] = useState<{
    data: T;
    key: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !href || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource(href);

    function handleEvent(event: Event) {
      try {
        setStreamedData({
          data: JSON.parse((event as MessageEvent).data) as T,
          key: streamKey
        });
      } catch {
        // Keep the last good snapshot if the browser receives a malformed frame.
      }
    }

    function handleHeartbeat() {
      onHeartbeat?.();
    }

    source.addEventListener(eventName, handleEvent);
    source.addEventListener("pong", handleHeartbeat);

    return () => {
      source.removeEventListener(eventName, handleEvent);
      source.removeEventListener("pong", handleHeartbeat);
      source.close();
    };
  }, [enabled, eventName, href, onHeartbeat, streamKey]);

  return streamedData?.key === streamKey ? streamedData.data : initialData;
}

export function formatLocale(locale: Locale) {
  if (locale === "th") {
    return "th-TH-u-nu-latn";
  }

  if (locale === "zh-CN") {
    return "zh-CN";
  }

  return "en-GB";
}

export function formatGeneratedAt(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(formatLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(formatLocale(locale)).format(value);
}

export function formatMoneyNumber(value: number, locale: Locale) {
  const absoluteValue = Math.abs(value);
  const fractionDigits = absoluteValue >= 100 || value === 0
    ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
    : { maximumFractionDigits: 4, minimumFractionDigits: 2 };

  return new Intl.NumberFormat(formatLocale(locale), {
    maximumFractionDigits: fractionDigits.maximumFractionDigits,
    minimumFractionDigits: fractionDigits.minimumFractionDigits
  }).format(value);
}

export function formatMoney(value: number, currency: string, locale: Locale) {
  const absoluteValue = Math.abs(value);
  const fractionDigits = absoluteValue >= 100 || value === 0
    ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
    : { maximumFractionDigits: 4, minimumFractionDigits: 2 };

  return new Intl.NumberFormat(formatLocale(locale), {
    currency,
    maximumFractionDigits: fractionDigits.maximumFractionDigits,
    minimumFractionDigits: fractionDigits.minimumFractionDigits,
    style: "currency"
  }).format(value);
}

export function formatTaskDuration(ms: number, locale: Locale) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const number = (value: number) => formatNumber(value, locale);

  if (days > 0) {
    return `${number(days)}d ${number(hours)}h`;
  }

  if (hours > 0) {
    return `${number(hours)}h ${number(minutes)}m`;
  }

  if (minutes > 0) {
    return `${number(minutes)}m ${number(seconds)}s`;
  }

  return `${number(seconds)}s`;
}

export function formatPercent(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(formatLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value)}%`;
}

function SidebarNavList({
  accessToken,
  allowedViews,
  filters,
  items,
  locale,
  onNavigate,
  range,
  title,
  view
}: Readonly<{
  accessToken: string;
  allowedViews?: readonly AdminDashboardView[];
  filters: AdminDashboardFilters;
  items: AdminNavItem[];
  locale: Locale;
  onNavigate?: () => void;
  range: AdminDashboardRange;
  title?: string;
  view: AdminDashboardView;
}>) {
  const visibleItems = allowedViews
    ? items.filter((item) => !item.view || allowedViews.includes(item.view))
    : items;

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <li>
      {title ? (
        <div
          className={classNames(
            "text-xs/6 font-semibold text-gray-400",
            locale === "en" ? "uppercase tracking-[0.16em]" : adminLocaleTextClass(locale, "label")
          )}
        >
          {title}
        </div>
      ) : null}
      <ul role="list" className={classNames("-mx-2 space-y-1", title && "mt-2")}>
        {visibleItems.map((item) => {
          const current = item.view === view;
          const href = item.view
            ? adminHref(locale, accessToken, range, item.view, filters)
            : item.href ?? "#";

          return (
            <li key={item.name}>
              <a
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={classNames(
                  current
                    ? "bg-[#1FA77A]/10 text-[#126B4F]"
                    : "text-gray-700 hover:bg-gray-50 hover:text-[#126B4F]",
                  "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold"
                )}
              >
                <item.icon
                  aria-hidden={true}
                  className={classNames(
                    current
                      ? "text-[#1FA77A]"
                      : "text-gray-400 group-hover:text-[#1FA77A]",
                    "size-6 shrink-0"
                  )}
                />
                {item.name}
              </a>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function AdminLocaleSwitcher({
  accessToken,
  filters,
  labels,
  locale,
  range,
  reviewTaskId,
  taskId,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
  reviewTaskId?: string | null;
  taskId?: string | null;
  view: AdminDashboardView;
}>) {
  return (
    <div aria-label={labels.adminLanguage} className="isolate inline-flex rounded-md shadow-sm">
      {publicLocales.map((localeCode, index) => (
        <a
          aria-current={localeCode === locale ? "page" : undefined}
          className={classNames(
            buttonGroupItemClasses(localeCode === locale, index, publicLocales.length),
            adminLocaleTextClass(localeCode, "label")
          )}
          href={adminHref(localeCode, accessToken, range, view, filters, {
            reviewTaskId,
            taskId
          })}
          key={localeCode}
          title={localeLabels[localeCode]}
        >
          {localeLabels[localeCode]}
        </a>
      ))}
    </div>
  );
}

export function SidebarContent({
  accessToken,
  allowedViews,
  filters,
  labels,
  locale,
  onNavigate,
  range,
  view
}: Readonly<{
  accessToken: string;
  allowedViews?: readonly AdminDashboardView[];
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  onNavigate?: () => void;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  return (
    <div className="flex grow flex-col gap-y-6 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
      <div className="flex h-20 shrink-0 items-center justify-between gap-3">
        <a
          href={`/${locale}`}
          onClick={onNavigate}
          aria-label="MattaNutra home"
          className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
        >
          <HealthspanLogo />
        </a>
      </div>
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-8">
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.performance}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.performanceTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.marketing}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.marketingTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.contentNavigation}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.contentTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.governance}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.governanceTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.insights}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.insightsTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.execution}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.executionTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            allowedViews={allowedViews}
            filters={filters}
            items={labels.administration}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.administrationTitle}
            view={view}
          />
        </ul>
      </nav>
    </div>
  );
}


export type BusinessMetric = Readonly<{
  color: string;
  format?: "currency" | "number" | "percent";
  id: string;
  label: string;
  series: number[];
  value: string;
}>;

export type BusinessMetricColorId =
  | AdminConversionTargetId
  | "communicationIssues"
  | "contentDeleted"
  | "contentDraft"
  | "contentPublished"
  | "contentScheduled"
  | "conversionRate"
  | "converted"
  | "active"
  | "blocked"
  | "completed"
  | "critical"
  | "failed"
  | "high"
  | "human"
  | "low"
  | "medium"
  | "offline"
  | "paused"
  | "processing"
  | "queued"
  | "retired"
  | "scheduled"
  | "stuck"
  | "succeeded"
  | "noChannel"
  | "pageViews"
  | "pendingReviews"
  | "total";

export const businessMetricColors = {
  active: "#3A7BD5",
  assessmentCompletions: "#2563EB",
  assessmentStarts: "#0EA5E9",
  blocked: "#F59E0B",
  communicationIssues: "#DC2626",
  completed: "#126B4F",
  contentDeleted: "#6B7280",
  contentDraft: "#64748B",
  contentPublished: "#126B4F",
  contentScheduled: "#3A7BD5",
  critical: "#991B1B",
  failed: "#DC2626",
  freeRequests: "#8B5CF6",
  healthScoreViews: "#1FA77A",
  high: "#DC2626",
  human: "#8B5CF6",
  landingVisitors: "#20343A",
  low: "#0F766E",
  medium: "#F59E0B",
  noChannel: "#DC2626",
  offline: "#6B7280",
  pageViews: "#0F766E",
  paused: "#F59E0B",
  pendingReviews: "#F59E0B",
  precisionConversions: "#126B4F",
  processing: "#3A7BD5",
  proConversions: "#111827",
  queued: "#0EA5E9",
  retired: "#64748B",
  scheduled: "#0EA5E9",
  stuck: "#DC2626",
  succeeded: "#126B4F",
  total: "#20343A",
  converted: "#8B5CF6",
  conversionRate: "#0F766E"
} satisfies Record<BusinessMetricColorId, string>;

export function flowNodeSeries(flowData: AdminFlowData, id: AdminFlowNodeId) {
  return (
    flowData.series.nodes[id] ??
    flowData.series.bucketLabels.map(() => 0)
  );
}

export function flowNodeCount(flowData: AdminFlowData, id: AdminFlowNodeId) {
  return flowData.nodes.find((node) => node.id === id)?.count ?? 0;
}

export function combinedSeries(...seriesList: number[][]) {
  const maxLength = Math.max(0, ...seriesList.map((series) => series.length));

  return Array.from({ length: maxLength }, (_, index) =>
    seriesList.reduce((total, series) => total + (series[index] ?? 0), 0)
  );
}

export function percentageMetricSeries(numerator: number[], denominator: number[]) {
  const maxLength = Math.max(numerator.length, denominator.length);

  return Array.from({ length: maxLength }, (_, index) => {
    const bottom = denominator[index] ?? 0;

    return bottom > 0 ? Number((((numerator[index] ?? 0) / bottom) * 100).toFixed(1)) : 0;
  });
}

function formatBusinessMetricAxisValue(
  metric: BusinessMetric,
  value: number,
  locale: Locale
) {
  if (metric.format === "currency") {
    return formatMoneyNumber(value, locale);
  }

  return metric.format === "percent"
    ? formatPercent(value, locale)
    : formatNumber(Math.round(value), locale);
}

export function BusinessStatsGrid({
  metrics,
  onMetricSelect,
  selectedMetricId
}: Readonly<{
  metrics: BusinessMetric[];
  onMetricSelect?: (id: BusinessMetric["id"]) => void;
  selectedMetricId?: BusinessMetric["id"];
}>) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="grid grid-cols-1 gap-px bg-gray-900/5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const selected = metric.id === selectedMetricId;
          const content = (
            <>
              <p className="text-sm/6 font-medium text-gray-500">{metric.label}</p>
              <p className="mt-2 flex items-baseline gap-x-2">
                <span className="text-4xl font-semibold tracking-tight text-gray-900">
                  {metric.value}
                </span>
              </p>
            </>
          );
          const classes = classNames(
            selected ? "bg-gray-50 ring-1 ring-inset ring-gray-200" : "bg-white",
            "px-5 py-6 text-left transition",
            onMetricSelect && !selected && "hover:bg-gray-50",
            onMetricSelect &&
              "focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A]"
          );

          return onMetricSelect ? (
            <button
              className={classes}
              key={metric.id}
              onClick={() => onMetricSelect(metric.id)}
              type="button"
            >
              {content}
            </button>
          ) : (
            <div className={classes} key={metric.id}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BusinessTrendChart({
  bucketLabels,
  locale,
  metric
}: Readonly<{
  bucketLabels: string[];
  locale: Locale;
  metric: BusinessMetric;
}>) {
  const width = 900;
  const height = 260;
  const paddingX = 28;
  const paddingTop = 18;
  const paddingBottom = 36;
  const series = metric.series.length > 0 ? metric.series : [0];
  const maxValue = Math.max(1, ...series);
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;
  const xFor = (index: number) =>
    paddingX + (series.length <= 1 ? 0 : (index / (series.length - 1)) * chartWidth);
  const yFor = (value: number) =>
    paddingTop + chartHeight - (value / maxValue) * chartHeight;
  const points = series
    .map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`)
    .join(" ");
  const firstLabel = bucketLabels[0] ?? "";
  const lastLabel = bucketLabels.at(-1) ?? "";

  return (
    <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {metric.label}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{firstLabel} - {lastLabel}</p>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-gray-900">
          {metric.value}
        </p>
      </div>

      <svg
        aria-label={metric.label}
        className="mt-5 h-72 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = paddingTop + chartHeight - tick * chartHeight;

          return (
            <g key={tick}>
              <line
                className="stroke-gray-200"
                strokeWidth="1"
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
              <text
                className="fill-gray-400 text-[10px]"
                textAnchor="start"
                x={paddingX}
                y={Math.max(10, y - 4)}
              >
                {formatBusinessMetricAxisValue(metric, maxValue * tick, locale)}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          points={points}
          stroke={metric.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {series.map((value, index) => (
          <circle
            cx={xFor(index)}
            cy={yFor(value)}
            fill="white"
            key={`${index}-${value}`}
            r="4"
            stroke={metric.color}
            strokeWidth="3"
          />
        ))}
        <text
          className="fill-gray-400 text-[10px]"
          textAnchor="start"
          x={paddingX}
          y={height - 8}
        >
          {firstLabel}
        </text>
        <text
          className="fill-gray-400 text-[10px]"
          textAnchor="end"
          x={width - paddingX}
          y={height - 8}
        >
          {lastLabel}
        </text>
      </svg>
    </section>
  );
}

export function optionalLabel(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ?? "";
}

export const supplementListStatuses: SupplementListStatus[] = [
  "active",
  "blocked"
];

export const supplementConfidences: SupplementConfidence[] = [
  "high",
  "moderate",
  "low"
];

export const foodListStatuses: FoodListStatus[] = [
  "whitelisted",
  "review_required",
  "blacklisted",
  "inactive"
];

export const foodConfidences: FoodConfidence[] = ["high", "moderate", "low"];

export function taskIsTerminal(status: string) {
  return ["cancelled", "completed", "failed", "skipped"].includes(status);
}

export function readableToken(value: string) {
  if (value === "completed") {
    return "Succeeded";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeValue(value: number | string) {
  const parsed =
    typeof value === "number" ? value : new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function useNowTimer(enabled: boolean, initialNow: number | string) {
  const initialNowMs = timeValue(initialNow);
  const [now, setNow] = useState(initialNowMs);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tick = () => setNow(Date.now());
    const timeout = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [enabled]);

  return enabled ? now : initialNowMs;
}

export function TaskAgeTimer({
  initialNow,
  locale,
  row
}: Readonly<{
  initialNow: string;
  locale: Locale;
  row: Pick<AdminTaskVisibilityRow, "createdAt" | "status" | "updatedAt">;
}>) {
  const terminal = taskIsTerminal(row.status);
  const now = useNowTimer(!terminal, initialNow);

  const createdAt = new Date(row.createdAt).getTime();
  const endAt = terminal ? new Date(row.updatedAt).getTime() : now;

  if (!Number.isFinite(createdAt) || endAt === null || !Number.isFinite(endAt)) {
    return "";
  }

  return formatTaskDuration(endAt - createdAt, locale);
}

export function ReviewAgeTimer({
  createdAt,
  initialNow,
  locale
}: Readonly<{
  createdAt: string;
  initialNow: string;
  locale: Locale;
}>) {
  const now = useNowTimer(true, initialNow);
  const startedAt = new Date(createdAt).getTime();

  if (!Number.isFinite(startedAt)) {
    return "";
  }

  return formatTaskDuration(now - startedAt, locale);
}

export function compactId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function planRevealHref(locale: Locale, planId: string) {
  return nutritionRevealPath(locale, planId);
}

export function PlanIdLink({
  className,
  compact = false,
  locale,
  planId,
  stopPropagation = false
}: Readonly<{
  className?: string;
  compact?: boolean;
  locale: Locale;
  planId: string | null | undefined;
  stopPropagation?: boolean;
}>) {
  if (!planId) {
    return "";
  }

  return (
    <a
      className={classNames(
        "font-semibold text-[#3A7BD5] hover:text-[#2F67B8]",
        className
      )}
      href={planRevealHref(locale, planId)}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      onKeyDown={
        stopPropagation ? (event) => event.stopPropagation() : undefined
      }
      rel="noreferrer"
      target="_blank"
    >
      {compact ? compactId(planId) : planId}
    </a>
  );
}

export function taskValueLabel(value: number, locale: Locale) {
  if (value >= 500) {
    return locale === "th" ? "วิกฤต" : locale === "zh-CN" ? "严重" : "Critical";
  }

  if (value >= 400) {
    return locale === "th" ? "สูง" : locale === "zh-CN" ? "高" : "High";
  }

  if (value >= 300) {
    return locale === "th" ? "เร่งด่วน" : locale === "zh-CN" ? "加急" : "Expedited";
  }

  if (value >= 200) {
    return locale === "th" ? "ปกติ" : locale === "zh-CN" ? "正常" : "Normal";
  }

  return locale === "th" ? "ต่ำ" : locale === "zh-CN" ? "低" : "Low";
}

export function taskValueClass(value: number) {
  if (value >= 500) {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (value >= 400) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (value >= 300) {
    return "bg-sky-50 text-sky-700 ring-sky-100";
  }

  if (value >= 200) {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

export function taskStatusClass(status: string) {
  if (status === "completed") {
    return "bg-[#1FA77A]/10 text-[#126B4F] ring-[#1FA77A]/20";
  }

  if (status === "queued") {
    return "bg-sky-50 text-sky-700 ring-sky-100";
  }

  if (status === "reserved" || status === "running") {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (
    status === "blocked" ||
    status === "needs_review" ||
    status === "waiting_approval"
  ) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}
