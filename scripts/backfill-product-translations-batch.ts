import { getSql } from "@/lib/db";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { normalizeLocaleCode } from "@/lib/i18n";

type ProductRow = Readonly<{
  brandName: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  id: string;
  title: string;
  titleEn: string | null;
  titleTh: string | null;
}>;

type TranslationRow = Readonly<{
  description: string | null;
  id: string;
  notes: string | null;
  title: string | null;
}>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function textOrNull(value: unknown, max = 1600) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function parseJsonArray(content: string | null | undefined) {
  if (!content) {
    throw new Error("Model returned empty content");
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as unknown[];
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown[];
    }

    throw new Error("Model returned invalid JSON");
  }
}

function normalizeTranslation(value: unknown): TranslationRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = textOrNull(record.id, 80);

  if (!id) {
    return null;
  }

  return {
    description: textOrNull(record.description),
    id,
    notes: textOrNull(record.notes, 1000),
    title: textOrNull(record.title, 500)
  };
}

async function translateBatch(products: readonly ProductRow[], locale: string) {
  const completion = await callGrokChatCompletion({
    apiKey: getRequiredXaiApiKey(),
    maxTokens: 9000,
    messages: [
      {
        role: "system",
        content: [
          `Translate product catalogue display copy to ${locale}.`,
          "For zh-CN, use Simplified Chinese with natural spacing and product-catalogue wording.",
          "Return JSON only: an array of objects with id, title, description, notes.",
          "Keep product IDs unchanged.",
          "Use supplied English/Thai/source title and descriptions only. Do not invent ingredients, doses, FDA numbers, warnings, or medical claims.",
          "Preserve brand names and common supplement abbreviations such as CoQ10, D3, B12, DHA, EPA, IU, mg, NAD+, NMN, GABA, 5-HTP.",
          "If evidence is sparse, still provide a neutral catalogue description from the product title and brand, e.g. '<brand> <title> 是一款补充剂产品。'.",
          "Every product must return a non-empty title and description."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(products, null, 2)
      }
    ],
    model: configuredGrokModel(process.env.GROK_MODEL),
    purpose: "product translation batch backfill",
    reasoningEffort: "low",
    temperature: 0.1,
    timeoutMs: 120_000
  });

  return parseJsonArray(completion.choices?.[0]?.message?.content)
    .map(normalizeTranslation)
    .filter((translation): translation is TranslationRow => Boolean(translation));
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const locale = normalizeLocaleCode(argValue("locale")) ?? "zh-CN";
  const limit = positiveInt(argValue("limit"), 1000);
  const batchSize = Math.min(30, positiveInt(argValue("batch-size"), 15));
  const force = hasArg("force");
  const dryRun = hasArg("dry-run");
  const products = await sql<ProductRow[]>`
    select
      products.id::text,
      products.title,
      products.title_en as "titleEn",
      products.title_th as "titleTh",
      products.brand_name as "brandName",
      products.description,
      products.description_en as "descriptionEn",
      products.description_th as "descriptionTh"
    from public.products products
    left join public.product_translations translations
      on translations.product_id = products.id
      and translations.locale = ${locale}
    where ${force}
       or translations.product_id is null
       or translations.status <> 'complete'
       or nullif(translations.title, '') is null
       or nullif(translations.description, '') is null
    order by products.brand_name asc nulls last, products.title asc
    limit ${limit}
  `;

  let translated = 0;

  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize);

    if (dryRun) {
      console.log(`[products] dry run ${index + 1}-${index + batch.length}`);
      translated += batch.length;
      continue;
    }

    const translations = await translateBatch(batch, locale);

    for (const translation of translations) {
      await sql`
        insert into public.product_translations (
          product_id,
          locale,
          title,
          description,
          status,
          source,
          metadata,
          updated_at
        )
        values (
          ${translation.id}::uuid,
          ${locale},
          ${translation.title},
          ${translation.description},
          ${translation.title && translation.description ? "complete" : "draft"},
          'ai_batch_backfill',
          ${sql.json({
            generatedBy: "backfill-product-translations-batch",
            notes: translation.notes
          })}::jsonb,
          now()
        )
        on conflict (product_id, locale) do update set
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          source = excluded.source,
          metadata = public.product_translations.metadata || excluded.metadata,
          updated_at = now()
      `;
      translated += 1;
    }

    console.log(`[products] ${Math.min(index + batchSize, products.length)}/${products.length}`);
  }

  console.log(JSON.stringify({ dryRun, locale, queued: products.length, translated }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
