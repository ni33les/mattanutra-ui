import { getSql } from "@/lib/db";
import { recordXaiUsageCost } from "@/lib/finance-ledger";
import {
  updateAdminProduct,
  type AdminProductRow,
  type ProductImportFactInput
} from "@/lib/admin-products";
import {
  normalizeProductFactKey,
  normalizeProductFactName,
  productFactAliasKeys,
  type ProductAudience,
  type ProductConfidence
} from "@/lib/product-recommendations";

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

type ProductForCorrection = Readonly<{
  brandName: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  facts: unknown;
  id: string | null;
  productAudience: ProductAudience;
  productUrl: string;
  sourceSnapshot: unknown;
  title: string;
  titleEn: string | null;
  titleTh: string | null;
}>;

type CanonicalSupplementForCorrection = Readonly<{
  aliases: string[];
  category: string;
  id: string;
  listStatus: string;
  maxAmount: number | null;
  maxUnit: string | null;
  name: string;
  normalizedAliases: string[];
  normalizedName: string;
}>;

export type ProductFactCorrectionResult = Readonly<{
  correction: {
    facts: ProductImportFactInput[];
    notes: string | null;
    productAudience: ProductAudience;
    responseId?: string;
  };
  reviewRequired?: boolean;
  row: AdminProductRow;
}>;

export type ProductFactCorrectionDraftInput = Readonly<{
  brandName?: string | null;
  currentFacts?: unknown;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  productTitle: string;
  productTitleEn?: string | null;
  productTitleTh?: string | null;
  productUrl: string;
  productAudience?: ProductAudience | null;
  sourceSnapshot?: unknown;
}>;

export type ProductFactCorrectionDraftResult = Readonly<{
  facts: ProductImportFactInput[];
  notes: string | null;
  productAudience: ProductAudience;
  responseId?: string;
}>;

export type ProductCatalogueEnrichmentDraftInput = Readonly<{
  brandName?: string | null;
  currentFacts?: unknown;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  imageUrls?: readonly string[];
  productTitle: string;
  productTitleEn?: string | null;
  productTitleTh?: string | null;
  productUrl: string;
  productAudience?: ProductAudience | null;
  sourceSnapshot?: unknown;
}>;

