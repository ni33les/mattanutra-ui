import { writeFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";

const csvHeaders = [
  "contentType",
  "id",
  "translationGroupId",
  "locale",
  "field",
  "currentText",
  "status",
  "notes"
] as const;

type ExportRow = Record<(typeof csvHeaders)[number], string>;

function argValue(name: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function localeFilter(locale: string | undefined): Locale | null {
  if (!locale) {
    return null;
  }

  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  return locale;
}

async function main() {
  const sql = getSql();
  const locale = localeFilter(argValue("--locale"));
  const out = argValue("--out");

  if (!sql) {
    throw new Error("DB_URL is not configured");
  }

  const rows: ExportRow[] = [];
  const blogRows = await sql<ExportRow[]>`
    select
      'blog' as "contentType",
      posts.id::text as id,
      posts.translation_group_id::text as "translationGroupId",
      posts.locale,
      fields.field,
      fields.value as "currentText",
      posts.status,
      concat_ws(
        '; ',
        case when posts.metadata->>'homepage' = 'true' then 'homepage' end,
        posts.source_agent,
        posts.source_ref
      ) as notes
    from public.blog_posts posts
    cross join lateral (
      values
        ('title', posts.title),
        ('subtitle', posts.subtitle),
        ('excerpt', posts.excerpt),
        ('content_markdown', posts.content_markdown),
        ('image_alt', posts.image_alt),
        ('seo_title', posts.seo_title),
        ('seo_description', posts.seo_description),
        ('social_title', posts.social_title),
        ('social_description', posts.social_description)
    ) as fields(field, value)
    where (${locale}::text is null or posts.locale = ${locale})
      and nullif(fields.value, '') is not null
    order by posts.translation_group_id, posts.locale, fields.field
  `;
  rows.push(...blogRows);

  const testimonialRows = await sql<ExportRow[]>`
    select
      'testimonial' as "contentType",
      testimonials.id::text as id,
      testimonials.translation_group_id::text as "translationGroupId",
      testimonials.locale,
      fields.field,
      fields.value as "currentText",
      testimonials.status,
      concat_ws(
        '; ',
        case when testimonials.metadata->>'homepage' = 'true' then 'homepage' end,
        testimonials.source_agent
      ) as notes
    from public.testimonials testimonials
    cross join lateral (
      values
        ('quote', testimonials.quote),
        ('author_name', testimonials.author_name),
        ('author_title', testimonials.author_title),
        ('author_image_alt', testimonials.author_image_alt)
    ) as fields(field, value)
    where (${locale}::text is null or testimonials.locale = ${locale})
      and nullif(fields.value, '') is not null
    order by testimonials.translation_group_id, testimonials.locale, fields.field
  `;
  rows.push(...testimonialRows);

  const productRows = await sql<ExportRow[]>`
    select
      'product' as "contentType",
      translations.product_id::text as id,
      translations.product_id::text as "translationGroupId",
      translations.locale,
      fields.field,
      fields.value as "currentText",
      translations.status,
      translations.source as notes
    from public.product_translations translations
    cross join lateral (
      values
        ('title', translations.title),
        ('description', translations.description)
    ) as fields(field, value)
    where (${locale}::text is null or translations.locale = ${locale})
      and nullif(fields.value, '') is not null
    order by translations.product_id, translations.locale, fields.field
  `;
  rows.push(...productRows);

  const supplementRows = await sql<ExportRow[]>`
    select
      'supplement' as "contentType",
      translations.supplement_id::text as id,
      translations.supplement_id::text as "translationGroupId",
      translations.locale,
      fields.field,
      fields.value as "currentText",
      translations.status,
      translations.source as notes
    from public.supplement_translations translations
    cross join lateral (
      values
        ('name', translations.name),
        ('primary_use_case', translations.primary_use_case),
        ('category_label', translations.category_label),
        ('safety_notes', translations.safety_notes),
        ('aliases', array_to_string(translations.aliases, '|'))
    ) as fields(field, value)
    where (${locale}::text is null or translations.locale = ${locale})
      and nullif(fields.value, '') is not null
    order by translations.supplement_id, translations.locale, fields.field
  `;
  rows.push(...supplementRows);

  const csv = [
    csvHeaders.join(","),
    ...rows.map((row) =>
      csvHeaders.map((header) => csvCell(row[header])).join(",")
    )
  ].join("\n");

  if (out) {
    await writeFile(out, `${csv}\n`);
    console.log(JSON.stringify({ file: out, rows: rows.length }, null, 2));
    return;
  }

  console.log(csv);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
