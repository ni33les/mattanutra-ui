"use client";

import { useMemo, useState } from "react";
import { FileDown, Printer, ReceiptText } from "lucide-react";
import type {
  AdminRetailFinancialsData,
  AdminRetailFinancialsRow,
  RetailSettlementStatus
} from "@/lib/admin-retail-financials";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";
import {
  retailFinancialsLabels,
  retailFinancialsStatusLabel
} from "@/lib/retail-financials-labels";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  classNames,
  formatGeneratedAt,
  formatNumber,
  formatMoney,
  formatMoneyNumber,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";

type SettlementEditor =
  | Readonly<{
      mode: "confirm";
      row: AdminRetailFinancialsRow;
    }>
  | Readonly<{
      mode: "paid";
      row: AdminRetailFinancialsRow;
    }>
  | null;

type SettlementFilter = "all" | RetailSettlementStatus;

function statusClasses(status: RetailSettlementStatus) {
  if (status === "confirmed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }

  if (status === "due" || status === "paid") {
    return "bg-amber-50 text-amber-700 ring-amber-100";
  }

  if (status === "needs_review") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "voided") {
    return "bg-gray-100 text-gray-500 ring-gray-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-100";
}

function currencyHeader(label: string, currency: string) {
  return `${label} (${currency})`;
}

function statementHeading(label: string, currency: string) {
  return currencyHeader(label, currency);
}

function settlementStatusText(
  status: RetailSettlementStatus,
  locale: Locale,
  showPlatformColumns: boolean
) {
  if (!showPlatformColumns && status === "paid") {
    return retailFinancialsLabels(locale).received;
  }

  return retailFinancialsStatusLabel(status, locale);
}

function statementHtml({
  data,
  locale,
  showPlatformColumns
}: Readonly<{
  data: AdminRetailFinancialsData;
  locale: Locale;
  showPlatformColumns: boolean;
}>) {
  const labels = retailFinancialsLabels(locale);
  const amount = (value: number) => formatMoneyNumber(value, locale);
  const statCards = showPlatformColumns
    ? [
        [labels.grossSales, amount(data.summary.grossCustomerAmount)],
        [labels.mattanutraMargin, amount(data.summary.mattanutraMarginAmount)],
        [labels.outstanding, amount(data.summary.outstandingAmount)],
        [labels.nominalPayouts, amount(data.summary.nominalPayoutAmount)],
        [labels.actualPayouts, amount(data.summary.actualPayoutAmount)],
        [labels.confirmed, amount(data.summary.confirmedAmount)]
      ]
    : [
        [
          labels.totalReceivable,
          amount(
            data.summary.pendingAmount +
              data.summary.dueAmount +
              data.summary.paidAmount +
              data.summary.confirmedAmount +
              data.summary.needsReviewAmount
          )
        ],
        [labels.pending, amount(data.summary.pendingAmount)],
        [labels.due, amount(data.summary.dueAmount)],
        [labels.received, amount(data.summary.paidAmount)],
        [labels.needsReview, amount(data.summary.needsReviewAmount)],
        [labels.confirmed, amount(data.summary.confirmedAmount)]
      ];
  const headings = showPlatformColumns
    ? [
        labels.organisation,
        labels.order,
        labels.status,
        labels.shipped,
        labels.customer,
        labels.gross,
        labels.payable,
        labels.margin,
        labels.reference
      ]
    : [
        labels.order,
        labels.status,
        labels.shipped,
        labels.customer,
        labels.receivable,
        labels.received,
        labels.reference
      ];
  const rows = data.rows.map((row) => `
    <tr>
      ${showPlatformColumns ? `<td>${row.organisationName}</td>` : ""}
      <td>${row.orderNumber}</td>
      <td>${settlementStatusText(row.status, locale, showPlatformColumns)}</td>
      <td>${row.shippedAt ? formatGeneratedAt(row.shippedAt, locale) : ""}</td>
      <td>${row.customerName ?? row.customerEmail ?? ""}</td>
      ${showPlatformColumns ? `<td class="number">${amount(row.grossCustomerAmount)}</td>` : ""}
      <td class="number">${amount(row.retailerPayableAmount)}</td>
      ${showPlatformColumns ? `<td class="number">${amount(row.mattanutraMarginAmount)}</td>` : ""}
      ${!showPlatformColumns ? `<td class="number">${row.paidAmount ? amount(row.paidAmount) : ""}</td>` : ""}
      <td>${row.paidReference ?? ""}</td>
    </tr>
  `).join("");
  const headerCells = headings.map((heading) => {
    const isNumber =
      heading.startsWith(`${labels.gross} (`) ||
      heading.startsWith(`${labels.payable} (`) ||
      heading.startsWith(`${labels.margin} (`) ||
      heading.startsWith(`${labels.nominal} (`) ||
      heading.startsWith(`${labels.actual} (`) ||
      heading.startsWith(`${labels.paid} (`) ||
      heading.startsWith(`${labels.receivable} (`) ||
      heading.startsWith(`${labels.received} (`) ||
      heading === labels.gross ||
      heading === labels.payable ||
      heading === labels.receivable ||
      heading === labels.margin ||
      heading === labels.paid ||
      heading === labels.received;

    return `<th${isNumber ? ' class="number"' : ""}>${heading}</th>`;
  }).join("");
  const stats = statCards.map(([label, value]) => `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>
  `).join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${labels.retailerFinancialStatement}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .muted { color: #6b7280; font-size: 12px; }
          .stats { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 24px 0; }
          .stat { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
          .stat-label { color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
          .stat-value { font-size: 18px; font-weight: 700; margin-top: 6px; }
          table { border-collapse: collapse; font-size: 11px; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f9fafb; font-size: 10px; text-transform: uppercase; }
          .number { text-align: right; white-space: nowrap; }
          @media print { body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <h1>${statementHeading(labels.retailerFinancialStatement, data.currency)}</h1>
        <div class="muted">${data.organisationName} · ${formatGeneratedAt(data.generatedAt, locale)}</div>
        <div class="stats">${stats}</div>
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${headings.length}">${labels.noSettlements}</td></tr>`}</tbody>
        </table>
        <script>window.addEventListener("load", () => { window.print(); });</script>
      </body>
    </html>`;
}

function printStatement(
  data: AdminRetailFinancialsData,
  locale: Locale,
  showPlatformColumns: boolean
) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");

  if (!popup) {
    return;
  }

  popup.document.write(statementHtml({ data, locale, showPlatformColumns }));
  popup.document.close();
}

export function AdminRetailFinancialsView({
  accessToken,
  data,
  labels,
  locale,
  range,
  scope
}: Readonly<{
  accessToken: string;
  data: AdminRetailFinancialsData;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
  scope: "platform" | "retail";
}>) {
  const [editor, setEditor] = useState<SettlementEditor>(null);
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = retailFinancialsLabels(locale);
  const showPlatformColumns = scope === "platform" && data.isPlatformScope;
  const retailerTotalReceivable =
    data.summary.pendingAmount +
    data.summary.dueAmount +
    data.summary.paidAmount +
    data.summary.confirmedAmount +
    data.summary.needsReviewAmount;
  const settlementStatusCounts = data.rows.reduce<Record<RetailSettlementStatus, number>>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    {
      confirmed: 0,
      due: 0,
      needs_review: 0,
      paid: 0,
      pending: 0,
      voided: 0
    }
  );
  const settlementAllCount = data.rows.filter((row) => row.status !== "confirmed").length;
  const retailRollupItems = [
    {
      label: text.totalReceivable,
      value: formatMoneyNumber(retailerTotalReceivable, locale)
    },
    {
      label: text.pending,
      value: formatMoneyNumber(data.summary.pendingAmount, locale)
    },
    {
      label: text.due,
      value: formatMoneyNumber(data.summary.dueAmount, locale)
    },
    {
      label: text.awaitingConfirmation,
      value: formatMoneyNumber(data.summary.paidAmount, locale)
    },
    {
      label: text.confirmed,
      value: formatMoneyNumber(data.summary.confirmedAmount, locale)
    },
    {
      label: text.needsReview,
      value: formatMoneyNumber(data.summary.needsReviewAmount, locale)
    },
    {
      label: text.outstanding,
      value: formatMoneyNumber(data.summary.outstandingAmount, locale)
    }
  ];
  const statusMetrics = (paidLabel: string): BusinessMetric[] => [
    {
      color: "#64748B",
      id: "all",
      label: text.all,
      series: [],
      value: formatNumber(settlementAllCount, locale)
    },
    {
      color: "#F59E0B",
      id: "pending",
      label: text.pending,
      series: [],
      value: formatNumber(settlementStatusCounts.pending, locale)
    },
    {
      color: "#D97706",
      id: "due",
      label: text.due,
      series: [],
      value: formatNumber(settlementStatusCounts.due, locale)
    },
    {
      color: "#0EA5E9",
      id: "paid",
      label: paidLabel,
      series: [],
      value: formatNumber(settlementStatusCounts.paid, locale)
    },
    {
      color: "#DC2626",
      id: "needs_review",
      label: text.needsReview,
      series: [],
      value: formatNumber(settlementStatusCounts.needs_review, locale)
    },
    {
      color: "#94A3B8",
      id: "voided",
      label: text.voided,
      series: [],
      value: formatNumber(settlementStatusCounts.voided, locale)
    },
    {
      color: "#059669",
      id: "confirmed",
      label: text.confirmed,
      series: [],
      value: formatNumber(settlementStatusCounts.confirmed, locale)
    }
  ];
  const metrics = statusMetrics(showPlatformColumns ? text.paid : text.awaitingConfirmation);
  const filteredRows = data.rows.filter((row) =>
    settlementFilter === "all" ? row.status !== "confirmed" : row.status === settlementFilter
  );
  const statementHeadings = showPlatformColumns
    ? [
        text.order,
        text.retailer,
        text.status,
        text.customer,
        text.gross,
        text.payable,
        text.margin,
        text.paid,
        text.action
      ]
    : [
        text.order,
        text.status,
        text.customer,
        text.receivable,
        text.received,
        text.action
      ];
  const csvHref = useMemo(() => {
    const params = new URLSearchParams({
      format: "csv",
      locale,
      range
    });

    if (accessToken) {
      params.set("access_token", accessToken);
    }

    return `/api/admin/retail-financials?${params.toString()}`;
  }, [accessToken, range]);

  async function submitSettlement(formData: FormData) {
    if (!editor || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body =
        editor.mode === "paid"
          ? {
              action: "mark_paid",
              paidAmount: Number(formData.get("paidAmount")),
              paidAt: String(formData.get("paidAt") ?? ""),
              paidMethod: String(formData.get("paidMethod") ?? ""),
              paidReference: String(formData.get("paidReference") ?? ""),
              settlementId: editor.row.id
            }
          : {
              action: "confirm_received",
              confirmedReference: String(formData.get("confirmedReference") ?? ""),
              settlementId: editor.row.id
            };
      const response = await fetch("/api/admin/retail-financials", {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || text.settlementUpdateFailed);
      }

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : text.settlementUpdateFailed);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-gray-500">
          {showPlatformColumns ? text.trackPlatform : text.trackRetail}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
            href={csvHref}
          >
            <FileDown className="size-4" aria-hidden={true} />
            {text.exportCsv}
          </a>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#168761]"
            onClick={() => printStatement(data, locale, showPlatformColumns)}
            type="button"
          >
            <Printer className="size-4" aria-hidden={true} />
            {text.exportPdf}
          </button>
        </div>
      </div>

      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={(id) => setSettlementFilter(id as SettlementFilter)}
        selectedMetricId={settlementFilter}
      />

      {!showPlatformColumns ? (
        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              {statementHeading(text.settlementRollup, data.currency)}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {retailRollupItems.map((item) => (
                    <th
                      className="px-5 py-3.5 text-left text-sm font-semibold text-gray-900"
                      key={item.label}
                      scope="col"
                    >
                      {item.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  {retailRollupItems.map((item, index) => (
                    <td
                      className={classNames(
                        "px-5 py-4 text-sm",
                        index === 0 ? "font-semibold text-gray-900" : "text-gray-600"
                      )}
                      key={item.label}
                    >
                      {item.value}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showPlatformColumns && data.summaries.length > 0 ? (
        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              {statementHeading(text.retailerBalances, data.currency)}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {[
                    text.retailer,
                    text.gross,
                    text.margin,
                    text.pending,
                    text.due,
                    text.paid,
                    text.confirmed,
                    text.needsReview,
                    text.outstanding
                  ].map((heading, index) => (
                    <th
                      className={classNames(
                        "px-5 py-3.5 text-left text-sm font-semibold text-gray-900",
                        index === 3 && "border-l border-gray-200"
                      )}
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.summaries.map((summary) => (
                  <tr key={summary.organisationId}>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                      {summary.organisationName}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                      {formatMoneyNumber(summary.grossCustomerAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                      {formatMoneyNumber(summary.mattanutraMarginAmount, locale)}
                    </td>
                    <td className="border-l border-gray-200 px-5 py-4 text-sm text-gray-600">
                      {formatMoneyNumber(summary.pendingAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatMoneyNumber(summary.dueAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatMoneyNumber(summary.paidAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatMoneyNumber(summary.confirmedAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {formatMoneyNumber(summary.needsReviewAmount, locale)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                      {formatMoneyNumber(summary.outstandingAmount, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {statementHeading(text.settlementStatement, data.currency)}
          </h2>
        </div>
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {statementHeadings.map((heading) => (
                    <th
                      className="px-5 py-3.5 text-left text-sm font-semibold text-gray-900"
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <div className="font-semibold text-gray-900">
                        {row.orderNumber}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {row.shippedAt
                          ? `${text.shipped} ${formatGeneratedAt(row.shippedAt, locale)}`
                          : `${text.created} ${formatGeneratedAt(row.createdAt, locale)}`}
                      </div>
                    </td>
                    {showPlatformColumns ? (
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                        {row.organisationName}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <span
                        className={classNames(
                          statusClasses(row.status),
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {settlementStatusText(row.status, locale, showPlatformColumns)}
                      </span>
                    </td>
                    <td className="min-w-56 px-5 py-4 text-sm text-gray-600">
                      <div>{row.customerName ?? text.customerFallback}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        {row.itemCount}{" "}
                        {row.itemCount === 1 ? text.itemSingular : text.itemPlural}
                      </div>
                    </td>
                    {showPlatformColumns ? (
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-gray-900">
                        {formatMoneyNumber(row.grossCustomerAmount, locale)}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-gray-900">
                      {formatMoneyNumber(row.retailerPayableAmount, locale)}
                    </td>
                    {showPlatformColumns ? (
                      <>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                          {formatMoneyNumber(row.mattanutraMarginAmount, locale)}
                        </td>
                      </>
                    ) : null}
                    <td className="min-w-48 px-5 py-4 text-sm text-gray-600">
                      {row.paidAt ? (
                        <>
                          <div>{formatGeneratedAt(row.paidAt, locale)}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            {row.paidReference || row.paidMethod || text.recorded}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-sm">
                      {showPlatformColumns && (row.status === "due" || row.status === "needs_review") ? (
                        <button
                          className="rounded-md bg-[#1FA77A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#168761]"
                          onClick={() => setEditor({ mode: "paid", row })}
                          type="button"
                        >
                          {text.markPaid}
                        </button>
                      ) : !showPlatformColumns && row.status === "paid" ? (
                        <button
                          className="rounded-md bg-[#1FA77A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#168761]"
                          onClick={() => setEditor({ mode: "confirm", row })}
                          type="button"
                        >
                          {text.confirmReceived}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <ReceiptText className="mx-auto size-8 text-gray-300" aria-hidden={true} />
            <p className="mt-3 text-sm font-medium text-gray-400">
              {text.noSettlements}
            </p>
          </div>
        )}
      </section>

      {editor ? (
        <AdminModal onClose={() => setEditor(null)} panelClassName="max-w-lg">
          <form
            action={(formData) => {
              void submitSettlement(formData);
            }}
          >
            <div className="border-b border-gray-100 px-6 py-5 pr-14">
              <h2 className="text-base font-semibold text-gray-900">
                {editor.mode === "paid" ? text.markPaid : text.confirmReceived}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {editor.row.orderNumber} · {formatMoney(editor.row.retailerPayableAmount, editor.row.currency, locale)}
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              {editor.mode === "paid" ? (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    {text.paidAmount}
                    <input
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#1FA77A]"
                      defaultValue={editor.row.retailerPayableAmount}
                      min="0"
                      name="paidAmount"
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    {text.paidAt}
                    <input
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#1FA77A]"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      name="paidAt"
                      type="date"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    {text.paidMethod}
                    <input
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#1FA77A]"
                      name="paidMethod"
                      type="text"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    {text.paidReference}
                    <input
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#1FA77A]"
                      name="paidReference"
                      type="text"
                    />
                  </label>
                </>
              ) : (
                <label className="block text-sm font-medium text-gray-700">
                  {text.receiptReference}
                  <input
                    className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#1FA77A]"
                    name="confirmedReference"
                    type="text"
                  />
                </label>
              )}
              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                disabled={submitting}
                onClick={() => setEditor(null)}
                type="button"
              >
                {labels.supplements.close}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#168761] disabled:cursor-wait disabled:opacity-70"
                disabled={submitting}
                type="submit"
              >
                {submitting
                  ? text.saving
                  : editor.mode === "paid"
                    ? text.markPaid
                    : text.confirmReceived}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}
    </>
  );
}
