import { getSql } from "@/lib/db";
import { recordXaiUsageCost } from "@/lib/finance-ledger";
import {
  updateAdminProduct,
  type AdminProductRow
} from "@/lib/admin-products";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey,
  type GrokChatCompletion
} from "@/lib/grok-client";
import { normalizeLocaleCode, type LocaleCode } from "@/lib/i18n";

type ProductForCopyTranslation = Readonly<{
  brandName: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  id: string | null;
  productUrl: string;
  sourceSnapshot: unknown;
  title: string;
  titleEn: string | null;
  titleTh: string | null;
}>;

export type ProductCopyTranslationDraftInput = Readonly<{
  brandName?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  productTitle: string;
  productTitleEn?: string | null;
  productTitleTh?: string | null;
  productUrl: string;
  sourceSnapshot?: unknown;
  targetLocale?: LocaleCode | null;
}>;

export type ProductCopyTranslationResult = Readonly<{
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  locale: LocaleCode;
  notes: string | null;
  responseId?: string;
  title: string | null;
  titleEn: string | null;
  titleTh: string | null;
}>;

export type ProductCopyTranslationUpdateResult = Readonly<{
  copy: ProductCopyTranslationResult;
  row: AdminProductRow;
}>;

const DEFAULT_REASONING_EFFORT = "low";
const REQUEST_TIMEOUT_MS = 120_000;

function config() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    reasoningEffort:
      configuredGrokValue(process.env.PRODUCT_COPY_TRANSLATION_REASONING_EFFORT) ||
      configuredGrokValue(process.env.PRODUCT_FACT_CORRECTION_REASONING_EFFORT) ||
      configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

function textOrNull(value: unknown, max = 4000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();

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

function compactJson(value: unknown, max = 20_000) {
  const json = JSON.stringify(value ?? null, null, 2);

  return json.length > max ? `${json.slice(0, max)}\n[truncated]` : json;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, "\"")
    .replace(/&ldquo;/gi, "\"")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );
}

async function loadProduct(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string
) {
  const rows = await sql<ProductForCopyTranslation[]>`
    select
      products.id::text,
      products.title,
      products.title_en as "titleEn",
      products.title_th as "titleTh",
      products.brand_name as "brandName",
      products.product_url as "productUrl",
      products.description,
      products.description_en as "descriptionEn",
      products.description_th as "descriptionTh",
      products.source_snapshot as "sourceSnapshot"
    from public.products
    where products.id = ${productId}::uuid
    limit 1
  `;

  const row = rows[0];

  if (!row) {
    throw new Error("Product not found");
  }

  return row;
}

function productFromDraft(
  input: ProductCopyTranslationDraftInput
): ProductForCopyTranslation {
  return {
    brandName: input.brandName ?? null,
    description: input.description ?? null,
    descriptionEn: input.descriptionEn ?? null,
    descriptionTh: input.descriptionTh ?? null,
    id: null,
    productUrl: input.productUrl,
    sourceSnapshot: input.sourceSnapshot ?? null,
    title: input.productTitle,
    titleEn: input.productTitleEn ?? null,
    titleTh: input.productTitleTh ?? null
  };
}

function resultFromParsed(
  parsed: Record<string, unknown>,
  completion: GrokChatCompletion,
  locale: LocaleCode
): ProductCopyTranslationResult {
  const title = textOrNull(parsed.title, 500);
  const description = textOrNull(parsed.description, 1600);

  return {
    description,
    descriptionEn: locale === "en" ? description : null,
    descriptionTh: locale === "th" ? description : null,
    locale,
    notes: textOrNull(parsed.notes, 1000),
    responseId: completion.id,
    title,
    titleEn: locale === "en" ? title : null,
    titleTh: locale === "th" ? title : null
  };
}

