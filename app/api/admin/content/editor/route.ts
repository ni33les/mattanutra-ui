import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import type { AdminContentInventoryRow } from "@/lib/admin-query-data";
import {
  createBlogPost,
  createTestimonial,
  updateBlogPost,
  updateTestimonial,
  type BlogPost,
  type BlogStatus,
  type BlogTestimonial
} from "@/lib/blog";
import { getSql } from "@/lib/db";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";

type ContentType = "blog_post" | "testimonial";

const noStoreHeaders = {
  "Cache-Control": "no-store"
} as const;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOrNull(value: unknown, limit = 4000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, limit) : null;
}

function contentType(value: unknown): ContentType | null {
  return value === "blog_post" || value === "testimonial" ? value : null;
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

function statusValue(value: unknown, fallback: BlogStatus = "draft"): BlogStatus {
  return value === "archived" ||
    value === "deleted" ||
    value === "draft" ||
    value === "published" ||
    value === "review"
    ? value === "deleted"
      ? "archived"
      : value
    : fallback;
}

function workflowStatus(status: BlogStatus): AdminContentInventoryRow["workflowStatus"] {
  if (status === "archived") {
    return "deleted";
  }

  return status === "published" ? "published" : "draft";
}

function unauthorized() {
  return NextResponse.json(
    { message: "Not found" },
    {
      headers: noStoreHeaders,
      status: 404
    }
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    {
      headers: noStoreHeaders,
      status: 400
    }
  );
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    message: error.message,
    name: error.name
  };
}

async function contentEditableAsDraft(contentType: ContentType, contentId: string) {
  const sql = getSql();

  if (!sql) {
    return false;
  }

  const statusRows =
    contentType === "blog_post"
      ? await sql<Array<{ status: string | null }>>`
          select status
          from public.blog_posts
          where id::text = ${contentId}
          limit 1
        `
      : await sql<Array<{ status: string | null }>>`
          select status
          from public.testimonials
          where id::text = ${contentId}
          limit 1
        `;
  const storageStatus = statusRows[0]?.status;

  if (storageStatus !== "draft") {
    return false;
  }

  const scheduledRows = await sql<Array<{ exists: boolean }>>`
    select exists(
      select 1
      from public.tasks
      where task_type = 'content_status_change'
        and payload ->> 'contentId' = ${contentId}
        and payload ->> 'contentType' = ${contentType}
        and payload ->> 'targetStatus' = 'published'
        and scheduled_for > now()
        and status not in ('completed', 'failed', 'cancelled', 'skipped')
      limit 1
    ) as exists
  `;

  return !scheduledRows[0]?.exists;
}

function blogRow(
  post: BlogPost,
  status: BlogStatus,
  timestamp: string
): AdminContentInventoryRow {
  return {
    contentMarkdown: post.contentMarkdown || null,
    contentType: "blog_post",
    createdAt: timestamp,
    id: post.id,
    imageAlt: post.imageAlt || null,
    imageUrl: post.imageUrl || null,
    lastViewedAt: null,
    locale: post.locale,
    pageViews: 0,
    pendingTaskId: null,
    publishedAt: status === "published" ? timestamp : null,
    scheduledFor: null,
    slug: post.slug,
    sourceAgent: null,
    sourceChannel: null,
    sourceRef: null,
    status,
    summary: post.excerpt || null,
    title: post.title,
    translationGroupId: post.translationGroupId,
    translationLocales: [post.locale],
    updatedAt: timestamp,
    workflowStatus: workflowStatus(status)
  };
}

function testimonialRow(
  testimonial: BlogTestimonial,
  locale: Locale,
  status: BlogStatus,
  timestamp: string
): AdminContentInventoryRow {
  return {
    contentMarkdown: null,
    contentType: "testimonial",
    createdAt: timestamp,
    id: testimonial.id,
    imageAlt: testimonial.authorImageAlt || null,
    imageUrl: testimonial.authorImageUrl || null,
    lastViewedAt: null,
    locale,
    pageViews: 0,
    pendingTaskId: null,
    publishedAt: null,
    scheduledFor: null,
    slug: null,
    sourceAgent: null,
    sourceChannel: null,
    sourceRef: null,
    status,
    summary: testimonial.quote || null,
    title: testimonial.authorName || "Testimonial",
    translationGroupId: null,
    translationLocales: [locale],
    updatedAt: timestamp,
    workflowStatus: workflowStatus(status)
  };
}

