"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState, type ReactNode } from "react";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type {
  AdminFinancialCategory,
  AdminFinancialMetricId,
  AdminFinancialTransactionRow,
  AdminFinancialsData
} from "@/lib/admin-financials";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  BusinessTrendChart,
  adminTaskVisibilityHref,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatMoney,
  formatMoneyNumber,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";

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

export function AdminFinancialsView({
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
