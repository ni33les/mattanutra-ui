"use client";

import type {
  AdminTechnicalAlertRow,
  AdminTechnicalAlertsData,
  AdminTechnicalSeverity
} from "@/lib/admin-technical";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/safety-views";

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

export function AdminTechnicalAlertsView({
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
                      <div
                        className={classNames(
                          "text-xs font-semibold text-red-700",
                          locale === "en"
                            ? "uppercase tracking-wide"
                            : adminLocaleTextClass(locale, "label")
                        )}
                      >
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
