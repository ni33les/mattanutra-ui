"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  Field,
  Input,
  Label,
  Select,
  Textarea,
} from "@headlessui/react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
import type { AdminContentInventoryRow } from "@/lib/admin-query-data";
import {
  isLocale,
  localeLabels,
  publicLocales,
  type Locale,
} from "@/lib/i18n";
import type {
  AdminContent,
  ContentEditorForm,
  ContentEditorState,
} from "@/components/admin/dashboard-content";
import { classNames } from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";

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
  return isLocale(value) ? value : "en";
}

function contentEditorForm(
  editor: NonNullable<ContentEditorState>,
): ContentEditorForm {
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
    title: blogPost && row ? row.title : "",
  };
}

export function ContentEditorModal({
  accessToken,
  editor,
  labels,
  onClose,
  onSaved,
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
    contentEditorForm(editor),
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
      ...patch,
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
        title: value,
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
        method: "POST",
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
        imageUrl: uploadedUrl,
      }));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : labels.contentPages.imageUploadError,
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
          authorName: form.authorName,
          contentId: editor.row?.id,
          contentMarkdown: blogPost ? form.contentMarkdown : undefined,
          contentType: form.contentType,
          currentStatus: editor.row?.status,
          excerpt: form.excerpt,
          imageAlt: form.imageAlt,
          imageUrl: form.imageUrl,
          locale: form.locale,
          quote: form.quote,
          slug: form.slug,
          title: form.title,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: editing ? "PATCH" : "POST",
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
          : labels.contentPages.editorError,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-2xl">
      <form onSubmit={submitEditor}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 pr-14">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              {modalTitle}
            </h2>
            <p className="mt-1 text-xs font-medium text-gray-500">
              {editing ? labels.contentPages.edit : labels.contentPages.draft}
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="max-w-40">
            <Field className="min-w-0">
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
                  {publicLocales.map((localeCode) => (
                    <option key={localeCode} value={localeCode}>
                      {localeLabels[localeCode]}
                    </option>
                  ))}
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
                    "mt-2 min-h-80 font-mono text-[13px] leading-6",
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
                    "mt-2 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200",
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
    </AdminModal>
  );
}
