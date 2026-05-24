import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  defaultLocale,
  isLocale,
  localeHtmlLang,
  publicLocales,
  type Locale
} from "@/lib/i18n";

export type BlogStatus = "archived" | "draft" | "published" | "review";

export type BlogArticlePoint = Readonly<{
  body: string;
  title: string;
}>;

export type BlogArticleBody = Readonly<{
  closing?: string;
  intro?: string;
  points?: BlogArticlePoint[];
  sectionBody?: string;
  sectionTitle?: string;
}>;

export type BlogTestimonial = Readonly<{
  authorHandle: string;
  authorImageAlt: string;
  authorImageUrl: string;
  authorName: string;
  authorTitle: string;
  id: string;
  quote: string;
}>;

export type BlogPostSummary = Readonly<{
  date: string;
  datetime: string;
  excerpt: string;
  href: string;
  id: string;
  imageAlt: string;
  imageUrl: string;
  slug: string;
  title: string;
  translationGroupId: string;
}>;

export type BlogPost = BlogPostSummary &
  Readonly<{
    body: BlogArticleBody;
    contentMarkdown: string;
    locale: Locale;
    seoDescription: string;
    seoTitle: string;
    subtitle: string;
    tags: string[];
    testimonial: BlogTestimonial | null;
  }>;

type BlogPostRow = {
  body: BlogArticleBody | null;
  content_markdown: string | null;
  created_at?: Date | string | null;
  excerpt: string | null;
  id: string;
  image_alt: string | null;
  image_url: string | null;
  locale: string | null;
  metadata?: postgres.JSONValue | null;
  published_at: Date | string | null;
  seo_description: string | null;
  seo_title: string | null;
  slug: string;
  social_description?: string | null;
  social_image_url?: string | null;
  social_title?: string | null;
  source_agent?: string | null;
  source_channel?: string | null;
  source_ref?: string | null;
  status?: string | null;
  subtitle: string | null;
  tags: string[] | null;
  testimonial_author_handle: string | null;
  testimonial_author_image_alt: string | null;
  testimonial_author_image_url: string | null;
  testimonial_author_name: string | null;
  testimonial_author_title: string | null;
  testimonial_id: string | null;
  testimonial_quote: string | null;
  title: string;
  translation_group_id: string;
};

type TestimonialRow = {
  author_handle: string | null;
  author_image_alt: string | null;
  author_image_url: string | null;
  author_name: string | null;
  author_title: string | null;
  id: string;
  locale?: string | null;
  metadata?: postgres.JSONValue | null;
  quote: string;
  sort_order?: number | null;
  source_agent?: string | null;
  status?: string | null;
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

function toStatus(value: unknown): BlogStatus {
  return value === "archived" ||
    value === "draft" ||
    value === "published" ||
    value === "review"
    ? value
    : "draft";
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function toOptionalString(value: unknown) {
  const text = toStringValue(value);

  return text || null;
}

function toOptionalUuid(value: unknown) {
  const text = toOptionalString(value);

  return text && isUuid(text) ? text : null;
}

function toTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function toMetadata(
  value: unknown,
  fallback: postgres.JSONValue = {}
): postgres.JSONValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as postgres.JSONValue;
  }

  return fallback;
}

function toBody(value: unknown): BlogArticleBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const points = Array.isArray(record.points)
    ? record.points
        .filter(
          (point): point is Record<string, unknown> =>
            !!point && typeof point === "object" && !Array.isArray(point)
        )
        .map((point) => ({
          body: toStringValue(point.body),
          title: toStringValue(point.title)
        }))
        .filter((point) => point.title && point.body)
        .slice(0, 6)
    : [];

  return {
    closing: toStringValue(record.closing),
    intro: toStringValue(record.intro),
    points,
    sectionBody: toStringValue(record.sectionBody),
    sectionTitle: toStringValue(record.sectionTitle)
  };
}

