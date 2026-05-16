"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { AdminLeadEventRow, AdminLeadRow, AdminLeadsData } from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { SupplementListMeta } from "@/components/admin/safety-views";
import {
  BusinessStatsGrid,
  PlanIdLink,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatNumber,
  optionalLabel,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

function leadStageClass(stage: string) {
  if (stage === "precision" || stage === "pro") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (stage === "free_sent" || stage === "free_requested") {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (stage === "healthscore" || stage === "assessment_completed") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function leadDisplayName(row: AdminLeadRow) {
  if (row.emailHash) {
    return `Email ${compactId(row.emailHash)}`;
  }

  if (row.planId) {
    return `Plan ${compactId(row.planId)}`;
  }

  if (row.ray) {
    return `Ray ${compactId(row.ray)}`;
  }

  return compactId(row.subject);
}

function leadGroupLabel(labels: AdminContent, row: AdminLeadRow) {
  if (row.subject === row.ray) {
    return labels.marketingPages.ray;
  }

  if (row.subject === row.planId) {
    return labels.marketingPages.plan;
  }

  if (row.subject === row.emailHash) {
    return labels.marketingPages.emailHash;
  }

  return labels.marketingPages.lead;
}

function leadEventContext(labels: AdminContent, event: AdminLeadEventRow) {
  return [
    event.path ?? event.route,
    [event.source, event.campaign].filter(Boolean).join(" / "),
    event.planId
      ? `${labels.marketingPages.plan} ${compactId(event.planId)}`
      : null
  ].filter(Boolean);
}

export function AdminLeadsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminLeadsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [selectedLead, setSelectedLead] = useState<AdminLeadRow | null>(null);
  const pendingReviews = data.rows.reduce(
    (total, row) => total + row.pendingReviews,
    0
  );
  const communicationIssues = data.rows.reduce(
    (total, row) => total + row.communicationIssues,
    0
  );
  const freeLeads = data.rows.filter((row) =>
    row.currentStage.startsWith("free")
  ).length;
  const precisionLeads = data.rows.filter(
    (row) => row.currentStage === "precision"
  ).length;
  const proLeads = data.rows.filter((row) => row.currentStage === "pro").length;
  const leadMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "leadsTotal",
      label: labels.marketingPages.totalLeads,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.pendingReviews,
      id: "leadsPendingReviews",
      label: labels.marketingPages.pendingReviews,
      series: [],
      value: formatNumber(pendingReviews, locale)
    },
    {
      color: businessMetricColors.communicationIssues,
      id: "leadsCommunicationIssues",
      label: labels.marketingPages.communicationIssues,
      series: [],
      value: formatNumber(communicationIssues, locale)
    },
    {
      color: businessMetricColors.converted,
      id: "leadsPlanStages",
      label: `${labels.marketingPages.freeRequests} / ${labels.marketingPages.precisionConversions} / ${labels.marketingPages.proConversions}`,
      series: [],
      value: `${formatNumber(freeLeads, locale)} / ${formatNumber(precisionLeads, locale)} / ${formatNumber(proLeads, locale)}`
    }
  ];

  return (
    <section className="mt-8">
      <BusinessStatsGrid metrics={leadMetrics} />

      <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  labels.marketingPages.lead,
                  labels.marketingPages.currentStage,
                  labels.marketingPages.source,
                  labels.marketingPages.plan,
                  labels.marketingPages.pendingReviews,
                  labels.marketingPages.communicationIssues,
                  labels.marketingPages.lastEvent,
                  labels.marketingPages.lastSeen
                ].map((heading) => (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                    key={heading}
                    scope="col"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.rows.length > 0 ? (
                data.rows.map((row) => (
                  <LeadRow
                    key={row.subject}
                    locale={locale}
                    onSelect={() => setSelectedLead(row)}
                    row={row}
                  />
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-sm font-medium text-gray-500"
                    colSpan={8}
                  >
                    {labels.marketingPages.emptyLeads}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLead ? (
        <LeadDetailsModal
          labels={labels}
          locale={locale}
          onClose={() => setSelectedLead(null)}
          row={selectedLead}
        />
      ) : null}
    </section>
  );
}

function LeadRow({
  locale,
  onSelect,
  row
}: Readonly<{
  locale: Locale;
  onSelect: () => void;
  row: AdminLeadRow;
}>) {
  const leadName = leadDisplayName(row);

  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 focus-within:bg-gray-50"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <td className="px-4 py-4 text-sm">
        <div className="font-semibold text-gray-900">{leadName}</div>
        <div className="mt-1 text-xs font-medium text-gray-400">
          {formatGeneratedAt(row.firstSeenAt, locale)}
        </div>
      </td>
      <td className="px-4 py-4 text-sm">
        <span
          className={classNames(
            leadStageClass(row.currentStage),
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {readableToken(row.currentStage)}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        <div>{optionalLabel(row.source)}</div>
        <div className="mt-1 text-xs text-gray-400">{optionalLabel(row.campaign)}</div>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        <PlanIdLink
          compact={true}
          locale={locale}
          planId={row.planId}
          stopPropagation={true}
        />
        <div className="mt-1 text-xs text-gray-400">
          {row.selectedPlan ? readableToken(row.selectedPlan) : optionalLabel(row.locale)}
        </div>
      </td>
      <td className="px-4 py-4 text-sm font-medium text-gray-900">
        {formatNumber(row.pendingReviews, locale)}
      </td>
      <td className="px-4 py-4 text-sm font-medium text-gray-900">
        {formatNumber(row.communicationIssues, locale)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{readableToken(row.lastEvent)}</td>
      <td className="px-4 py-4 text-sm text-gray-500">
        {formatGeneratedAt(row.lastSeenAt, locale)}
      </td>
    </tr>
  );
}

function LeadDetailsModal({
  labels,
  locale,
  onClose,
  row
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  row: AdminLeadRow;
}>) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.supplements.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {labels.marketingPages.interactionThread}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">
                {leadDisplayName(row)}
              </h2>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SupplementListMeta
                label={labels.marketingPages.groupedBy}
                value={leadGroupLabel(labels, row)}
              />
              <SupplementListMeta
                label={labels.marketingPages.currentStage}
                value={readableToken(row.currentStage)}
              />
              <SupplementListMeta
                label={labels.marketingPages.firstSeen}
                value={formatGeneratedAt(row.firstSeenAt, locale)}
              />
              <SupplementListMeta
                label={labels.marketingPages.lastSeen}
                value={formatGeneratedAt(row.lastSeenAt, locale)}
              />
              <SupplementListMeta
                label={labels.marketingPages.ray}
                value={row.ray}
              />
              <SupplementListMeta
                label={labels.marketingPages.emailHash}
                value={row.emailHash}
              />
              <SupplementListMeta
                label={labels.marketingPages.plan}
                value={<PlanIdLink locale={locale} planId={row.planId} />}
              />
              <SupplementListMeta
                label={labels.marketingPages.source}
                value={[row.source, row.campaign].filter(Boolean).join(" / ")}
              />
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {labels.marketingPages.events}
              </p>
              {row.events.length > 0 ? (
                <div className="space-y-3">
                  {row.events.map((event) => {
                    const context = leadEventContext(labels, event);

                    return (
                      <article
                        className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100"
                        key={event.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                              {readableToken(event.eventType)} ·{" "}
                              {readableToken(event.eventStatus)} ·{" "}
                              {readableToken(event.actorType)}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {readableToken(event.eventName)}
                            </p>
                            {context.length > 0 ? (
                              <p className="mt-1 text-xs text-gray-500">
                                {context.join(" · ")}
                              </p>
                            ) : null}
                            {event.errorMessage ? (
                              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-100">
                                {event.errorMessage}
                              </p>
                            ) : null}
                          </div>
                          <p className="shrink-0 text-xs font-medium text-gray-500">
                            {formatGeneratedAt(event.occurredAt, locale)}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-sm font-medium text-gray-500 ring-1 ring-gray-100">
                  {labels.marketingPages.noLeadEvents}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


