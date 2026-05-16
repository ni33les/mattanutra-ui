"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Field,
  Input,
  Label,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Select,
  Textarea
} from "@headlessui/react";
import { PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
import type {
  AdminContentInventoryData,
  AdminContentInventoryRow,
  AdminContentWorkflowStatus
} from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";
import type {
  AdminContent,
  AdminDashboardView,
  ContentEditorForm,
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

function contentTypeLabel(type: AdminContentInventoryRow["contentType"]) {
  return type === "blog_post" ? "Blog post" : "Testimonial";
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
  const locale = row.locale === "th" ? "th" : "en";

  if (
    row.contentType === "blog_post" &&
    row.slug &&
    row.status === "published" &&
    row.workflowStatus === "published"
  ) {
    return `/${locale}/blog/${encodeURIComponent(row.slug)}`;
  }

  const params = new URLSearchParams({
    access_token: accessToken,
    status: row.workflowStatus,
    type: row.contentType
  });

  return `/${locale}/admin/content/preview/${encodeURIComponent(row.id)}?${params.toString()}`;
}

function slugFromTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function imageAltFromFileName(value: string) {
  const stem = value.replace(/\.[^/.]+$/, "");
  const text = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  return text ? text.slice(0, 120) : "";
}

function formLocale(value?: string | null): Locale {
  return value === "th" ? "th" : "en";
}

function contentEditorForm(editor: NonNullable<ContentEditorState>): ContentEditorForm {
  const row = editor.row;
  const blogPost = editor.contentType === "blog_post";

  return {
    authorName: !blogPost && row ? row.title : "",
    contentMarkdown: blogPost && row?.contentMarkdown ? row.contentMarkdown : "",
    contentType: editor.contentType,
    excerpt: blogPost && row?.summary ? row.summary : "",
    imageAlt: row?.imageAlt ?? "",
    imageUrl: row?.imageUrl ?? "",
    locale: formLocale(row?.locale),
    quote: !blogPost && row?.summary ? row.summary : "",
    slug: blogPost && row?.slug ? row.slug : "",
    title: blogPost && row ? row.title : ""
  };
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
      total: 0
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
    const rowInServerData = data.rows.some((item) => item.id === row.id);

    setCreatedRows((current) => {
      if (current.some((item) => item.id === row.id)) {
        return current.map((item) => (item.id === row.id ? row : item));
      }

      return rowInServerData ? current : [row, ...current];
    });
    setRowOverrides((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] ?? {}),
        ...row
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
                  {contentTypeLabel(row.contentType)}
                </span>
                <span className="inline-flex rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                  {row.locale.toUpperCase()}
                </span>
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

function ContentEditorModal({
  accessToken,
  editor,
  labels,
  onClose,
  onSaved
}: Readonly<{
  accessToken: string;
  editor: NonNullable<ContentEditorState>;
  labels: AdminContent;
  onClose: () => void;
  onSaved: (row: AdminContentInventoryRow) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [form, setForm] = useState<ContentEditorForm>(() =>
    contentEditorForm(editor)
  );
  const editing = Boolean(editor.row);
  const blogPost = form.contentType === "blog_post";
  const inputClass =
    "block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-900";
  const modalTitle = blogPost
    ? editing
      ? labels.contentPages.blogPosts
      : labels.contentPages.newBlogPost
    : editing
      ? labels.contentPages.testimonials
      : labels.contentPages.newTestimonial;

  function updateForm(patch: Partial<ContentEditorForm>) {
    setForm((current) => ({
      ...current,
      ...patch
    }));
  }

  function updateTitle(value: string) {
    setForm((current) => {
      const currentSlug = slugFromTitle(current.title);
      const nextSlug =
        !editing && (!current.slug || current.slug === currentSlug)
          ? slugFromTitle(value)
          : current.slug;

      return {
        ...current,
        slug: nextSlug,
        title: value
      };
    });
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadingImage(true);
    setError(null);

    try {
      const uploadBody = new FormData();
      uploadBody.set("accessToken", accessToken);
      uploadBody.set("file", file);

      const response = await fetch("/api/admin/content/uploads", {
        body: uploadBody,
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        url?: string;
      };

      if (!response.ok || !result.url) {
        throw new Error(result.message ?? labels.contentPages.imageUploadError);
      }

      const uploadedUrl = result.url;

      setForm((current) => ({
        ...current,
        imageAlt: current.imageAlt || imageAltFromFileName(file.name),
        imageUrl: uploadedUrl
      }));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : labels.contentPages.imageUploadError
      );
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      (blogPost &&
        (!form.title.trim() || !form.slug.trim() || !form.excerpt.trim())) ||
      (!blogPost && (!form.authorName.trim() || !form.quote.trim()))
    ) {
      setError(labels.contentPages.editorRequiredError);
      return;
    }

    if (form.imageUrl.trim() && !form.imageAlt.trim()) {
      setError(labels.contentPages.imageAltRequired);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/content/editor", {
        body: JSON.stringify({
          accessToken,
          contentMarkdown: blogPost ? form.contentMarkdown : undefined,
          contentId: editor.row?.id,
          contentType: form.contentType,
          currentStatus: editor.row?.status,
          excerpt: form.excerpt,
          imageAlt: form.imageAlt,
          imageUrl: form.imageUrl,
          locale: form.locale,
          quote: form.quote,
          slug: form.slug,
          title: form.title,
          authorName: form.authorName
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: editing ? "PATCH" : "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        content?: AdminContentInventoryRow;
        message?: string;
      };

      if (!response.ok || !result.content) {
        throw new Error(result.message ?? labels.contentPages.editorError);
      }

      onSaved(result.content);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : labels.contentPages.editorError
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="relative z-50" onClose={onClose} open>
      <DialogBackdrop
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        transition
      />

      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-left sm:items-center sm:p-0">
          <DialogPanel
            className="relative w-full transform overflow-hidden rounded-lg bg-white shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:max-w-2xl data-closed:sm:translate-y-0 data-closed:sm:scale-95"
            transition
          >
        <form onSubmit={submitEditor}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-gray-900">
                {modalTitle}
              </DialogTitle>
              <p className="mt-1 text-xs font-medium text-gray-500">
                {editing ? labels.contentPages.edit : labels.contentPages.draft}
              </p>
            </div>
            <button
              aria-label={labels.contentPages.cancel}
              className="inline-flex size-9 items-center justify-center rounded-md bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 focus:outline-2 focus:outline-offset-2 focus:outline-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
              <Field>
                <Label className={labelClass}>
                  {labels.contentPages.locale}
                </Label>
                <div className="relative mt-2">
                  <Select
                    className={classNames(inputClass, "appearance-none pr-9")}
                    id="content-locale"
                    onChange={(event) =>
                      updateForm({ locale: formLocale(event.target.value) })
                    }
                    value={form.locale}
                  >
                    <option value="en">EN</option>
                    <option value="th">TH</option>
                  </Select>
                  <ChevronDownSolidIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
                  />
                </div>
              </Field>
            </div>

            {blogPost ? (
              <>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.title}
                  </Label>
                  <Input
                    className={classNames(inputClass, "mt-2")}
                    id="content-title"
                    onChange={(event) => updateTitle(event.target.value)}
                    type="text"
                    value={form.title}
                  />
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.slug}
                  </Label>
                  <Input
                    className={classNames(inputClass, "mt-2")}
                    id="content-slug"
                    onChange={(event) =>
                      updateForm({ slug: slugFromTitle(event.target.value) })
                    }
                    type="text"
                    value={form.slug}
                  />
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.excerpt}
                  </Label>
                  <Textarea
                    className={classNames(inputClass, "mt-2 min-h-28")}
                    id="content-excerpt"
                    onChange={(event) =>
                      updateForm({ excerpt: event.target.value })
                    }
                    value={form.excerpt}
                  />
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.contentMarkdown}
                  </Label>
                  <Textarea
                    className={classNames(
                      inputClass,
                      "mt-2 min-h-80 font-mono text-[13px] leading-6"
                    )}
                    id="content-markdown"
                    onChange={(event) =>
                      updateForm({ contentMarkdown: event.target.value })
                    }
                    value={form.contentMarkdown}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.authorName}
                  </Label>
                  <Input
                    className={classNames(inputClass, "mt-2")}
                    id="content-author"
                    onChange={(event) =>
                      updateForm({ authorName: event.target.value })
                    }
                    type="text"
                    value={form.authorName}
                  />
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.quote}
                  </Label>
                  <Textarea
                    className={classNames(inputClass, "mt-2 min-h-32")}
                    id="content-quote"
                    onChange={(event) => updateForm({ quote: event.target.value })}
                    value={form.quote}
                  />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[6rem_1fr]">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-gray-50 outline-1 -outline-offset-1 outline-gray-200">
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Admin previews accept arbitrary image URLs.
                  <img
                    alt={form.imageAlt || labels.contentPages.imagePreview}
                    className="size-full object-cover"
                    src={form.imageUrl}
                  />
                ) : (
                  <PhotoIcon aria-hidden="true" className="size-7 text-gray-400" />
                )}
              </div>
              <div className="space-y-4">
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.imageUrl}
                  </Label>
                  <Input
                    className={classNames(inputClass, "mt-2")}
                    id="content-image-url"
                    onChange={(event) =>
                      updateForm({ imageUrl: event.target.value })
                    }
                    type="text"
                    value={form.imageUrl}
                  />
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.imageUpload}
                  </Label>
                  <Input
                    accept="image/gif,image/jpeg,image/png,image/webp"
                    className={classNames(
                      inputClass,
                      "mt-2 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
                    )}
                    disabled={busy || uploadingImage}
                    id="content-image-upload"
                    onChange={uploadImage}
                    type="file"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {uploadingImage
                      ? labels.contentPages.uploadingImage
                      : labels.contentPages.imageUploadHint}
                  </p>
                </Field>
                <Field>
                  <Label className={labelClass}>
                    {labels.contentPages.imageAlt}
                  </Label>
                  <Input
                    className={classNames(inputClass, "mt-2")}
                    id="content-image-alt"
                    onChange={(event) =>
                      updateForm({ imageAlt: event.target.value })
                    }
                    type="text"
                    value={form.imageAlt}
                  />
                </Field>
              </div>
            </div>

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 bg-gray-50 px-5 py-4">
            <button
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              data-autofocus
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              {labels.contentPages.cancel}
            </button>
            <button
              className="rounded-md bg-[#126B4F] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0F5A43] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || uploadingImage}
              type="submit"
            >
              {busy ? labels.contentPages.saving : labels.contentPages.save}
            </button>
          </div>
        </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