function hasInputValue(input: BlogPostInput, camelKey: string, snakeKey: string) {
  return (
    Object.prototype.hasOwnProperty.call(input, camelKey) ||
    Object.prototype.hasOwnProperty.call(input, snakeKey)
  );
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function formatPublishedDate(value: Date | string | null, locale: Locale) {
  const date = value ? new Date(value) : new Date();
  const formatter =
    dateFormatters.get(locale) ??
    new Intl.DateTimeFormat(localeHtmlLang(locale), {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

  dateFormatters.set(locale, formatter);

  return {
    date: formatter.format(date),
    datetime: date.toISOString().slice(0, 10)
  };
}

function hrefForPost(locale: Locale, slug: string) {
  return `/${locale}/blog/${slug}`;
}

function mapTestimonial(row: TestimonialRow | BlogPostRow): BlogTestimonial | null {
  const id =
    "testimonial_id" in row ? row.testimonial_id : "id" in row ? row.id : "";
  const quote =
    "testimonial_quote" in row ? row.testimonial_quote : "quote" in row ? row.quote : "";
  const authorName =
    ("testimonial_author_name" in row
      ? row.testimonial_author_name
      : row.author_name) ?? "MattaNutra reader";
  const authorImageUrl =
    ("testimonial_author_image_url" in row
      ? row.testimonial_author_image_url
      : row.author_image_url) ?? "";
  const authorImageAlt =
    ("testimonial_author_image_alt" in row
      ? row.testimonial_author_image_alt
      : row.author_image_alt) ?? "";

  if (!id || !quote) {
    return null;
  }

  return {
    authorHandle:
      ("testimonial_author_handle" in row
        ? row.testimonial_author_handle
        : row.author_handle) ?? "",
    authorImageAlt:
      authorImageAlt || (authorImageUrl ? `${authorName} testimonial photo` : ""),
    authorImageUrl,
    authorName,
    authorTitle:
      ("testimonial_author_title" in row
        ? row.testimonial_author_title
        : row.author_title) ?? "",
    id,
    quote
  };
}

function mapPost(row: BlogPostRow, localeOverride?: Locale): BlogPost {
  const locale = localeOverride ?? toLocale(row.locale);
  const published = formatPublishedDate(row.published_at, locale);
  const body = row.body ?? {};

  return {
    body,
    contentMarkdown: row.content_markdown ?? "",
    date: published.date,
    datetime: published.datetime,
    excerpt: row.excerpt ?? "",
    href: hrefForPost(locale, row.slug),
    id: row.id,
    imageAlt: row.image_alt ?? "",
    imageUrl: row.image_url ?? "",
    locale,
    seoDescription: row.seo_description ?? row.excerpt ?? "",
    seoTitle: row.seo_title ?? row.title,
    slug: row.slug,
    subtitle: row.subtitle ?? row.excerpt ?? "",
    tags: row.tags ?? [],
    testimonial: mapTestimonial(row),
    title: row.title,
    translationGroupId: row.translation_group_id
  };
}

function blogSelectSql() {
  return `
    select
      p.id,
      p.translation_group_id,
      p.locale,
      p.slug,
      p.title,
      p.subtitle,
      p.excerpt,
      p.content_markdown,
      p.body,
      p.image_url,
      p.image_alt,
      p.published_at,
      p.tags,
      p.seo_title,
      p.seo_description,
      t.id as testimonial_id,
      t.quote as testimonial_quote,
      t.author_name as testimonial_author_name,
      t.author_title as testimonial_author_title,
      t.author_handle as testimonial_author_handle,
      t.author_image_url as testimonial_author_image_url,
      t.author_image_alt as testimonial_author_image_alt
    from public.blog_posts p
    left join public.testimonials t on t.id = p.testimonial_id
  `;
}

export async function getPublishedBlogPosts(locale: Locale, limit = 3) {
  const sql = getSql();

  if (!sql) {
    return [] as BlogPostSummary[];
  }

  try {
    const rows = await sql.unsafe<BlogPostRow[]>(
      `${blogSelectSql()}
       where p.status = 'published'
         and p.locale = $1
       order by p.published_at desc nulls last, p.created_at desc
       limit $2`,
      [locale, limit]
    );

    return rows.map((row) => mapPost(row));
  } catch (error) {
    console.error("Unable to load blog posts", error);
    return [] as BlogPostSummary[];
  }
}

export async function getPublishedBlogPost(locale: Locale, slug: string) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  try {
    const rows = await sql.unsafe<BlogPostRow[]>(
      `${blogSelectSql()}
       where p.status = 'published'
         and p.locale = $1
         and p.slug = $2
       limit 1`,
      [locale, slug]
    );

    return rows[0] ? mapPost(rows[0]) : null;
  } catch (error) {
    console.error("Unable to load blog post", error);
    return null;
  }
}

export async function getPublishedBlogPostLocalePaths(
  translationGroupId: string
) {
  const sql = getSql();

  if (!sql) {
    return {} as Partial<Record<Locale, string>>;
  }

  try {
    const rows = await sql<
      Array<{
        locale: string | null;
        slug: string;
      }>
    >`
      select locale, slug
      from public.blog_posts
      where translation_group_id = ${translationGroupId}
        and status = 'published'
        and locale = any(${publicLocales}::text[])
    `;

    return rows.reduce<Partial<Record<Locale, string>>>((paths, row) => {
      const locale = toLocale(row.locale);

      paths[locale] = hrefForPost(locale, row.slug);

      return paths;
    }, {});
  } catch (error) {
    console.error("Unable to load blog translation links", error);
    return {} as Partial<Record<Locale, string>>;
  }
}

export async function listBlogPostsForApi({
  locale,
  status
}: Readonly<{
  locale?: unknown;
  status?: unknown;
}>) {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const selectedLocale = typeof locale === "string" && isLocale(locale) ? locale : null;
  const selectedStatus =
    status === "archived" ||
    status === "draft" ||
    status === "published" ||
    status === "review"
      ? status
      : "published";

  const rows = selectedLocale
    ? await sql.unsafe<BlogPostRow[]>(
        `${blogSelectSql()}
         where p.status = $1
           and p.locale = $2
         order by p.published_at desc nulls last, p.updated_at desc
         limit 100`,
        [selectedStatus, selectedLocale]
      )
    : await sql.unsafe<BlogPostRow[]>(
        `${blogSelectSql()}
         where p.status = $1
         order by p.published_at desc nulls last, p.updated_at desc
         limit 100`,
        [selectedStatus]
      );

  return rows.map((row) => mapPost(row));
}

type BlogPostInput = Readonly<Record<string, unknown>>;

function normalizePostInput(input: BlogPostInput, existing?: BlogPostRow) {
  const title = toStringValue(input.title, existing?.title ?? "");
  const slug = slugify(toStringValue(input.slug, existing?.slug ?? title));
  const locale = toLocale(input.locale ?? existing?.locale);
  const status = toStatus(input.status ?? existing?.status ?? "draft");
  const contentMarkdownValue = input.contentMarkdown ?? input.content_markdown;
  const publishedAtValue = input.publishedAt ?? input.published_at;
  const publishedAt =
    publishedAtValue === null
      ? null
      : toOptionalString(publishedAtValue) ??
        (status === "published" ? new Date().toISOString() : existing?.published_at ?? null);

  return {
    body: toBody(input.body ?? existing?.body),
    contentMarkdown: hasInputValue(input, "contentMarkdown", "content_markdown")
      ? toOptionalString(contentMarkdownValue)
      : existing?.content_markdown ?? null,
    excerpt: toStringValue(input.excerpt, existing?.excerpt ?? ""),
    id: toStringValue(input.id, existing?.id ?? randomUUID()),
    imageAlt: toOptionalString(input.imageAlt ?? input.image_alt) ?? existing?.image_alt ?? null,
    imageUrl: toOptionalString(input.imageUrl ?? input.image_url) ?? existing?.image_url ?? null,
    locale,
    metadata: toMetadata(input.metadata, existing?.metadata ?? {}),
    publishedAt,
    seoDescription:
      toOptionalString(input.seoDescription ?? input.seo_description) ??
      existing?.seo_description ??
      null,
    seoTitle:
      toOptionalString(input.seoTitle ?? input.seo_title) ??
      existing?.seo_title ??
      null,
    slug,
    socialDescription:
      toOptionalString(input.socialDescription ?? input.social_description) ??
      existing?.social_description ??
      null,
    socialImageUrl:
      toOptionalString(input.socialImageUrl ?? input.social_image_url) ??
      existing?.social_image_url ??
      null,
    socialTitle:
      toOptionalString(input.socialTitle ?? input.social_title) ??
      existing?.social_title ??
      null,
    sourceAgent:
      toOptionalString(input.sourceAgent ?? input.source_agent) ??
      existing?.source_agent ??
      null,
    sourceChannel:
      toOptionalString(input.sourceChannel ?? input.source_channel) ??
      existing?.source_channel ??
      null,
    sourceRef:
      toOptionalString(input.sourceRef ?? input.source_ref) ??
      existing?.source_ref ??
      null,
    status,
    subtitle: toOptionalString(input.subtitle) ?? existing?.subtitle ?? null,
    tags: toTags(input.tags ?? existing?.tags),
    testimonialId:
      toOptionalString(input.testimonialId ?? input.testimonial_id) ??
      existing?.testimonial_id ??
      null,
    title,
    translationGroupId:
      toOptionalUuid(input.translationGroupId ?? input.translation_group_id) ??
      existing?.translation_group_id ??
      null
  };
}

async function findTranslationGroupForInput(
  input: BlogPostInput,
  post: ReturnType<typeof normalizePostInput>
) {
  const sql = getSql();

  if (!sql) {
    return post.translationGroupId ?? randomUUID();
  }

  const sourceIdOrSlug = toOptionalString(
    input.translatedFromPostId ??
      input.translated_from_post_id ??
      input.translationSourceId ??
      input.translation_source_id
  );
  const sourceLocale = toLocale(
    input.translatedFromLocale ??
      input.translated_from_locale ??
      input.translationSourceLocale ??
      input.translation_source_locale
  );

  if (sourceIdOrSlug) {
    const source = await findEditablePost(sourceIdOrSlug, sourceLocale);

    if (source?.translation_group_id) {
      return source.translation_group_id;
    }
  }

  if (post.translationGroupId) {
    return post.translationGroupId;
  }

  const slugMatches = await sql<Array<{ translation_group_id: string }>>`
    select translation_group_id::text
    from public.blog_posts
    where slug = ${post.slug}
      and locale <> ${post.locale}
    order by created_at asc
    limit 1
  `;

  return slugMatches[0]?.translation_group_id ?? randomUUID();
}

async function findEditablePost(idOrSlug: string, locale?: Locale) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const rows = isUuid(idOrSlug)
    ? await sql<BlogPostRow[]>`
        select
          p.*,
          t.id as testimonial_id,
          t.quote as testimonial_quote,
          t.author_name as testimonial_author_name,
          t.author_title as testimonial_author_title,
          t.author_handle as testimonial_author_handle,
          t.author_image_url as testimonial_author_image_url,
          t.author_image_alt as testimonial_author_image_alt
        from public.blog_posts p
        left join public.testimonials t on t.id = p.testimonial_id
        where p.id = ${idOrSlug}
        limit 1
      `
    : await sql<BlogPostRow[]>`
        select
          p.*,
          t.id as testimonial_id,
          t.quote as testimonial_quote,
          t.author_name as testimonial_author_name,
          t.author_title as testimonial_author_title,
          t.author_handle as testimonial_author_handle,
          t.author_image_url as testimonial_author_image_url,
          t.author_image_alt as testimonial_author_image_alt
        from public.blog_posts p
        left join public.testimonials t on t.id = p.testimonial_id
        where p.slug = ${idOrSlug}
          and p.locale = ${locale ?? defaultLocale}
        limit 1
      `;

  return rows[0] ?? null;
}

export async function createBlogPost(input: BlogPostInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const post = normalizePostInput(input);
  const translationGroupId = await findTranslationGroupForInput(input, post);

  if (!post.title || !post.slug || !post.excerpt) {
    throw new Error("Blog post requires title, slug, and excerpt");
  }

  const rows = await sql<BlogPostRow[]>`
    insert into public.blog_posts (
      id,
      translation_group_id,
      locale,
      slug,
      status,
      title,
      subtitle,
      excerpt,
      content_markdown,
      body,
      image_url,
      image_alt,
      testimonial_id,
      tags,
      seo_title,
      seo_description,
      social_title,
      social_description,
      social_image_url,
      source_channel,
      source_agent,
      source_ref,
      metadata,
      published_at
    )
    values (
      ${post.id},
      ${translationGroupId},
      ${post.locale},
      ${post.slug},
      ${post.status},
      ${post.title},
      ${post.subtitle},
      ${post.excerpt},
      ${post.contentMarkdown},
      ${sql.json(post.body)},
      ${post.imageUrl},
      ${post.imageAlt},
      ${post.testimonialId},
      ${post.tags},
      ${post.seoTitle},
      ${post.seoDescription},
      ${post.socialTitle},
      ${post.socialDescription},
      ${post.socialImageUrl},
      ${post.sourceChannel},
      ${post.sourceAgent},
      ${post.sourceRef},
      ${sql.json(post.metadata)},
      ${post.publishedAt}
    )
    returning *
  `;

  const created = rows[0];

  if (!created) {
    throw new Error("Unable to create blog post");
  }

  return mapPost({ ...created, ...emptyJoinedTestimonial() });
}

function emptyJoinedTestimonial() {
  return {
    testimonial_author_handle: null,
    testimonial_author_image_alt: null,
    testimonial_author_image_url: null,
    testimonial_author_name: null,
    testimonial_author_title: null,
    testimonial_quote: null
  };
}

export async function getBlogPostForApi(idOrSlug: string, locale?: Locale) {
  const existing = await findEditablePost(idOrSlug, locale);

  return existing ? mapPost(existing, locale) : null;
}

export async function updateBlogPost(
  idOrSlug: string,
  input: BlogPostInput,
  locale?: Locale
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const existing = await findEditablePost(idOrSlug, locale);

  if (!existing) {
    return null;
  }

  const post = normalizePostInput(input, existing);

  const rows = await sql<BlogPostRow[]>`
    update public.blog_posts
    set
      translation_group_id = ${post.translationGroupId ?? existing.translation_group_id},
      locale = ${post.locale},
      slug = ${post.slug},
      status = ${post.status},
      title = ${post.title},
      subtitle = ${post.subtitle},
      excerpt = ${post.excerpt},
      content_markdown = ${post.contentMarkdown},
      body = ${sql.json(post.body)},
      image_url = ${post.imageUrl},
      image_alt = ${post.imageAlt},
      testimonial_id = ${post.testimonialId},
      tags = ${post.tags},
      seo_title = ${post.seoTitle},
      seo_description = ${post.seoDescription},
      social_title = ${post.socialTitle},
      social_description = ${post.socialDescription},
      social_image_url = ${post.socialImageUrl},
      source_channel = ${post.sourceChannel},
      source_agent = ${post.sourceAgent},
      source_ref = ${post.sourceRef},
      metadata = ${sql.json(post.metadata)},
      published_at = ${post.publishedAt},
      updated_at = now()
    where id = ${existing.id}
    returning *
  `;

  const updated = rows[0];

  return updated ? mapPost({ ...updated, ...emptyJoinedTestimonial() }) : null;
}

export async function archiveBlogPost(idOrSlug: string, locale?: Locale) {
  return updateBlogPost(idOrSlug, { status: "archived" }, locale);
}

type BlogTestimonialInput = Readonly<Record<string, unknown>>;

function normalizeTestimonialInput(
  input: BlogTestimonialInput,
  existing?: TestimonialRow
) {
  return {
    authorHandle:
      toOptionalString(input.authorHandle ?? input.author_handle) ??
      existing?.author_handle ??
      null,
    authorImageAlt:
      toOptionalString(input.authorImageAlt ?? input.author_image_alt) ??
      existing?.author_image_alt ??
      null,
    authorImageUrl:
      toOptionalString(input.authorImageUrl ?? input.author_image_url) ??
      existing?.author_image_url ??
      null,
    authorName:
      toStringValue(
        input.authorName ?? input.author_name,
        existing?.author_name ?? ""
      ),
    authorTitle:
      toOptionalString(input.authorTitle ?? input.author_title) ??
      existing?.author_title ??
      null,
    id: toStringValue(input.id, existing?.id ?? randomUUID()),
    locale: toLocale(input.locale ?? existing?.locale),
    metadata: toMetadata(input.metadata, existing?.metadata ?? {}),
    quote: toStringValue(input.quote, existing?.quote ?? ""),
    sortOrder:
      Number(input.sortOrder ?? input.sort_order ?? existing?.sort_order ?? 0) ||
      0,
    sourceAgent:
      toOptionalString(input.sourceAgent ?? input.source_agent) ??
      existing?.source_agent ??
      null,
    status: toStatus(input.status ?? existing?.status ?? "published")
  };
}

export async function listTestimonialsForApi(locale?: unknown, status?: unknown) {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const selectedLocale = isLocale(locale) ? locale : null;
  const selectedStatus = toStatus(status ?? "published");
  const rows = selectedLocale
    ? await sql<TestimonialRow[]>`
        select *
        from public.testimonials
        where locale = ${selectedLocale}
          and status = ${selectedStatus}
        order by sort_order asc, created_at desc
        limit 100
      `
    : await sql<TestimonialRow[]>`
        select *
        from public.testimonials
        where status = ${selectedStatus}
        order by sort_order asc, created_at desc
        limit 100
      `;

  return rows
    .map((row) => mapTestimonial(row))
    .filter((testimonial): testimonial is BlogTestimonial =>
      Boolean(testimonial)
    );
}

export async function getRandomPublishedTestimonial(locale: Locale) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  try {
    const rows = await sql<TestimonialRow[]>`
      select *
      from public.testimonials
      where status = 'published'
        and locale in (${locale}, ${defaultLocale})
      order by
        case when locale = ${locale} then 0 else 1 end,
        random()
      limit 1
    `;

    return rows[0] ? mapTestimonial(rows[0]) : null;
  } catch (error) {
    console.error("Unable to load testimonial", error);
    return null;
  }
}

