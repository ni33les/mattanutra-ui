import { getSql } from "@/lib/db";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { normalizeLocaleCode } from "@/lib/i18n";

type SupplementRow = Readonly<{
  aliases: string[] | null;
  category: string;
  id: string;
  name: string;
  primaryUseCase: string | null;
  safetyNotes: string | null;
}>;

type Translation = Readonly<{
  aliases: string[];
  categoryLabel: string | null;
  id: string;
  name: string;
  primaryUseCase: string | null;
  safetyNotes: string | null;
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

function textOrNull(value: unknown, max = 1000) {
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

function normalizeTranslation(value: unknown): Translation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = textOrNull(record.id, 80);
  const name = textOrNull(record.name, 200);

  if (!id || !name) {
    return null;
  }

  return {
    aliases: Array.isArray(record.aliases)
      ? record.aliases
          .map((alias) => textOrNull(alias, 200))
          .filter((alias): alias is string => Boolean(alias))
      : [],
    categoryLabel: textOrNull(record.categoryLabel, 120),
    id,
    name,
    primaryUseCase: textOrNull(record.primaryUseCase, 500),
    safetyNotes: textOrNull(record.safetyNotes, 2000)
  };
}

async function translateBatch(
  rows: readonly SupplementRow[],
  locale: string
) {
  const completion = await callGrokChatCompletion({
    apiKey: getRequiredXaiApiKey(),
    maxTokens: 6000,
    messages: [
      {
        role: "system",
        content: [
          `Translate supplement catalogue display copy to locale ${locale}.`,
          "For zh-CN, use Simplified Chinese with natural product-catalogue wording.",
          "For th, use natural Thai product-catalogue wording and Thai script for names, categoryLabel, primaryUseCase, safetyNotes, and useful aliases. Preserve common Latin abbreviations only when Thai readers expect them.",
          "Keep supplement IDs canonical and unchanged.",
          "Preserve common Latin supplement abbreviations when Chinese readers expect them: CoQ10, DHA, EPA, B12, D3, NAD+, NMN, GABA, 5-HTP, ALA.",
          "Do not invent safety claims, doses, contraindications, or medical effects.",
          "Return JSON only: an array of objects with id, name, primaryUseCase, categoryLabel, safetyNotes, aliases.",
          "Translate safetyNotes only if present; otherwise return null.",
          "Translate aliases into useful Chinese search aliases plus any common Latin alias from the source."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(rows, null, 2)
      }
    ],
    model: configuredGrokModel(process.env.GROK_MODEL),
    purpose: "supplement translation backfill",
    reasoningEffort: "low",
    temperature: 0.1,
    timeoutMs: 120_000
  });

  return parseJsonArray(completion.choices?.[0]?.message?.content)
    .map(normalizeTranslation)
    .filter((translation): translation is Translation => Boolean(translation));
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const locale = normalizeLocaleCode(argValue("locale")) ?? "zh-CN";
  const batchSize = Math.min(50, positiveInt(argValue("batch-size"), 20));
  const limit = positiveInt(argValue("limit"), 1000);
  const force = hasArg("force");
  const dryRun = hasArg("dry-run");
  const rows = await sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.category,
      supplements.primary_use_case as "primaryUseCase",
      limits.safety_notes as "safetyNotes",
      coalesce(alias_rows.aliases, array[]::text[]) as aliases
    from public.supplements supplements
    left join lateral (
      select safety_notes
      from public.supplement_safety_limits limits
      where limits.supplement_id = supplements.id
      order by version desc
      limit 1
    ) limits on true
    left join lateral (
      select array_agg(supplement_aliases.alias order by supplement_aliases.alias) as aliases
      from public.supplement_aliases supplement_aliases
      where supplement_aliases.supplement_id = supplements.id
    ) alias_rows on true
    left join public.supplement_translations translations
      on translations.supplement_id = supplements.id
      and translations.locale = ${locale}
    where ${force}
       or translations.supplement_id is null
       or translations.status <> 'complete'
       or nullif(translations.name, '') is null
    order by supplements.name asc
    limit ${limit}
  `;

  let translated = 0;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const translations = dryRun ? [] : await translateBatch(batch, locale);

    if (dryRun) {
      console.log(`[supplements] dry run ${index + 1}-${index + batch.length}`);
      translated += batch.length;
      continue;
    }

    for (const translation of translations) {
      await sql`
        insert into public.supplement_translations (
          supplement_id,
          locale,
          name,
          primary_use_case,
          category_label,
          safety_notes,
          aliases,
          status,
          source,
          metadata,
          updated_at
        )
        values (
          ${translation.id}::uuid,
          ${locale},
          ${translation.name},
          ${translation.primaryUseCase},
          ${translation.categoryLabel},
          ${translation.safetyNotes},
          ${translation.aliases},
          'complete',
          'ai_backfill',
          ${sql.json({ generatedBy: "backfill-supplement-translations" })}::jsonb,
          now()
        )
        on conflict (supplement_id, locale) do update set
          name = excluded.name,
          primary_use_case = excluded.primary_use_case,
          category_label = excluded.category_label,
          safety_notes = excluded.safety_notes,
          aliases = excluded.aliases,
          status = excluded.status,
          source = excluded.source,
          metadata = public.supplement_translations.metadata || excluded.metadata,
          updated_at = now()
      `;
      translated += 1;
    }

    console.log(`[supplements] ${Math.min(index + batchSize, rows.length)}/${rows.length}`);
  }

  console.log(JSON.stringify({ dryRun, locale, queued: rows.length, translated }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