async function callGrok(input: Readonly<{
  product: ProductForCopyTranslation;
  targetLocale?: LocaleCode | null;
}>) {
  const grok = config();
  const targetLocale = normalizeLocaleCode(input.targetLocale) ?? "th";

  const completion = await callGrokChatCompletion({
    apiKey: grok.apiKey,
    maxTokens: 1400,
    messages: [
      {
        content: [
              `You normalize product catalogue copy for MattaNutra in locale ${targetLocale}.`,
              "This is internal product catalogue cleanup, not medical advice and not ingredient fact extraction.",
              "Return JSON only. No markdown and no prose outside JSON.",
              "Return exactly one root JSON object with keys: title, description, notes.",
              "Use the manufacturer's source page as authority. Product data may be in Thai, English, or mixed language.",
              "Write title and description naturally in the target locale only.",
              "For zh-CN, use Simplified Chinese with natural spacing and preserve expected Latin abbreviations such as CoQ10, D3, B12, IU, mg, DHA, EPA, ALA, Plus, and +.",
              "For en, use concise English catalogue wording.",
              "For th, use natural Thai catalogue wording.",
              "If the source explicitly contains a product name in the target locale, use that exact product name except for whitespace and HTML entity cleanup.",
              "If no explicit product name exists in the target locale, create a natural display title by translating or transliterating the best available product title.",
              "Do not return null for title when an English, Thai, Chinese, or mixed-language product title exists.",
              "For Thai titles, use common Thai brand spellings where applicable: Blackmores = แบลคมอร์ส, DHC = ดีเอชซี, Vistra = วิสทร้า, Swisse = สวิสส์, Mega We Care = เมก้า วี แคร์.",
              "Preserve meaningful Latin abbreviations and dose markers in titles when readers expect them, such as CoQ10, D3, B12, IU, mg, DHA, EPA, ALA, Plus, and +.",
              "For description, write a concise neutral catalogue description in the target locale from source evidence only.",
              "A faithful translation of source evidence is allowed and is not considered invention.",
              "Do not return null for a description when the supplied evidence contains a product name, product category, pack information, or regulatory description; use a minimal neutral description such as '<product> is a Mega We Care supplement product.' when no richer purpose text exists.",
              "Do not invent ingredients, doses, FDA numbers, warnings, or claims.",
              "Do not include dose tables in descriptions. Ingredient doses belong in canonical facts, not copy fields.",
              "If a field cannot be supported from the supplied evidence, return null for that field.",
              "Return only the requested target locale for user-facing copy. Do not return parallel English/Thai/Chinese copies or localized maps.",
              "Keep notes short and admin-facing, explaining the source used or why a field is null."
        ].join("\n"),
        role: "system"
      },
      {
        content: JSON.stringify(
              {
                output: {
                  description: "neutral target-locale display description or null",
                  notes: "short admin-facing notes",
                  title: "target-locale product title or null"
                },
                product: {
                  brandName: input.product.brandName,
                  currentDescription: input.product.description,
                  currentDescriptionEn: input.product.descriptionEn,
                  currentDescriptionTh: input.product.descriptionTh,
                  currentTitle: input.product.title,
                  currentTitleEn: input.product.titleEn,
                  currentTitleTh: input.product.titleTh,
                  productUrl: input.product.productUrl,
                  sourceSnapshot: compactJson(input.product.sourceSnapshot)
                }
              },
              null,
              2
        ),
        role: "user"
      }
    ],
    model: grok.model,
    purpose: "product copy translation",
    reasoningEffort: grok.reasoningEffort,
    temperature: 0.1,
    timeoutMs: REQUEST_TIMEOUT_MS
  });

  await recordXaiUsageCost({
    metadata: {
      locale: targetLocale,
      outputLocaleMode: "single_display_locale",
      productId: input.product.id,
      productTitle: input.product.title,
      productUrl: input.product.productUrl,
      targetLocale
    },
    model: completion.model ?? grok.model,
    purpose: "product_copy_translation",
    reasoningEffort: grok.reasoningEffort,
    responseId: completion.id,
    usage: completion.usage
  });

  return completion;
}

export async function translateDraftProductCopyWithAi(
  input: ProductCopyTranslationDraftInput
): Promise<ProductCopyTranslationResult> {
  const product = productFromDraft(input);
  const targetLocale = normalizeLocaleCode(input.targetLocale) ?? "th";
  const completion = await callGrok({ product, targetLocale });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);

  return resultFromParsed(parsed, completion, targetLocale);
}

export async function translateProductCopyWithAi(input: Readonly<{
  actor?: string | null;
  productId: string;
  targetLocale?: LocaleCode | null;
}>): Promise<ProductCopyTranslationUpdateResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const product = await loadProduct(sql, input.productId);
  const targetLocale = normalizeLocaleCode(input.targetLocale) ?? "th";
  const completion = await callGrok({ product, targetLocale });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const copy = resultFromParsed(parsed, completion, targetLocale);
  const usesLegacyFields = targetLocale === "en" || targetLocale === "th";
  const translatedTitle =
    copy.title ??
    (usesLegacyFields && targetLocale === "en" ? copy.titleEn : null) ??
    (usesLegacyFields && targetLocale === "th" ? copy.titleTh : null);
  const translatedDescription =
    copy.description ??
    (usesLegacyFields && targetLocale === "en" ? copy.descriptionEn : null) ??
    (usesLegacyFields && targetLocale === "th" ? copy.descriptionTh : null);
  const row = await updateAdminProduct({
    actor: input.actor ?? "product_copy_translation",
    changeNote: "product_copy_translation",
    descriptionEn: targetLocale === "en"
      ? copy.description ?? copy.descriptionEn ?? product.descriptionEn
      : copy.descriptionEn ?? product.descriptionEn,
    descriptionTh: targetLocale === "th"
      ? copy.description ?? copy.descriptionTh ?? product.descriptionTh
      : copy.descriptionTh ?? product.descriptionTh,
    id: input.productId,
    sourceSnapshotPatch: {
      aiCopyTranslation: {
        [targetLocale]: {
          notes: copy.notes,
          responseId: copy.responseId ?? null,
          translatedAt: new Date().toISOString()
        }
      }
    },
    titleEn: targetLocale === "en"
      ? copy.title ?? copy.titleEn ?? product.titleEn
      : copy.titleEn ?? product.titleEn,
    titleTh: targetLocale === "th"
      ? copy.title ?? copy.titleTh ?? product.titleTh
      : copy.titleTh ?? product.titleTh,
    translations: {
      [targetLocale]: {
        description: translatedDescription,
        status: translatedTitle && translatedDescription
          ? "complete"
          : translatedTitle || translatedDescription
            ? "draft"
            : "missing",
        title: translatedTitle
      }
    }
  });

  return { copy, row };
}
