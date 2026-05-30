"use client";

import { useState } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems
} from "@headlessui/react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
import type {
  AdminContentInventoryData,
  AdminContentInventoryRow,
  AdminContentWorkflowStatus
} from "@/lib/admin-query-data";
import {
  isLocale,
  localeLabels,
  type Locale
} from "@/lib/i18n";
import type {
  AdminContent,
  AdminDashboardView,
  ContentEditorState,
  ContentMetricId
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatNumber,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { ContentEditorModal } from "@/components/admin/content-editor-modal";

function contentWorkflowStatusLabel(
  labels: AdminContent,
  status: AdminContentWorkflowStatus
) {
  return labels.contentPages[status];
}

function contentWorkflowStatusClass(status: AdminContentWorkflowStatus) {
  if (status === "published") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (status === "scheduled") {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (status === "deleted") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function contentMatchesMetric(
  row: AdminContentInventoryRow,
  metricId: ContentMetricId
) {
  if (metricId === "contentPublished") {
    return row.workflowStatus === "published";
  }

  if (metricId === "contentScheduled") {
    return row.workflowStatus === "scheduled";
  }

  if (metricId === "contentDraft") {
    return row.workflowStatus === "draft";
  }

  if (metricId === "contentLocaleEn") {
    return row.locale === "en";
  }

  if (metricId === "contentLocaleTh") {
    return row.locale === "th";
  }

  if (metricId === "contentLocaleZh") {
    return row.locale === "zh-CN";
  }

  if (metricId === "contentDeleted") {
    return row.workflowStatus === "deleted";
  }

  if (metricId === "contentBlogPosts") {
    return row.contentType === "blog_post";
  }

  if (metricId === "contentTestimonials") {
    return row.contentType === "testimonial";
  }

  if (metricId === "contentPageViews") {
    return row.pageViews > 0;
  }

  return true;
}

function contentTypeLabel(
  labels: AdminContent,
  type: AdminContentInventoryRow["contentType"]
) {
  return type === "blog_post"
    ? labels.contentPages.blogPosts
    : labels.contentPages.testimonials;
}

function formatLocalePillLabel(locale: string) {
  return isLocale(locale) ? localeLabels[locale] : locale.trim().toUpperCase();
}

function contentTranslationLocales(row: AdminContentInventoryRow) {
  return Array.from(
    new Set([row.locale, ...(row.translationLocales ?? [])].filter(Boolean))
  ).sort((left, right) => {
    if (left === row.locale) {
      return -1;
    }

    if (right === row.locale) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function mergeTranslationLocales(
  row: AdminContentInventoryRow,
  existing?: AdminContentInventoryRow
) {
  return Array.from(
    new Set([
      row.locale,
      ...(row.translationLocales ?? []),
      ...(existing?.translationLocales ?? [])
    ].filter(Boolean))
  ).sort((left, right) => {
    if (left === row.locale) {
      return -1;
    }

    if (right === row.locale) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function localDateTimeInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultContentScheduleValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);

  return localDateTimeInputValue(date);
}

export function contentTypeForView(
  view: AdminDashboardView
): AdminContentInventoryRow["contentType"] | null {
  if (view === "blogs") {
    return "blog_post";
  }

  if (view === "testimonials") {
    return "testimonial";
  }

  return null;
}

function contentHref(row: AdminContentInventoryRow, accessToken: string) {
  const locale =
    row.locale === "th" ? "th" : row.locale === "zh-CN" ? "zh-CN" : "en";

  if (
    row.contentType === "blog_post" &&
    row.slug &&
    row.status === "published" &&
    row.workflowStatus === "published"
  ) {
    return `/${locale}/blog/${encodeURIComponent(row.slug)}`;
  }

  const params = new URLSearchParams({
    status: row.workflowStatus,
    type: row.contentType
  });

  if (accessToken) {
    params.set("access_token", accessToken);
  }

  return `/${locale}/admin/content/preview/${encodeURIComponent(row.id)}?${params.toString()}`;
}

export function AdminContentView({
  accessToken,
  contentTypeFilter,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  contentTypeFilter?: AdminContentInventoryRow["contentType"] | null;
  data: AdminContentInventoryData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createdRows, setCreatedRows] = useState<AdminContentInventoryRow[]>([]);
  const [editorState, setEditorState] = useState<ContentEditorState>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [rowOverrides, setRowOverrides] = useState<
    Record<string, Partial<AdminContentInventoryRow>>
  >({});
  const [scheduleValues, setScheduleValues] = useState<Record<string, string>>({});
  const [selectedMetricId, setSelectedMetricId] =
    useState<ContentMetricId>("contentTotal");
  const rows = [...createdRows, ...data.rows]
    .map((row) => ({
      ...row,
      ...(rowOverrides[row.id] ?? {})
    }))
    .filter(
      (row) => !contentTypeFilter || row.contentType === contentTypeFilter
    );

  const summary = rows.reduce(
    (counts, row) => {
      counts.total += 1;
      counts.pageViews += row.pageViews;

      if (row.contentType === "blog_post") {
        counts.blogPosts += 1;
      } else {
        counts.testimonials += 1;
      }

      if (row.locale === "en") {
        counts.en += 1;
      }

      if (row.locale === "th") {
        counts.th += 1;
      }

      if (row.locale === "zh-CN") {
        counts.zh += 1;
      }

      counts[row.workflowStatus] += 1;

      return counts;
    },
    {
      blogPosts: 0,
      deleted: 0,
      draft: 0,
      en: 0,
      pageViews: 0,
      published: 0,
      scheduled: 0,
      testimonials: 0,
      th: 0,
      total: 0,
      zh: 0
    }
  );
  const filteredRows = rows.filter((row) =>
    contentMatchesMetric(row, selectedMetricId)
  );
  const contentMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "contentTotal",
      label: labels.contentPages.total,
      series: [],
      value: formatNumber(summary.total, locale)
    },
    {
      color: businessMetricColors.total,
      id: "contentLocaleTh",
      label: labels.contentPages.th,
      series: [],
      value: formatNumber(summary.th, locale)
    },
    {
      color: businessMetricColors.total,
      id: "contentLocaleEn",
      label: labels.contentPages.en,
      series: [],
      value: formatNumber(summary.en, locale)
    },
    {
      color: businessMetricColors.total,
      id: "contentLocaleZh",
      label: labels.contentPages.zh,
      series: [],
      value: formatNumber(summary.zh, locale)
    },
    {
      color: businessMetricColors.contentPublished,
      id: "contentPublished",
      label: labels.contentPages.published,
      series: [],
      value: formatNumber(summary.published, locale)
    },
    {
      color: businessMetricColors.contentScheduled,
      id: "contentScheduled",
      label: labels.contentPages.scheduled,
      series: [],
      value: formatNumber(summary.scheduled, locale)
    },
    {
      color: businessMetricColors.pageViews,
      id: "contentPageViews",
      label: labels.contentPages.pageViews,
      series: [],
      value: formatNumber(summary.pageViews, locale)
    },
    ...(!contentTypeFilter
      ? [
          {
            color: businessMetricColors.landingVisitors,
            id: "contentBlogPosts",
            label: labels.contentPages.blogPosts,
            series: [],
            value: formatNumber(summary.blogPosts, locale)
          },
          {
            color: businessMetricColors.healthScoreViews,
            id: "contentTestimonials",
            label: labels.contentPages.testimonials,
            series: [],
            value: formatNumber(summary.testimonials, locale)
          }
        ]
      : []),
    {
      color: businessMetricColors.contentDraft,
      id: "contentDraft",
      label: labels.contentPages.draft,
      series: [],
      value: formatNumber(summary.draft, locale)
    },
    {
      color: businessMetricColors.contentDeleted,
      id: "contentDeleted",
      label: labels.contentPages.deleted,
      series: [],
      value: formatNumber(summary.deleted, locale)
    }
  ];

  async function runWorkflow(
    row: AdminContentInventoryRow,
    targetStatus: AdminContentWorkflowStatus
  ) {
    const scheduleValue =
      scheduleValues[row.id] ??
      (row.scheduledFor
        ? localDateTimeInputValue(new Date(row.scheduledFor))
        : defaultContentScheduleValue());
    const publishAt =
      targetStatus === "scheduled" ? new Date(scheduleValue) : null;

    if (
      targetStatus === "scheduled" &&
      (!publishAt || Number.isNaN(publishAt.getTime()) || publishAt <= new Date())
    ) {
      setErrorId(row.id);
      return;
    }

    setBusyId(row.id);
    setErrorId(null);

    try {
      const response = await fetch("/api/admin/content/workflow", {
        body: JSON.stringify({
          accessToken,
          contentId: row.id,
          contentType: row.contentType,
          publishAt: publishAt?.toISOString() ?? null,
          targetStatus
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        task?: { id?: string };
      };

      if (!response.ok) {
        throw new Error("Unable to update content workflow");
      }

      setRowOverrides((current) => ({
        ...current,
        [row.id]: {
          pendingTaskId: result.task?.id ?? row.pendingTaskId,
          publishedAt:
            targetStatus === "published"
              ? new Date().toISOString()
              : targetStatus === "draft" || targetStatus === "deleted"
                ? null
                : row.publishedAt,
          scheduledFor:
            targetStatus === "scheduled" ? publishAt?.toISOString() ?? null : null,
          status:
            targetStatus === "deleted"
              ? "archived"
              : targetStatus === "published"
                ? "published"
                : "draft",
          updatedAt: new Date().toISOString(),
          workflowStatus: targetStatus
        }
      }));
    } catch {
      setErrorId(row.id);
    } finally {
      setBusyId(null);
    }
  }

  function saveContentRow(row: AdminContentInventoryRow) {
    const existingRow = rows.find((item) => item.id === row.id);
    const normalizedRow = {
      ...row,
      translationLocales: mergeTranslationLocales(row, existingRow)
    };
    const rowInServerData = data.rows.some((item) => item.id === row.id);

    setCreatedRows((current) => {
      if (current.some((item) => item.id === row.id)) {
        return current.map((item) =>
          item.id === row.id ? normalizedRow : item
        );
      }

      return rowInServerData ? current : [normalizedRow, ...current];
    });
    setRowOverrides((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] ?? {}),
        ...normalizedRow
      }
    }));
    setEditorState(null);
  }

  return (
    <section className="mt-8">
      <BusinessStatsGrid
        metrics={contentMetrics}
        onMetricSelect={(metricId) => setSelectedMetricId(metricId as ContentMetricId)}
        selectedMetricId={selectedMetricId}
      />

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {contentTypeFilter !== "testimonial" ? (
          <button
            aria-label={labels.contentPages.newBlogPost}
            className="inline-flex size-9 items-center justify-center rounded-md bg-[#126B4F] text-lg font-semibold text-white shadow-sm hover:bg-[#0F5A43] focus:outline-2 focus:outline-offset-2 focus:outline-[#1FA77A]"
            onClick={() => setEditorState({ contentType: "blog_post" })}
            type="button"
          >
            +
          </button>
        ) : null}
        {contentTypeFilter !== "blog_post" ? (
          <button
            aria-label={labels.contentPages.newTestimonial}
            className="inline-flex size-9 items-center justify-center rounded-md bg-white text-lg font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-[#1FA77A]"
            onClick={() => setEditorState({ contentType: "testimonial" })}
            type="button"
          >
            +
          </button>
        ) : null}
      </div>

      {filteredRows.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => (
            <ContentCard
              accessToken={accessToken}
              busy={busyId === row.id}
              error={errorId === row.id}
              key={row.id}
              labels={labels}
              locale={locale}
              onScheduleChange={(value) =>
                setScheduleValues((current) => ({
                  ...current,
                  [row.id]: value
                }))
              }
              onEdit={(selectedRow) =>
                setEditorState({
                  contentType: selectedRow.contentType,
                  row: selectedRow
                })
              }
              onWorkflow={runWorkflow}
              row={row}
              scheduleValue={
                scheduleValues[row.id] ??
                (row.scheduledFor
                  ? localDateTimeInputValue(new Date(row.scheduledFor))
                  : defaultContentScheduleValue())
              }
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.contentPages.empty}
        </div>
      )}

      {editorState ? (
        <ContentEditorModal
          accessToken={accessToken}
          editor={editorState}
          key={`${editorState.contentType}:${editorState.row?.id ?? "new"}`}
          labels={labels}
          onClose={() => setEditorState(null)}
          onSaved={saveContentRow}
        />
      ) : null}
    </section>
  );
}

function ContentThumbnail({ row }: Readonly<{ row: AdminContentInventoryRow }>) {
  const fallbackInitials = row.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={classNames(
        "flex size-20 shrink-0 items-center justify-center overflow-hidden bg-gray-50 text-sm font-semibold text-gray-500 ring-1 ring-gray-200 sm:size-24",
        row.contentType === "testimonial" ? "rounded-full" : "rounded-lg"
      )}
    >
      {row.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Admin previews accept arbitrary image URLs.
        <img
          alt={row.imageAlt ?? row.title}
          className="size-full object-cover"
          src={row.imageUrl}
        />
      ) : row.contentType === "testimonial" && fallbackInitials ? (
        <span aria-hidden="true">{fallbackInitials}</span>
      ) : (
        <PhotoIcon aria-hidden="true" className="size-7 text-gray-400" />
      )}
    </div>
  );
}

function contentWorkflowMenuItemClass(tone: "default" | "danger" = "default") {
  return classNames(
    "block w-full px-4 py-2 text-left text-sm data-focus:outline-hidden",
    tone === "danger"
      ? "text-red-700 data-focus:bg-red-50 data-focus:text-red-800"
      : "text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900"
  );
}

function ContentCard({
  accessToken,
  busy,
  error,
  labels,
  locale,
  onEdit,
  onScheduleChange,
  onWorkflow,
  row,
  scheduleValue
}: Readonly<{
  accessToken: string;
  busy: boolean;
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onEdit: (row: AdminContentInventoryRow) => void;
  onScheduleChange: (value: string) => void;
  onWorkflow: (
    row: AdminContentInventoryRow,
    targetStatus: AdminContentWorkflowStatus
  ) => void;
  row: AdminContentInventoryRow;
  scheduleValue: string;
}>) {
  const href = contentHref(row, accessToken);
  const draftMode = row.workflowStatus === "draft";
  const showMoveToDraft = row.workflowStatus !== "draft";
  const showPublish =
    row.workflowStatus !== "published" && row.workflowStatus !== "deleted";
  const showSchedule = draftMode;
  const scheduledPublishDate =
    row.workflowStatus === "scheduled" && row.scheduledFor
      ? formatGeneratedAt(row.scheduledFor, locale)
      : null;

  return (
    <article className="flex h-full flex-col rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md">
      <div className="flex gap-4">
        <ContentThumbnail row={row} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <a
                className="block text-[#20343A] hover:text-[#126B4F]"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                <span className="line-clamp-2 text-base font-semibold">
                  {row.title}
                </span>
              </a>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    contentWorkflowStatusClass(row.workflowStatus),
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {contentWorkflowStatusLabel(labels, row.workflowStatus)}
                </span>
                <span className="inline-flex rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                  {contentTypeLabel(labels, row.contentType)}
                </span>
                {contentTranslationLocales(row).map((translationLocale) => (
                  <span
                    className={classNames(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                      translationLocale === row.locale
                        ? "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]"
                        : "bg-gray-50 text-gray-700 ring-gray-200"
                    )}
                    key={translationLocale}
                  >
                    {formatLocalePillLabel(translationLocale)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-3 text-left sm:text-right">
              <div>
                <div className="text-xl font-semibold tabular-nums text-gray-900">
                  {formatNumber(row.pageViews, locale)}
                </div>
                <div className="text-xs font-medium text-gray-500">
                  {labels.contentPages.views}
                </div>
              </div>
            </div>
          </div>

          {row.summary ? (
            <p className="mt-4 line-clamp-3 text-sm text-gray-600">
              {row.summary}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Menu as="div" className="relative inline-block text-left">
              <MenuButton
                className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-2 focus:outline-offset-2 focus:outline-[#1FA77A]"
                disabled={busy}
              >
                {contentWorkflowStatusLabel(labels, row.workflowStatus)}
                <ChevronDownSolidIcon
                  aria-hidden="true"
                  className="-mr-1 size-4 text-gray-400"
                />
              </MenuButton>
              <MenuItems
                className="absolute left-0 z-20 mt-2 w-44 origin-top-left rounded-md bg-white py-1 shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                transition
              >
                {showMoveToDraft ? (
                  <MenuItem>
                    <button
                      className={contentWorkflowMenuItemClass()}
                      onClick={() => onWorkflow(row, "draft")}
                      type="button"
                    >
                      {labels.contentPages.draftAction}
                    </button>
                  </MenuItem>
                ) : null}
                {showPublish ? (
                  <MenuItem>
                    <button
                      className={contentWorkflowMenuItemClass()}
                      onClick={() => onWorkflow(row, "published")}
                      type="button"
                    >
                      {labels.contentPages.publishAction}
                    </button>
                  </MenuItem>
                ) : null}
                {showSchedule ? (
                  <MenuItem>
                    <button
                      className={contentWorkflowMenuItemClass()}
                      onClick={() => onWorkflow(row, "scheduled")}
                      type="button"
                    >
                      {labels.contentPages.scheduleAction}
                    </button>
                  </MenuItem>
                ) : null}
              </MenuItems>
            </Menu>

            {scheduledPublishDate ? (
              <span className="text-sm font-medium text-gray-500">
                {scheduledPublishDate}
              </span>
            ) : null}

            {showSchedule ? (
              <input
                aria-label={labels.contentPages.scheduledFor}
                className="min-w-0 rounded-md bg-white px-3 py-2 text-xs text-gray-900 shadow-sm ring-1 ring-inset ring-blue-200 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
                onChange={(event) => onScheduleChange(event.target.value)}
                type="datetime-local"
                value={scheduleValue}
              />
            ) : null}

            {draftMode ? (
              <button
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-2 focus:outline-offset-2 focus:outline-[#1FA77A]"
                disabled={busy}
                onClick={() => onEdit(row)}
                type="button"
              >
                {labels.contentPages.edit}
              </button>
            ) : null}
          </div>

          {draftMode ? (
            <button
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-2 focus:outline-offset-2 focus:outline-red-300"
              disabled={busy}
              onClick={() => onWorkflow(row, "deleted")}
              type="button"
            >
              {labels.contentPages.deleteAction}
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="mt-2 text-xs font-medium text-red-600">
            {row.workflowStatus === "scheduled"
              ? labels.contentPages.scheduleError
              : labels.contentPages.updateError}
          </p>
        ) : null}
      </div>
    </article>
  );
}
