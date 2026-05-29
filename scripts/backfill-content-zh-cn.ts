import { getSql } from "@/lib/db";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import type postgres from "postgres";

type BlogSourceRow = Readonly<{
  body: unknown;
  contentMarkdown: string | null;
  excerpt: string;
  id: string;
  imageAlt: string | null;
  imageUrl: string | null;
  locale: string;
  metadata: unknown;
  publishedAt: string | Date | null;
  seoDescription: string | null;
  seoTitle: string | null;
  slug: string;
  socialDescription: string | null;
  socialImageUrl: string | null;
  socialTitle: string | null;
  sourceAgent: string | null;
  sourceChannel: string | null;
  sourceRef: string | null;
  status: string;
  subtitle: string | null;
  tags: string[];
  testimonialId: string | null;
  title: string;
  translationGroupId: string;
}>;

type TestimonialSourceRow = Readonly<{
  authorHandle: string | null;
  authorImageAlt: string | null;
  authorImageUrl: string | null;
  authorName: string;
  authorTitle: string | null;
  id: string;
  metadata: unknown;
  quote: string;
  sortOrder: number;
  translationGroupId: string;
}>;

type BlogTranslation = Readonly<{
  body: unknown;
  contentMarkdown: string | null;
  excerpt: string;
  id: string;
  imageAlt: string | null;
  seoDescription: string | null;
  seoTitle: string | null;
  socialDescription: string | null;
  socialTitle: string | null;
  subtitle: string | null;
  tags: string[];
  title: string;
}>;

type TestimonialTranslation = Readonly<{
  authorImageAlt: string | null;
  authorTitle: string | null;
  id: string;
  quote: string;
}>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function textOrNull(value: unknown, max = 4000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("Model returned empty content");
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error("Model returned invalid JSON");
  }
}

function parseStringArray(value: unknown, maxItems = 12) {
  return Array.isArray(value)
    ? value
        .map((item) => textOrNull(item, 120))
        .filter((item): item is string => Boolean(item))
        .slice(0, maxItems)
    : [];
}

function toJsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? {})) as postgres.JSONValue;
}

function normalizeBlogTranslation(value: unknown): BlogTranslation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = textOrNull(record.id, 80);
  const title = textOrNull(record.title, 300);
  const excerpt = textOrNull(record.excerpt, 700);

  if (!id || !title || !excerpt) {
    return null;
  }

  return {
    body:
      record.body && typeof record.body === "object" && !Array.isArray(record.body)
        ? record.body
        : {},
    contentMarkdown: textOrNull(record.contentMarkdown, 12000),
    excerpt,
    id,
    imageAlt: textOrNull(record.imageAlt, 300),
    seoDescription: textOrNull(record.seoDescription, 500),
    seoTitle: textOrNull(record.seoTitle, 300),
    socialDescription: textOrNull(record.socialDescription, 500),
    socialTitle: textOrNull(record.socialTitle, 300),
    subtitle: textOrNull(record.subtitle, 500),
    tags: parseStringArray(record.tags),
    title
  };
}

function normalizeTestimonialTranslation(
  value: unknown
): TestimonialTranslation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = textOrNull(record.id, 80);
  const quote = textOrNull(record.quote, 1200);

  if (!id || !quote) {
    return null;
  }

  return {
    authorImageAlt: textOrNull(record.authorImageAlt, 300),
    authorTitle: textOrNull(record.authorTitle, 300),
    id,
    quote
  };
}

async function translateContent(input: {
  blogs: readonly BlogSourceRow[];
  testimonials: readonly TestimonialSourceRow[];
}) {
  const completion = await callGrokChatCompletion({
    apiKey: getRequiredXaiApiKey(),
    maxTokens: 16000,
    messages: [
      {
        role: "system",
        content: [
          "Translate MattaNutra public content into Simplified Chinese for locale zh-CN.",
          "Return JSON only with this shape: {\"blogs\": [...], \"testimonials\": [...]}.",
          "For every blog, keep id unchanged and translate title, subtitle, excerpt, contentMarkdown, body string fields, imageAlt, seoTitle, seoDescription, socialTitle, socialDescription, and tags.",
          "For every testimonial, keep id unchanged and translate quote, authorTitle, and authorImageAlt.",
          "Preserve markdown structure, headings, bullets, product/brand names, HealthScore, MattaNutra, units, numbers, names, cities, and handles.",
          "Use natural Simplified Chinese. Avoid awkward Latin-style spacing in headings. Do not invent claims, medical advice, ingredients, credentials, or outcomes.",
          "Do not translate URLs, ids, source metadata, author names, or social handles."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(input, null, 2)
      }
    ],
    model: configuredGrokModel(process.env.GROK_MODEL),
    purpose: "zh-CN blog and testimonial backfill",
    reasoningEffort: "low",
    temperature: 0.1,
    timeoutMs: 180_000
  });

  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);

  return {
    blogs: Array.isArray(parsed.blogs)
      ? parsed.blogs
          .map(normalizeBlogTranslation)
          .filter((item): item is BlogTranslation => Boolean(item))
      : [],
    testimonials: Array.isArray(parsed.testimonials)
      ? parsed.testimonials
          .map(normalizeTestimonialTranslation)
          .filter((item): item is TestimonialTranslation => Boolean(item))
      : []
  };
}