export type ProductCatalogueEnrichmentDraftResult = Readonly<{
  descriptionEn: string | null;
  descriptionTh: string | null;
  facts: ProductImportFactInput[];
  notes: string | null;
  productAudience: ProductAudience;
  responseId?: string;
  titleEn: string | null;
  titleTh: string | null;
  warnings: string[];
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
      configured(process.env.PRODUCT_FACT_CORRECTION_REASONING_EFFORT) ||
      configured(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function confidenceValue(value: unknown): ProductConfidence {
  if (value === "high" || value === "low" || value === "moderate") {
    return value;
  }

  return "moderate";
}

function productAudienceValue(value: unknown): ProductAudience {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")
    : "";

  if (
    normalized === "male" ||
    normalized === "men" ||
    normalized === "mens" ||
    normalized === "male_only" ||
    normalized === "men_only" ||
    normalized === "for_men"
  ) {
    return "male";
  }

  if (
    normalized === "female" ||
    normalized === "women" ||
    normalized === "womens" ||
    normalized === "female_only" ||
    normalized === "women_only" ||
    normalized === "for_women"
  ) {
    return "female";
  }

  return "both";
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

function compactJson(value: unknown, max = 18_000) {
  const json = JSON.stringify(value ?? null, null, 2);

  return json.length > max ? `${json.slice(0, max)}\n[truncated]` : json;
}

async function loadProduct(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string
) {
  const rows = await sql<ProductForCorrection[]>`
    select
      products.id::text,
      products.title,
      products.title_en as "titleEn",
      products.title_th as "titleTh",
      products.brand_name as "brandName",
      coalesce(to_jsonb(products) ->> 'product_audience', 'both') as "productAudience",
      products.product_url as "productUrl",
      products.description,
      products.description_en as "descriptionEn",
      products.description_th as "descriptionTh",
      products.source_snapshot as "sourceSnapshot",
      coalesce(fact_rows.facts, '[]'::jsonb) as facts
    from public.products
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', product_facts.name,
            'amount', product_facts.amount,
            'unit', product_facts.unit,
            'confidence', product_facts.confidence,
            'source', product_facts.source,
            'sourceUrl', product_facts.source_url,
            'sourceText', product_facts.source_text
          )
          order by product_facts.created_at asc
        ),
        '[]'::jsonb
      ) as facts
      from public.product_facts
      where product_facts.product_id = products.id
    ) fact_rows on true
    where products.id = ${productId}::uuid
    limit 1
  `;

  const row = rows[0];

  if (!row) {
    throw new Error("Product not found");
  }

  return {
    brandName: row.brandName,
    description: row.description,
    descriptionEn: row.descriptionEn,
    descriptionTh: row.descriptionTh,
    facts: row.facts,
    id: row.id,
    productAudience: productAudienceValue(row.productAudience),
    productUrl: row.productUrl,
    sourceSnapshot: row.sourceSnapshot,
    title: row.title,
    titleEn: row.titleEn,
    titleTh: row.titleTh
  };
}

async function loadCanonicalSupplements(
  sql: NonNullable<ReturnType<typeof getSql>>
) {
  const rows = await sql<Array<{
    aliases: string[];
    category: string;
    id: string;
    list_status: string;
    max_amount: string | number | null;
    max_unit: string | null;
    name: string;
    normalized_aliases: string[];
    normalized_name: string;
  }>>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      safety.max_amount,
      safety.max_unit,
      coalesce(
        array_agg(distinct supplement_aliases.alias)
          filter (where supplement_aliases.alias is not null),
        '{}'::text[]
      ) as aliases,
      coalesce(
        array_agg(distinct supplement_aliases.normalized_alias)
          filter (where supplement_aliases.normalized_alias is not null),
        '{}'::text[]
      ) as normalized_aliases
    from public.supplements
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    left join lateral (
      select max_amount, max_unit
      from public.supplement_safety_limits
      where supplement_safety_limits.supplement_id = supplements.id
      order by version desc, updated_at desc
      limit 1
    ) safety on true
    where supplements.is_active = true
      and supplements.list_status in ('active', 'blocked')
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      safety.max_amount,
      safety.max_unit
    order by
      case supplements.list_status
        when 'active' then 0
        else 2
      end,
      supplements.name
    limit 260
  `;

  return rows.map((row): CanonicalSupplementForCorrection => ({
    aliases: row.aliases ?? [],
    category: row.category,
    id: row.id,
    listStatus: row.list_status,
    maxAmount:
      row.max_amount === null || row.max_amount === undefined
        ? null
        : Number(row.max_amount),
    maxUnit: row.max_unit,
    name: row.name,
    normalizedAliases: row.normalized_aliases ?? [],
    normalizedName: row.normalized_name
  }));
}

function canonicalLookup(catalogue: readonly CanonicalSupplementForCorrection[]) {
  const byId = new Map(catalogue.map((item) => [item.id, item]));
  const byKey = new Map<string, CanonicalSupplementForCorrection>();

  for (const item of catalogue) {
    const seeds = [
      item.normalizedName,
      normalizeProductFactKey(item.name),
      ...item.normalizedAliases,
      ...item.aliases.map((alias) => normalizeProductFactKey(alias))
    ].filter(Boolean);
    const keys = seeds.flatMap((seed) => productFactAliasKeys(seed));

    for (const key of keys) {
      if (key && !byKey.has(key)) {
        byKey.set(key, item);
      }
    }
  }

  return { byId, byKey };
}

function findCanonical(
  rawName: string,
  supplementId: string | null,
  lookup: ReturnType<typeof canonicalLookup>
) {
  if (supplementId) {
    const byId = lookup.byId.get(supplementId);

    if (byId) {
      return byId;
    }
  }

  const keys = productFactAliasKeys(rawName);

  return keys
    .map((key) => lookup.byKey.get(key))
    .find(Boolean) ?? null;
}

function sanitizedFacts(
  parsed: Record<string, unknown>,
  catalogue: readonly CanonicalSupplementForCorrection[]
) {
  const lookup = canonicalLookup(catalogue);
  const seen = new Map<string, ProductImportFactInput>();
  const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];

  for (const rawFact of rawFacts) {
    if (!rawFact || typeof rawFact !== "object") {
      continue;
    }

    const payload = rawFact as Record<string, unknown>;
    const rawName = textOrNull(payload.name, 240) ?? "";
    const normalizedName = normalizeProductFactName(rawName) || rawName.trim();

    if (!normalizedName) {
      continue;
    }

    const requestedSupplementId = textOrNull(payload.supplementId, 80);
    const canonical = findCanonical(normalizedName, requestedSupplementId, lookup);
    const unit = textOrNull(payload.unit, 40);
    const concentrationUnit = Boolean(unit && /(?:\/|\bper\b)/i.test(unit));
    const evidenceSource = textOrNull(payload.evidenceSource, 80);
    const sourceText = textOrNull(payload.sourceText, 900);
    const fact: ProductImportFactInput = {
      amount: concentrationUnit ? null : numberOrNull(payload.amount),
      confidence: concentrationUnit ? "low" : confidenceValue(payload.confidence),
      itemType: "supplement",
      name: canonical?.name ?? normalizedName,
      sourceText: [evidenceSource, sourceText].filter(Boolean).join(": ") || null,
      supplementId: canonical?.id ?? null,
      unit: concentrationUnit ? null : unit
    };
    const key = fact.supplementId ?? normalizeProductFactKey(fact.name);
    const current = seen.get(key);

    if (
      !current ||
      (current.amount === null && fact.amount !== null) ||
      (current.confidence === "low" && fact.confidence !== "low")
    ) {
      seen.set(key, fact);
    }
  }

  return [...seen.values()];
}

async function callGrok(input: Readonly<{
  allowPublicKnowledgeFallback?: boolean;
  catalogue: readonly CanonicalSupplementForCorrection[];
  product: ProductForCorrection;
  purpose?: string;
}>) {
  const grok = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const fallbackInstructions = input.allowPublicKnowledgeFallback
    ? [
      "Fallback mode is enabled because deterministic page parsing and strict correction did not produce usable facts.",
      "You may use well-known public manufacturer/product knowledge together with the supplied product URL, title, and page text to propose likely active ingredients.",
      "Only include a dose when you are confident it is the product's per serving, per tablet, per capsule, or per daily dose amount.",
      "When dose is uncertain, include the active ingredient with amount null and unit null.",
      "Use low confidence unless the supplied source evidence or widely published label data clearly supports both identity and dose.",
      "These fallback facts are review-required and must not be treated as approved without human review."
    ]
    : [
      "Never invent ingredients or doses that are not supported by the supplied product page data."
    ];

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages: [
          {
            content: [
              "You correct product label facts for MattaNutra's supplement product catalogue.",
              "This is internal catalogue cleanup for product matching, not customer advice.",
              "Return JSON only. No markdown and no prose outside JSON.",
              "Return exactly one root JSON object with keys: facts, notes, productAudience.",
              "facts must be an array of objects with keys: name, supplementId, amount, unit, confidence.",
              "productAudience must be one of: both, male, female.",
              "Default productAudience to both unless the product is clearly sex-specific from title, label, description, or usage context.",
              "Set productAudience female for products clearly aimed at women, conception support for women, pregnancy, breastfeeding, menopause, prenatal or postnatal support.",
              "Set productAudience male for products clearly aimed at men, male fertility, prostate, testosterone, or men's-only formulas.",
              "Use canonicalSupplementCatalogue as the preferred vocabulary. When a listed canonical supplement fits, set name exactly to its canonical name and supplementId exactly to its id.",
              "Use aliases to recognize equivalent ingredients, salts, forms and common label names.",
              "Product data may be in English, Thai, or another local language. Translate ingredient identity into the canonical English supplement name where the catalogue supports it.",
              "Correct noisy names by removing dose text, percentages, carrier/concentration text, table artifacts and marketing copy.",
              "Do not treat concentrations such as 'Vitamin D3 100000 IU/g', percentages, blend strengths, excipients, flavours, capsule shell ingredients, colours or preservatives as usable per-serving facts.",
              "Only set amount and unit when the label gives a per tablet, per capsule, per serving, per daily dose, or clearly equivalent product dose.",
              "If the product clearly contains an active ingredient but dose is not available, keep the fact with amount null and unit null.",
              "When structured active ingredient rows are supplied in sourceSnapshot, treat them as the most authoritative source for ingredient identity and dose.",
              "If marketing description claims extra active ingredients that do not appear in structured rows, include them only with null amount/unit and moderate or low confidence.",
              "Recognize PEA, Palmidrol, Levagen+ and palmitoylethanolamide as the same active ingredient family.",
              ...fallbackInstructions,
              "Use confidence high only when both identity and dose are explicit; moderate for clear identity with uncertain dose; low for weak or inferred identity."
            ].join("\n"),
            role: "system"
          },
          {
            content: JSON.stringify(
              {
                canonicalSupplementCatalogue: input.catalogue.map((item) => ({
                  aliases: item.aliases,
                  category: item.category,
                  id: item.id,
                  listStatus: item.listStatus,
                  maxAmount: item.maxAmount,
                  maxUnit: item.maxUnit,
                  name: item.name,
                  normalizedName: item.normalizedName
                })),
                output: {
                  facts: [
                    {
                      amount: "number or null",
                      confidence: "high | moderate | low",
                      name: "canonical supplement name where possible",
                      supplementId: "canonical supplement id where possible, else null",
                      unit: "mg | mcg | IU | g | ml | etc, or null"
                    }
                  ],
                  notes: "short admin-facing summary of what was corrected",
                  productAudience: "both | male | female"
                },
                product: {
                  brandName: input.product.brandName,
                  currentProductAudience: input.product.productAudience,
                  currentFacts: input.product.facts,
                  description: input.product.description,
                  descriptionEn: input.product.descriptionEn,
                  descriptionTh: input.product.descriptionTh,
                  productTitle: input.product.title,
                  productTitleEn: input.product.titleEn,
                  productTitleTh: input.product.titleTh,
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
        max_tokens: 2200,
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
        `xAI product fact correction failed with ${response.status}: ${body.slice(0, 500)}`
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
      purpose: input.purpose ?? "product_fact_correction",
      reasoningEffort: grok.reasoningEffort,
      responseId: completion.id,
      usage: completion.usage
    });

    return completion;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGrokCatalogueEnrichment(input: Readonly<{
  catalogue: readonly CanonicalSupplementForCorrection[];
  imageUrls: readonly string[];
  product: ProductForCorrection;
}>) {
  const grok = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const systemMessage = {
    content: [
      "You enrich a supplement product catalogue for MattaNutra product matching.",
      "This is internal catalogue data extraction, not customer advice.",
      "Return JSON only. No markdown and no prose outside JSON.",
      "Return exactly one root JSON object with keys: titleEn, titleTh, descriptionEn, descriptionTh, facts, productAudience, notes, warnings.",
      "Use the supplied source page, label image URLs, and public manufacturer/product knowledge.",
      "A faithful Thai/English translation or neutral catalogue summary is allowed.",
      "If the source explicitly contains an English product name, use that exact product name except for whitespace and HTML entity cleanup.",
      "If the source explicitly contains a Thai product name, use that exact Thai product name except for whitespace cleanup.",
      "If no explicit Thai product name exists, create a natural Thai display title by translating or transliterating the English product title.",
      "Never return null for titleTh when an English product title exists.",
      "For Thai titles, use common Thai brand spellings where applicable: Blackmores = แบลคมอร์ส, DHC = ดีเอชซี, Vistra = วิสทร้า, Swisse = สวิสส์, Mega We Care = เมก้า วี แคร์.",
      "Preserve meaningful Latin abbreviations and dose markers in titles when Thai readers expect them, such as CoQ10, D3, B12, IU, mg, DHA, EPA, ALA, GABA, ACE, Zinc, Plus, and +.",
      "Do not return null for descriptionEn or descriptionTh when the supplied evidence contains a product name, product category, pack information, regulatory description, or benefit text; use a minimal neutral catalogue description when needed.",
      "Do not make medical treatment claims. Keep descriptions neutral and concise.",
      "Use canonicalSupplementCatalogue as the vocabulary. If a canonical supplement fits, set name and supplementId exactly.",
      "Only produce high confidence when identity and dose are clear from source page, label image/OCR, or well-known manufacturer-public label data.",
      "Set evidenceSource to page_text, label_image, manufacturer_public, or inferred_name_only for every fact.",
      "For manufacturer_public facts, include dose only when you are confident in the per serving, per capsule, per tablet, or per daily dose amount.",
      "Do not treat concentrations like IU/g, percentages, excipients, colours, capsule shells, or flavours as usable product doses.",
      "If the product clearly contains an active but dose is unavailable, keep amount and unit null and confidence low or moderate.",
      "Default productAudience to both unless clearly sex-specific."
    ].join("\n"),
    role: "system"
  };
  const textContent = JSON.stringify(
    {
      canonicalSupplementCatalogue: input.catalogue.map((item) => ({
        aliases: item.aliases,
        category: item.category,
        id: item.id,
        listStatus: item.listStatus,
        maxAmount: item.maxAmount,
        maxUnit: item.maxUnit,
        name: item.name,
        normalizedName: item.normalizedName
      })),
      output: {
        descriptionEn: "short neutral English catalogue description",
        descriptionTh: "short neutral Thai catalogue description",
        facts: [
          {
            amount: "number or null",
            confidence: "high | moderate | low",
            evidenceSource: "page_text | label_image | manufacturer_public | inferred_name_only",
            name: "canonical supplement name where possible",
            sourceText: "short evidence phrase",
            supplementId: "canonical supplement id where possible, else null",
            unit: "mg | mcg | IU | g | billion CFU | etc, or null"
          }
        ],
        notes: "short admin-facing enrichment notes",
        productAudience: "both | male | female",
        titleEn: "English product title",
        titleTh: "Thai product title",
        warnings: ["short warnings if evidence is weak"]
      },
      product: {
        brandName: input.product.brandName,
        currentDescription: input.product.description,
        currentDescriptionEn: input.product.descriptionEn,
        currentDescriptionTh: input.product.descriptionTh,
        currentFacts: input.product.facts,
        currentProductAudience: input.product.productAudience,
        currentTitle: input.product.title,
        currentTitleEn: input.product.titleEn,
        currentTitleTh: input.product.titleTh,
        imageUrls: input.imageUrls,
        productUrl: input.product.productUrl,
        sourceSnapshot: compactJson(input.product.sourceSnapshot, 26_000)
      }
    },
    null,
    2
  );
  const imageParts = input.imageUrls.slice(0, 2).flatMap((url) => {
    if (!/^https?:\/\//i.test(url)) {
      return [];
    }

    return [{
      image_url: { url },
      type: "image_url"
    }];
  });
  const textUserMessage = {
    content: textContent,
    role: "user"
  };
  const visionUserMessage = imageParts.length > 0
    ? {
      content: [
        { text: textContent, type: "text" },
        ...imageParts
      ],
      role: "user"
    }
    : textUserMessage;

  async function request(messages: unknown[]) {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model: grok.model,
        max_tokens: 2600,
        reasoning_effort: grok.reasoningEffort,
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0
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
        `xAI product catalogue enrichment failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    return (await response.json()) as XaiChatCompletion;
  }

  try {
    let imageRetry = false;
    let completion: XaiChatCompletion;

    try {
      completion = await request([systemMessage, visionUserMessage]);
    } catch (error) {
      if (imageParts.length < 1) {
        throw error;
      }

      imageRetry = true;
      completion = await request([systemMessage, textUserMessage]);
    }

    await recordXaiUsageCost({
      metadata: {
        imageRetry,
        productId: input.product.id,
        productTitle: input.product.title,
        productUrl: input.product.productUrl
      },
      model: completion.model ?? grok.model,
      purpose: "product_catalogue_enrichment",
      reasoningEffort: grok.reasoningEffort,
      responseId: completion.id,
      usage: completion.usage
    });

    return completion;
  } finally {
    clearTimeout(timeout);
  }
}

function warningsValue(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((warning) => {
      const text = textOrNull(warning, 300);

      return text ? [text] : [];
    })
    : [];
}

export async function enrichDraftProductCatalogueWithAi(
  input: ProductCatalogueEnrichmentDraftInput
): Promise<ProductCatalogueEnrichmentDraftResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const catalogue = await loadCanonicalSupplements(sql);
  const product: ProductForCorrection = {
    brandName: input.brandName ?? null,
    description: input.description ?? null,
    descriptionEn: input.descriptionEn ?? null,
    descriptionTh: input.descriptionTh ?? null,
    facts: input.currentFacts ?? [],
    id: null,
    productAudience: input.productAudience ?? "both",
    productUrl: input.productUrl,
    sourceSnapshot: input.sourceSnapshot ?? null,
    title: input.productTitle,
    titleEn: input.productTitleEn ?? null,
    titleTh: input.productTitleTh ?? null
  };
  const completion = await callGrokCatalogueEnrichment({
    catalogue,
    imageUrls: input.imageUrls ?? [],
    product
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const facts = sanitizedFacts(parsed, catalogue);

  return {
    descriptionEn: textOrNull(parsed.descriptionEn, 1600),
    descriptionTh: textOrNull(parsed.descriptionTh, 1600),
    facts,
    notes: textOrNull(parsed.notes, 1000),
    productAudience: productAudienceValue(parsed.productAudience),
    responseId: completion.id,
    titleEn: textOrNull(parsed.titleEn, 500),
    titleTh: textOrNull(parsed.titleTh, 500),
    warnings: warningsValue(parsed.warnings)
  };
}

export async function correctDraftProductFactsWithAi(
  input: ProductFactCorrectionDraftInput
): Promise<ProductFactCorrectionDraftResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const catalogue = await loadCanonicalSupplements(sql);
  const product: ProductForCorrection = {
    brandName: input.brandName ?? null,
    description: input.description ?? null,
    descriptionEn: input.descriptionEn ?? null,
    descriptionTh: input.descriptionTh ?? null,
    facts: input.currentFacts ?? [],
    id: null,
    productAudience: input.productAudience ?? "both",
    productUrl: input.productUrl,
    sourceSnapshot: input.sourceSnapshot ?? null,
    title: input.productTitle,
    titleEn: input.productTitleEn ?? null,
    titleTh: input.productTitleTh ?? null
  };
  const completion = await callGrok({ catalogue, product });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const facts = sanitizedFacts(parsed, catalogue);

  if (facts.length < 1) {
    throw new Error("AI returned no usable product facts");
  }

  return {
    facts,
    notes: textOrNull(parsed.notes, 1000),
    productAudience: productAudienceValue(parsed.productAudience),
    responseId: completion.id
  };
}

export async function recoverDraftProductFactsWithAi(
  input: ProductFactCorrectionDraftInput
): Promise<ProductFactCorrectionDraftResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const catalogue = await loadCanonicalSupplements(sql);
  const product: ProductForCorrection = {
    brandName: input.brandName ?? null,
    description: input.description ?? null,
    descriptionEn: input.descriptionEn ?? null,
    descriptionTh: input.descriptionTh ?? null,
    facts: input.currentFacts ?? [],
    id: null,
    productAudience: input.productAudience ?? "both",
    productUrl: input.productUrl,
    sourceSnapshot: input.sourceSnapshot ?? null,
    title: input.productTitle,
    titleEn: input.productTitleEn ?? null,
    titleTh: input.productTitleTh ?? null
  };
  const completion = await callGrok({
    allowPublicKnowledgeFallback: true,
    catalogue,
    product,
    purpose: "product_fact_recovery"
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const facts = sanitizedFacts(parsed, catalogue);

  if (facts.length < 1) {
    throw new Error("AI fallback returned no usable product facts");
  }

  return {
    facts,
    notes: textOrNull(parsed.notes, 1000),
    productAudience: productAudienceValue(parsed.productAudience),
    responseId: completion.id
  };
}

export async function correctProductFactsWithAi(input: Readonly<{
  actor?: string | null;
  productId: string;
}>): Promise<ProductFactCorrectionResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const [product, catalogue] = await Promise.all([
    loadProduct(sql, input.productId),
    loadCanonicalSupplements(sql)
  ]);

  try {
    const completion = await callGrok({ catalogue, product });
    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
    const facts = sanitizedFacts(parsed, catalogue);
    const productAudience = productAudienceValue(parsed.productAudience);

    if (facts.length < 1) {
      throw new Error("AI returned no usable product facts");
    }

    const row = await updateAdminProduct({
      actor: input.actor ?? "ai_product_fact_correction",
      changeNote: "product_ai_fact_correction",
      facts,
      factsSource: "ai_correction",
      id: input.productId,
      labelStatus: "parsed",
      productAudience,
      sourceSnapshotPatch: {
        aiFactCorrection: {
          correctedAt: new Date().toISOString(),
          notes: textOrNull(parsed.notes, 1000),
          productAudience,
          responseId: completion.id
        }
      }
    });

    return {
      correction: {
        facts,
        notes: textOrNull(parsed.notes, 1000),
        productAudience,
        responseId: completion.id
      },
      reviewRequired: row.validation.status !== "pass",
      row
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const row = await updateAdminProduct({
      actor: input.actor ?? "ai_product_fact_correction",
      adminNotes: `AI fact correction needs review: ${message}`,
      changeNote: "product_ai_fact_correction_pending_review",
      id: input.productId,
      labelStatus: "failed",
      status: "pending_review",
      sourceSnapshotPatch: {
        aiFactCorrection: {
          failedAt: new Date().toISOString(),
          notes: message
        }
      }
    });

    return {
      correction: {
        facts: [],
        notes: message,
        productAudience: "both"
      },
      reviewRequired: true,
      row
    };
  }
}
