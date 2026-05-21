import { getSql } from "@/lib/db";
import { recordXaiUsageCost } from "@/lib/finance-ledger";
import {
  updateAdminProduct,
  type AdminProductRow
} from "@/lib/admin-products";

type XaiChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  id?: string;
  model?: string;
  usage?: unknown;
};

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
}>;

export type ProductCopyTranslationResult = Readonly<{
  descriptionEn: string | null;
  descriptionTh: string | null;
  notes: string | null;
  responseId?: string;
  titleEn: string | null;
  titleTh: string | null;
}>;

export type ProductCopyTranslationUpdateResult = Readonly<{
  copy: ProductCopyTranslationResult;
  row: AdminProductRow;
}>;

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEFAULT_REASONING_EFFORT = "low";
const REQUEST_TIMEOUT_MS = 120_000;

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

function config() {
  const apiKey = configured(process.env.XAI_API_KEY);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return {
    apiKey,
    model: configured(process.env.GROK_MODEL) || DEFAULT_GROK_MODEL,
    reasoningEffort:
      configured(process.env.PRODUCT_COPY_TRANSLATION_REASONING_EFFORT) ||
      configured(process.env.PRODUCT_FACT_CORRECTION_REASONING_EFFORT) ||
      configured(process.env.FORMULATION_REASONING_EFFORT) ||
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
  completion: XaiChatCompletion
): ProductCopyTranslationResult {
  return {
    descriptionEn: textOrNull(parsed.descriptionEn, 1600),
    descriptionTh: textOrNull(parsed.descriptionTh, 1600),
    notes: textOrNull(parsed.notes, 1000),
    responseId: completion.id,
    titleEn: textOrNull(parsed.titleEn, 500),
    titleTh: textOrNull(parsed.titleTh, 500)
  };
}

async function callGrok(input: Readonly<{
  product: ProductForCopyTranslation;
}>) {
  const grok = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages: [
          {
            content: [
              "You normalize bilingual product catalogue copy for MattaNutra.",
              "This is internal product catalogue cleanup, not medical advice and not ingredient fact extraction.",
              "Return JSON only. No markdown and no prose outside JSON.",
              "Return exactly one root JSON object with keys: titleEn, titleTh, descriptionEn, descriptionTh, notes.",
              "Use the manufacturer's source page as authority. Product data may be in Thai, English, or mixed language.",
              "If the source explicitly contains an English product name, use that exact product name except for whitespace and HTML entity cleanup.",
              "If the source explicitly contains a Thai product name, use that exact Thai product name except for whitespace cleanup.",
              "For descriptionEn, write a concise neutral catalogue description in English from source evidence only; if the evidence is Thai-only, translate or lightly summarize that Thai evidence into English.",
              "For descriptionTh, write the equivalent concise Thai catalogue description when Thai source evidence exists; if the evidence is English-only, translate or lightly summarize that English evidence into Thai.",
              "A faithful translation of source evidence is allowed and is not considered invention.",
              "Do not return null for a description when the supplied evidence contains a product name, product category, pack information, or regulatory description; use a minimal neutral description such as '<product> is a Mega We Care supplement product.' when no richer purpose text exists.",
              "Do not invent ingredients, doses, FDA numbers, warnings, or claims.",
              "Do not include dose tables in descriptions. Ingredient doses belong in canonical facts, not copy fields.",
              "If a field cannot be supported from the supplied evidence, return null for that field.",
              "Keep notes short and admin-facing, explaining the source used or why a field is null."
            ].join("\n"),
            role: "system"
          },
          {
            content: JSON.stringify(
              {
                output: {
                  descriptionEn: "neutral English display description or null",
                  descriptionTh: "neutral Thai display description or null",
                  notes: "short admin-facing notes",
                  titleEn: "English product title or null",
                  titleTh: "Thai product title or null"
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
        max_tokens: 1400,
        reasoning_effort: grok.reasoningEffort,
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0.1
      }),
      headers: {
        Authorization: `Bearer ${grok.apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `xAI product copy translation failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    const completion = (await response.json()) as XaiChatCompletion;
    await recordXaiUsageCost({
      metadata: {
        productId: input.product.id,
        productTitle: input.product.title,
        productUrl: input.product.productUrl
      },
      model: completion.model ?? grok.model,
      purpose: "product_copy_translation",
      reasoningEffort: grok.reasoningEffort,
      responseId: completion.id,
      usage: completion.usage
    });

    return completion;
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateDraftProductCopyWithAi(
  input: ProductCopyTranslationDraftInput
): Promise<ProductCopyTranslationResult> {
  const product = productFromDraft(input);
  const completion = await callGrok({ product });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);

  return resultFromParsed(parsed, completion);
}

export async function translateProductCopyWithAi(input: Readonly<{
  actor?: string | null;
  productId: string;
}>): Promise<ProductCopyTranslationUpdateResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const product = await loadProduct(sql, input.productId);
  const completion = await callGrok({ product });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const copy = resultFromParsed(parsed, completion);
  const row = await updateAdminProduct({
    actor: input.actor ?? "product_copy_translation",
    changeNote: "product_copy_translation",
    descriptionEn: copy.descriptionEn ?? product.descriptionEn,
    descriptionTh: copy.descriptionTh ?? product.descriptionTh,
    id: input.productId,
    sourceSnapshotPatch: {
      aiCopyTranslation: {
        notes: copy.notes,
        responseId: copy.responseId ?? null,
        translatedAt: new Date().toISOString()
      }
    },
    titleEn: copy.titleEn ?? product.titleEn,
    titleTh: copy.titleTh ?? product.titleTh
  });

  return { copy, row };
}
