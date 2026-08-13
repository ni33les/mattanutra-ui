"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type {
  AdminFinancialMetricId,
  AdminFinancialTransactionRow,
  AdminFinancialsData
} from "@/lib/admin-financials";
import {
  formatLedgerMoney,
  type AdminFinancialCategory,
  type AdminFinancialDirection,
  type AdminFinancialEntryBasis
} from "@/lib/admin-financials-display";
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

function formatSignedMoney(
  amountUsd: number,
  direction: AdminFinancialDirection,
  locale: Locale
) {
  return formatLedgerMoney(amountUsd, direction, locale === "th" ? "th-TH" : "en-GB");
}

function formatNetMoney(netUsd: number, locale: Locale) {
  if (netUsd < 0) {
    return formatLedgerMoney(netUsd, "out", locale === "th" ? "th-TH" : "en-GB");
  }

  return formatLedgerMoney(netUsd, "in", locale === "th" ? "th-TH" : "en-GB");
}

function formatTemplate(
  template: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kpiDisabled = data.summary.kpiDisabled;

  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      format: "currency",
      id: "revenue",
      label: labels.financials.revenue,
      series: data.series.revenue,
      value: kpiDisabled
        ? "—"
        : formatLedgerMoney(
            data.summary.revenueUsd,
            "in",
            locale === "th" ? "th-TH" : "en-GB"
          )
    },
    {
      color: businessMetricColors.queued,
      format: "currency",
      id: "payout",
      label: labels.financials.payouts,
      series: data.series.payout,
      value: kpiDisabled
        ? "—"
        : formatLedgerMoney(
            data.summary.payoutUsd,
            "out",
            locale === "th" ? "th-TH" : "en-GB"
          )
    },
    {
      color: businessMetricColors.contentScheduled,
      format: "currency",
      id: "operatingCost",
      label: labels.financials.operatingCost,
      series: data.series.operatingCost,
      value: kpiDisabled
        ? "—"
        : formatLedgerMoney(
            data.summary.operatingCostUsd,
            "out",
            locale === "th" ? "th-TH" : "en-GB"
          )
    },
    {
      color: businessMetricColors.succeeded,
      format: "currency",
      id: "net",
      label: labels.financials.net,
      series: data.series.net,
      value: kpiDisabled ? "—" : formatNetMoney(data.summary.netUsd, locale)
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
    useState<AdminFinancialMetricId>("revenue");
  const [selectedRow, setSelectedRow] =
    useState<AdminFinancialTransactionRow | null>(null);
  const selectedMetric =
    metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];
  const categoryLabel = (category: AdminFinancialCategory) =>
    category === "ai" ? "AI" : readableToken(category);

  const totalPages = Math.max(1, Math.ceil(data.totalCount / data.pageSize) || 1);
  const showingFrom =
    data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const showingTo = Math.min(data.page * data.pageSize, data.totalCount);

  const basisOptions = useMemo(
    () =>
      [
        { id: "nominal" as const, label: labels.financials.basisNominal },
        { id: "actual" as const, label: labels.financials.basisActual },
        { id: "all" as const, label: labels.financials.basisAll }
      ] satisfies Array<{ id: AdminFinancialEntryBasis; label: string }>,
    [labels.financials.basisActual, labels.financials.basisAll, labels.financials.basisNominal]
  );

  function replaceQuery(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.push(`${pathname}?${params.toString()}`);
  }

  function setEntryBasis(basis: AdminFinancialEntryBasis) {
    replaceQuery({
      entryBasis: basis === "nominal" ? null : basis,
      page: null
    });
  }

  function setPage(nextPage: number) {
    const safe = Math.min(Math.max(1, nextPage), totalPages);
    replaceQuery({
      page: safe <= 1 ? null : String(safe)
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {labels.financials.entryBasis}
          </p>
          <div className="mt-2 inline-flex rounded-lg bg-gray-100 p-1 ring-1 ring-gray-200">
            {basisOptions.map((option) => (
              <button
                className={classNames(
                  data.entryBasis === option.id
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                    : "text-gray-600 hover:text-gray-900",
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition"
                )}
                key={option.id}
                onClick={() => setEntryBasis(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {data.entryBasis === "all" ? (
            <p className="mt-2 text-xs text-amber-700">
              {labels.financials.basisAllHint}
            </p>
          ) : null}
        </div>
      </div>

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {labels.financials.transactions}
          </h2>
          <p className="text-sm text-gray-500">
            {formatTemplate(labels.financials.showing, {
              from: formatNumber(showingFrom, locale),
              to: formatNumber(showingTo, locale),
              total: formatNumber(data.totalCount, locale)
            })}
          </p>
        </div>
        {data.rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th
                      className="py-3.5 pl-5 pr-3 text-left text-sm font-semibold text-gray-900"
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
                      className="py-3.5 pl-3 pr-5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.financials.usd}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((row) => (
                    <tr
                      className="cursor-pointer hover:bg-emerald-50/40 focus:bg-emerald-50/60 focus:outline-none"
                      key={row.id}
                      onClick={() => setSelectedRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedRow(row);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="whitespace-nowrap py-4 pl-5 pr-3 text-sm text-gray-500">
                        {formatGeneratedAt(row.occurredAt, locale)}
                      </td>
                      <td className="min-w-96 px-3 py-4 text-sm">
                        <div className="font-medium text-gray-900">
                          {row.description}
                        </div>
                        <div className="mt-1 max-w-xl truncate text-xs text-gray-400">
                          {financialResourceSummary(row) ||
                            row.sourceRef ||
                            row.source}
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
                      <td
                        className={classNames(
                          "whitespace-nowrap py-4 pl-3 pr-5 text-right text-sm font-semibold",
                          row.direction === "out"
                            ? "text-rose-700"
                            : "text-gray-900"
                        )}
                      >
                        {formatSignedMoney(
                          row.amountUsd,
                          row.direction,
                          locale
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
              <p className="text-sm text-gray-500">
                {formatTemplate(labels.financials.pageOf, {
                  page: formatNumber(data.page, locale),
                  pages: formatNumber(totalPages, locale)
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
                  type="button"
                >
                  {labels.financials.previousPage}
                </button>
                <button
                  className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={data.page >= totalPages}
                  onClick={() => setPage(data.page + 1)}
                  type="button"
                >
                  {labels.financials.nextPage}
                </button>
              </div>
            </div>
          </>
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
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 pr-14">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            {row.description}
          </h2>
          <p className="mt-1 break-all text-xs text-gray-400">
            {row.sourceRef ?? row.source}
          </p>
        </div>
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
          value={formatLedgerMoney(
            row.amount / 1_000_000,
            row.direction,
            locale === "th" ? "th-TH" : "en-GB",
            row.currency
          )}
        />
        <FinancialDetailRow
          label={labels.financials.usd}
          value={formatSignedMoney(row.amountUsd, row.direction, locale)}
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
      <div className="flex justify-end border-t border-gray-100 px-6 py-4">
        <button
          className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          onClick={onClose}
          type="button"
        >
          {labels.supplements.close}
        </button>
      </div>
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
    <div className="grid grid-cols-[9rem_1fr] gap-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 font-medium text-gray-900">{value}</dd>
    </div>
  );
}
