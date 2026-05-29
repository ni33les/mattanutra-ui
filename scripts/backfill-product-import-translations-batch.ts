import { getSql } from "@/lib/db";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { normalizeLocaleCode } from "@/lib/i18n";

type ImportRow = Readonly<{
  brandName: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  id: string;
  productTitle: string;
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

async function translateBatch(imports: readonly ImportRow[], locale: string) {
  const completion = await callGrokChatCompletion({
    apiKey: getRequiredXaiApiKey(),
    maxTokens: 9000,
    messages: [
      {
        role: "system",
        content: [
          `Translate product import review copy to ${locale}.`,
          "For th, use natural Thai product-catalogue wording and include Thai script in both title and description. Preserve brand names, but translate or transliterate the product type/key ingredient enough that the title is not English-only.",
          "For zh-CN, use Simplified Chinese with natural product-catalogue wording and include Chinese characters in both title and description.",
          "Return JSON only: an array of objects with id, title, description, notes.",
          "Keep import IDs unchanged.",
          "Use supplied English/Thai/source title and descriptions only. Do not invent ingredients, doses, warnings, FDA numbers, or medical claims.",
          "Preserve brand names and common supplement abbreviations such as CoQ10, D3, B12, DHA, EPA, IU, mg, NAD+, NMN, GABA, 5-HTP.",
          "If evidence is sparse, still provide a neutral catalogue description from the product title and brand.",
          "Every import must return a non-empty title and description."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(imports, null, 2)
      }
    ],
    model: configuredGrokModel(process.env.GROK_MODEL),
    purpose: "product import translation batch backfill",
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
  const imports = await sql<ImportRow[]>`
    select
      product_imports.id::text,
      product_imports.product_title as "productTitle",
      product_imports.title_en as "titleEn",
      product_imports.title_th as "titleTh",
      product_imports.brand_name as "brandName",
      product_imports.description_en as "descriptionEn",
      product_imports.description_th as "descriptionTh"
    from public.product_imports product_imports
    left join public.product_import_translations translations
      on translations.import_id = product_imports.id
      and translations.locale = ${locale}
    where ${force}
       or translations.import_id is null
       or translations.status <> 'complete'
       or nullif(translations.title, '') is null
       or nullif(translations.description, '') is null
    order by product_imports.brand_name asc nulls last, product_imports.product_title asc
    limit ${limit}
  `;

  let translated = 0;

  for (let index = 0; index < imports.length; index += batchSize) {
    const batch = imports.slice(index, index + batchSize);

    if (dryRun) {
      console.log(`[product-imports] dry run ${index + 1}-${index + batch.length}`);
      translated += batch.length;
      continue;
    }

    const translations = await translateBatch(batch, locale);

    for (const translation of translations) {
      await sql`
        insert into public.product_import_translations (
          import_id,
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
            generatedBy: "backfill-product-import-translations-batch",
            notes: translation.notes
          })}::jsonb,
          now()
        )
        on conflict (import_id, locale) do update set
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          source = excluded.source,
          metadata = public.product_import_translations.metadata || excluded.metadata,
          updated_at = now()
      `;
      translated += 1;
    }

    console.log(`[product-imports] ${Math.min(index + batchSize, imports.length)}/${imports.length}`);
  }

  console.log(JSON.stringify({ dryRun, locale, queued: imports.length, translated }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
