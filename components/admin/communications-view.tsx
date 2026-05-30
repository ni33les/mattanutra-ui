"use client";

import { useState } from "react";
import type {
  AdminCommunicationRow,
  AdminCommunicationsData,
  AdminCommunicationStatus
} from "@/lib/admin-communications";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/safety-views";

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

export function AdminCommunicationsView({
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
          {labels.visibility.liveUpdated} · {labels.contentPages.updated}{" "}
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
                        {labels.communications.retryError}
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