async function findEditableTestimonial(id: string) {
  const sql = getSql();

  if (!sql || !isUuid(id)) {
    return null;
  }

  const rows = await sql<TestimonialRow[]>`
    select *
    from public.testimonials
    where id = ${id}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function getTestimonialForApi(id: string) {
  const existing = await findEditableTestimonial(id);

  return existing ? mapTestimonial(existing) : null;
}

export async function createTestimonial(input: BlogTestimonialInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const testimonial = normalizeTestimonialInput(input);

  if (!testimonial.quote || !testimonial.authorName) {
    throw new Error("Testimonial requires quote and authorName");
  }

  const rows = await sql<TestimonialRow[]>`
    insert into public.testimonials (
      id,
      locale,
      status,
      quote,
      author_name,
      author_title,
      author_handle,
      author_image_url,
      author_image_alt,
      sort_order,
      source_agent,
      metadata
    )
    values (
      ${testimonial.id},
      ${testimonial.locale},
      ${testimonial.status},
      ${testimonial.quote},
      ${testimonial.authorName},
      ${testimonial.authorTitle},
      ${testimonial.authorHandle},
      ${testimonial.authorImageUrl},
      ${testimonial.authorImageAlt},
      ${testimonial.sortOrder},
      ${testimonial.sourceAgent},
      ${sql.json(testimonial.metadata)}
    )
    returning *
  `;

  const created = rows[0];
  const createdTestimonial = created ? mapTestimonial(created) : null;

  if (!createdTestimonial) {
    throw new Error("Unable to create testimonial");
  }

  return createdTestimonial;
}

export async function updateTestimonial(
  id: string,
  input: BlogTestimonialInput
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const existing = await findEditableTestimonial(id);

  if (!existing) {
    return null;
  }

  const testimonial = normalizeTestimonialInput(input, existing);
  const rows = await sql<TestimonialRow[]>`
    update public.testimonials
    set
      locale = ${testimonial.locale},
      status = ${testimonial.status},
      quote = ${testimonial.quote},
      author_name = ${testimonial.authorName},
      author_title = ${testimonial.authorTitle},
      author_handle = ${testimonial.authorHandle},
      author_image_url = ${testimonial.authorImageUrl},
      author_image_alt = ${testimonial.authorImageAlt},
      sort_order = ${testimonial.sortOrder},
      source_agent = ${testimonial.sourceAgent},
      metadata = ${sql.json(testimonial.metadata)},
      updated_at = now()
    where id = ${existing.id}
    returning *
  `;

  const updated = rows[0];

  return updated ? mapTestimonial(updated) : null;
}

export async function archiveTestimonial(id: string) {
  return updateTestimonial(id, { status: "archived" });
}