function zhSlug(source: BlogSourceRow) {
  const base = source.slug.replace(/-zh-cn$/i, "").slice(0, 82);

  return `${base}-zh-cn`;
}

function localizedAuthorName(value: string) {
  return value.replace(/\s*\([^)]*[\u0E00-\u0E7F][^)]*\)/g, "").trim() || value;
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const dryRun = hasArg("dry-run");
  const force = hasArg("force");
  const limit = Number(argValue("limit") ?? "100");
  const blogSources = await sql<BlogSourceRow[]>`
    with ranked as (
      select
        blog_posts.id::text,
        blog_posts.translation_group_id::text as "translationGroupId",
        blog_posts.locale,
        blog_posts.slug,
        blog_posts.status,
        blog_posts.title,
        blog_posts.subtitle,
        blog_posts.excerpt,
        blog_posts.content_markdown as "contentMarkdown",
        blog_posts.body,
        blog_posts.image_url as "imageUrl",
        blog_posts.image_alt as "imageAlt",
        blog_posts.testimonial_id::text as "testimonialId",
        blog_posts.tags,
        blog_posts.seo_title as "seoTitle",
        blog_posts.seo_description as "seoDescription",
        blog_posts.social_title as "socialTitle",
        blog_posts.social_description as "socialDescription",
        blog_posts.social_image_url as "socialImageUrl",
        blog_posts.source_channel as "sourceChannel",
        blog_posts.source_agent as "sourceAgent",
        blog_posts.source_ref as "sourceRef",
        blog_posts.metadata,
        blog_posts.published_at as "publishedAt",
        row_number() over (
          partition by blog_posts.translation_group_id
          order by case blog_posts.locale when 'en' then 0 when 'th' then 1 else 2 end,
                   blog_posts.published_at desc nulls last,
                   blog_posts.created_at desc
        ) as source_rank
      from public.blog_posts
      left join public.blog_posts zh
        on zh.translation_group_id = blog_posts.translation_group_id
       and zh.locale = 'zh-CN'
      where blog_posts.status = 'published'
        and blog_posts.locale <> 'zh-CN'
        and (${force} or zh.id is null)
    )
    select *
    from ranked
    where source_rank = 1
    order by "publishedAt" desc nulls last, title asc
    limit ${Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 100}
  `;
  const testimonialSources = await sql<TestimonialSourceRow[]>`
    select
      testimonials.id::text,
      testimonials.translation_group_id::text as "translationGroupId",
      testimonials.quote,
      testimonials.author_name as "authorName",
      testimonials.author_title as "authorTitle",
      testimonials.author_handle as "authorHandle",
      testimonials.author_image_url as "authorImageUrl",
      testimonials.author_image_alt as "authorImageAlt",
      testimonials.sort_order as "sortOrder",
      testimonials.metadata
    from public.testimonials
    where testimonials.status = 'published'
      and testimonials.locale = 'en'
      and (
        ${force}
        or not exists (
          select 1
          from public.testimonials zh
          where zh.translation_group_id = testimonials.translation_group_id
            and zh.locale = 'zh-CN'
        )
      )
    order by testimonials.sort_order asc, testimonials.created_at asc
    limit ${Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 100}
  `;

  if (blogSources.length === 0 && testimonialSources.length === 0) {
    console.log("[content:zh-CN] nothing to translate");
    await sql.end({ timeout: 5 });
    return;
  }

  const translated = dryRun
    ? { blogs: [], testimonials: [] }
    : await translateContent({ blogs: blogSources, testimonials: testimonialSources });
  const translatedBlogs = new Map(translated.blogs.map((item) => [item.id, item]));
  const translatedTestimonials = new Map(
    translated.testimonials.map((item) => [item.id, item])
  );

  if (dryRun) {
    console.log(
      `[content:zh-CN] dry run blogs=${blogSources.length} testimonials=${testimonialSources.length}`
    );
    await sql.end({ timeout: 5 });
    return;
  }

  let blogsWritten = 0;
  let testimonialsWritten = 0;

  for (const source of blogSources) {
    const translation = translatedBlogs.get(source.id);

    if (!translation) {
      console.warn(`[content:zh-CN] missing blog translation for ${source.id}`);
      continue;
    }

    await sql`
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
        published_at,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        ${source.translationGroupId}::uuid,
        'zh-CN',
        ${zhSlug(source)},
        'published',
        ${translation.title},
        ${translation.subtitle},
        ${translation.excerpt},
        ${translation.contentMarkdown},
        ${sql.json(toJsonValue(translation.body))}::jsonb,
        ${source.imageUrl},
        ${translation.imageAlt ?? source.imageAlt},
        ${
          source.testimonialId
            ? sql`(
                select zh_testimonial.id
                from public.testimonials source_testimonial
                join public.testimonials zh_testimonial
                  on zh_testimonial.locale = 'zh-CN'
                 and zh_testimonial.status = 'published'
                 and (
                   zh_testimonial.metadata->>'sourceTestimonialId' = source_testimonial.id::text
                   or zh_testimonial.sort_order = source_testimonial.sort_order
                 )
                where source_testimonial.id = ${source.testimonialId}::uuid
                order by
                  case
                    when zh_testimonial.metadata->>'sourceTestimonialId' = source_testimonial.id::text then 0
                    else 1
                  end,
                  zh_testimonial.created_at asc
                limit 1
              )`
            : null
        },
        ${translation.tags.length > 0 ? translation.tags : source.tags}::text[],
        ${translation.seoTitle},
        ${translation.seoDescription},
        ${translation.socialTitle},
        ${translation.socialDescription},
        ${source.socialImageUrl},
        ${source.sourceChannel},
        'codex-zh-cn-content-backfill',
        ${source.sourceRef},
        ${sql.json({
          ...(source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
            ? (source.metadata as Record<string, unknown>)
            : {}),
          sourceBlogPostId: source.id,
          sourceLocale: source.locale,
          translatedBy: "grok",
          translationReviewStatus: "machine_backfill"
        })}::jsonb,
        ${source.publishedAt},
        now(),
        now()
      )
      on conflict (translation_group_id, locale) do update set
        slug = excluded.slug,
        status = excluded.status,
        title = excluded.title,
        subtitle = excluded.subtitle,
        excerpt = excluded.excerpt,
        content_markdown = excluded.content_markdown,
        body = excluded.body,
        image_url = excluded.image_url,
        image_alt = excluded.image_alt,
        tags = excluded.tags,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        social_title = excluded.social_title,
        social_description = excluded.social_description,
        social_image_url = excluded.social_image_url,
        source_agent = excluded.source_agent,
        metadata = excluded.metadata,
        published_at = excluded.published_at,
        updated_at = now()
    `;
    blogsWritten += 1;
  }

  for (const source of testimonialSources) {
    const translation = translatedTestimonials.get(source.id);

    if (!translation) {
      console.warn(`[content:zh-CN] missing testimonial translation for ${source.id}`);
      continue;
    }

    await sql`
      insert into public.testimonials (
        id,
        translation_group_id,
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
        metadata,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        ${source.translationGroupId}::uuid,
        'zh-CN',
        'published',
        ${translation.quote},
        ${localizedAuthorName(source.authorName)},
        ${translation.authorTitle ?? source.authorTitle},
        ${source.authorHandle},
        ${source.authorImageUrl},
        ${translation.authorImageAlt ?? source.authorImageAlt},
        ${source.sortOrder},
        'codex-zh-cn-content-backfill',
        ${sql.json({
          ...(source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
            ? (source.metadata as Record<string, unknown>)
            : {}),
          sourceLocale: "en",
          sourceTestimonialId: source.id,
          translationGroupId: source.translationGroupId,
          translatedBy: "grok",
          translationReviewStatus: "machine_backfill"
        })}::jsonb,
        now(),
        now()
      )
      on conflict (translation_group_id, locale) do update set
        quote = excluded.quote,
        author_name = excluded.author_name,
        author_title = excluded.author_title,
        author_handle = excluded.author_handle,
        author_image_url = excluded.author_image_url,
        author_image_alt = excluded.author_image_alt,
        sort_order = excluded.sort_order,
        source_agent = excluded.source_agent,
        metadata = excluded.metadata,
        updated_at = now()
    `;
    testimonialsWritten += 1;
  }

  console.log(
    `[content:zh-CN] wrote blogs=${blogsWritten}/${blogSources.length} testimonials=${testimonialsWritten}/${testimonialSources.length}`
  );
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