function editorInput(body: Record<string, unknown>, creating: boolean) {
  const selectedType = contentType(body.contentType);
  const selectedStatus =
    creating || body.status !== undefined ? statusValue(body.status) : null;
  const displayStatus = selectedStatus ?? statusValue(body.currentStatus);
  const locale = localeValue(body.locale);

  if (!selectedType) {
    return { error: "Content type is required" } as const;
  }

  if (selectedType === "blog_post") {
    const imageUrl = textOrNull(body.imageUrl ?? body.image_url);
    const imageAlt = textOrNull(body.imageAlt ?? body.image_alt);
    const title = textOrNull(body.title);
    const slug = textOrNull(body.slug);
    const excerpt = textOrNull(body.excerpt, 1200);
    const contentMarkdown =
      body.contentMarkdown === undefined && body.content_markdown === undefined
        ? undefined
        : textOrNull(body.contentMarkdown ?? body.content_markdown, 100000);

    if (creating && (!title || !slug || !excerpt)) {
      return { error: "Blog posts require title, slug, and excerpt" } as const;
    }

    if (imageUrl && !imageAlt) {
      return { error: "Image alt text is required when an image URL is provided" } as const;
    }

    return {
      input: {
        ...(contentMarkdown !== undefined ? { contentMarkdown } : {}),
        excerpt,
        imageAlt,
        imageUrl,
        locale,
        slug,
        title,
        ...(selectedStatus ? { status: selectedStatus } : {}),
        ...(creating ? { sourceAgent: "admin_dashboard" } : {})
      },
      locale,
      status: displayStatus,
      type: selectedType
    } as const;
  }

  const authorImageUrl = textOrNull(
    body.authorImageUrl ?? body.author_image_url ?? body.imageUrl ?? body.image_url
  );
  const authorImageAlt = textOrNull(
    body.authorImageAlt ?? body.author_image_alt ?? body.imageAlt ?? body.image_alt
  );
  const authorName = textOrNull(body.authorName ?? body.author_name);
  const quote = textOrNull(body.quote, 4000);

  if (creating && (!authorName || !quote)) {
    return { error: "Testimonials require quote and author name" } as const;
  }

  if (authorImageUrl && !authorImageAlt) {
    return { error: "Image alt text is required when an image URL is provided" } as const;
  }

  return {
    input: {
      authorImageAlt,
      authorImageUrl,
      authorName,
      locale,
      quote,
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(creating ? { sourceAgent: "admin_dashboard" } : {})
    },
    locale,
    status: displayStatus,
    type: selectedType
  } as const;
}

export async function POST(request: Request) {
  const body = objectValue(await request.json().catch(() => ({})));
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  const parsed = editorInput(body, true);

  if ("error" in parsed) {
    return badRequest(parsed.error ?? "Content editor request is incomplete");
  }

  try {
    const timestamp = new Date().toISOString();
    const content =
      parsed.type === "blog_post"
        ? blogRow(await createBlogPost(parsed.input), parsed.status, timestamp)
        : testimonialRow(
            await createTestimonial(parsed.input),
            parsed.locale,
            parsed.status,
            timestamp
          );

    return NextResponse.json({ content }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Unable to create content", { error: errorDetails(error) });

    return NextResponse.json(
      { message: "Unable to create content" },
      {
        headers: noStoreHeaders,
        status: 500
      }
    );
  }
}

export async function PATCH(request: Request) {
  const body = objectValue(await request.json().catch(() => ({})));
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  const parsed = editorInput(body, false);
  const contentId = textOrNull(body.contentId ?? body.id);

  if ("error" in parsed) {
    return badRequest(parsed.error ?? "Content editor request is incomplete");
  }

  if (!contentId) {
    return badRequest("Content id is required");
  }

  try {
    if (!(await contentEditableAsDraft(parsed.type, contentId))) {
      return badRequest("Only draft content can be edited");
    }

    const timestamp = new Date().toISOString();
    const content =
      parsed.type === "blog_post"
        ? await updateBlogPost(contentId, parsed.input, parsed.locale).then((post) =>
            post ? blogRow(post, parsed.status, timestamp) : null
          )
        : await updateTestimonial(contentId, parsed.input).then((testimonial) =>
            testimonial
              ? testimonialRow(testimonial, parsed.locale, parsed.status, timestamp)
              : null
          );

    if (!content) {
      return badRequest("Content was not found");
    }

    return NextResponse.json({ content }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Unable to update content", { error: errorDetails(error) });

    return NextResponse.json(
      { message: "Unable to update content" },
      {
        headers: noStoreHeaders,
        status: 500
      }
    );
  }
}
