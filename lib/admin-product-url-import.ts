import {
  createAdminProduct,
  type AdminProductRow,
  type ProductImportFactInput,
  type ProductTranslationInput
} from "@/lib/admin-products";
import { extractTrustedIdentifierEvidence } from "@/lib/product-identifiers";
import type { ProductIdentifierInput } from "@/lib/product-identifiers";
import { enrichDraftProductCatalogueWithAi } from "@/lib/product-fact-correction";
import type { ProductAudience } from "@/lib/product-recommendations";
import type { ProductCountryPricing } from "@/lib/product-countries";

const FETCH_TIMEOUT_MS = 35_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_AI_TEXT_CHARS = 18_000;

type JsonRecord = Record<string, unknown>;

export type ProductUrlPageDraft = Readonly<{
  brandName: string | null;
  description: string | null;
  htmlTitle: string | null;
  imageUrls: string[];
  jsonLdProduct: JsonRecord | null;
  pageText: string | null;
  price: {
    amount: number;
    currency: string;
  } | null;
  title: string;
}>;

export type AdminProductUrlImportResult = Readonly<{
  row: AdminProductRow;
  warnings: string[];
}>;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const parsed = Number(code);

      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    });
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function absoluteUrl(value: unknown, sourceUrl: string) {
  const raw = cleanText(value, 2000);

  if (!raw || /^data:/i.test(raw)) {
    return null;
  }

  try {
    const url = new URL(decodeHtmlEntities(raw), sourceUrl);

    return /^https?:$/i.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function attributeValue(attributes: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(
    new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i")
  );

  return match ? decodeHtmlEntities(match[1] ?? "") : null;
}

function metaContent(html: string, keys: readonly string[]) {
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const key = cleanText(
      attributeValue(attributes, "property") ??
        attributeValue(attributes, "name") ??
        attributeValue(attributes, "itemprop"),
      160
    )?.toLowerCase();

    if (key && keys.includes(key)) {
      const content = cleanText(attributeValue(attributes, "content"), 4000);

      if (content) {
        return content;
      }
    }
  }

  return null;
}

function titleFromHtml(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return match ? cleanText(stripTags(match[1] ?? ""), 500) : null;
}

function pageTextFromHtml(html: string) {
  const text = stripTags(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
  );

  return cleanText(text, MAX_AI_TEXT_CHARS);
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (!isRecord(value)) {
    return [];
  }

  const graph = Array.isArray(value["@graph"]) ? flattenJsonLd(value["@graph"]) : [];

  return [value, ...graph];
}

function jsonLdRecordsFromHtml(html: string) {
  const records: unknown[] = [];

  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      records.push(...flattenJsonLd(JSON.parse(decodeHtmlEntities(match[1] ?? ""))));
    } catch {
      // Page metadata is best effort; visible text and meta tags still help.
    }
  }

  return records;
}

function recordTypes(record: JsonRecord) {
  const raw = record["@type"];
  const values = Array.isArray(raw) ? raw : [raw];

  return values.flatMap((value) =>
    typeof value === "string" ? [value.toLowerCase()] : []
  );
}

export function jsonLdProductRecordsFromHtml(html: string) {
  return jsonLdRecordsFromHtml(html).filter((record): record is JsonRecord =>
    isRecord(record) && recordTypes(record).includes("product")
  );
}

function textFromStructuredValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value), 800);
  }

  if (Array.isArray(value)) {
    return value.map(textFromStructuredValue).find(Boolean) ?? null;
  }

  if (isRecord(value)) {
    return textFromStructuredValue(value.name);
  }

  return null;
}

function imageUrlsFromStructuredValue(value: unknown, sourceUrl: string) {
  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => {
    if (typeof item === "string") {
      const url = absoluteUrl(item, sourceUrl);

      return url ? [url] : [];
    }

    if (isRecord(item)) {
      const url = absoluteUrl(item.url ?? item.contentUrl, sourceUrl);

      return url ? [url] : [];
    }

    return [];
  });
}

function imageUrlsFromHtml(html: string, sourceUrl: string, product: JsonRecord | null) {
  const candidates = [
    ...imageUrlsFromStructuredValue(product?.image, sourceUrl),
    metaContent(html, ["og:image", "twitter:image"]),
    ...[...html.matchAll(/<img\b([^>]*)>/gi)].flatMap((match) => {
      const attributes = match[1] ?? "";
      return [
        attributeValue(attributes, "src"),
        attributeValue(attributes, "data-src"),
        attributeValue(attributes, "data-original"),
        attributeValue(attributes, "data-zoom-image")
      ];
    })
  ].flatMap((candidate) => {
    const url = absoluteUrl(candidate, sourceUrl);

    return url ? [url] : [];
  });

  return [...new Set(candidates)]
    .filter((url) => !/(?:logo|sprite|favicon|placeholder|transparent)/i.test(url))
    .slice(0, 12);
}

function amountFromPrice(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(String(value).replace(/[, ]/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function priceFromProduct(product: JsonRecord | null, html: string) {
  const offers = product?.offers;
  const offerRecord = Array.isArray(offers)
    ? offers.find(isRecord)
    : isRecord(offers)
      ? offers
      : null;
  const amount = amountFromPrice(offerRecord?.price) ??
    amountFromPrice(metaContent(html, ["product:price:amount", "og:price:amount"]));
  const currency = cleanText(
    offerRecord?.priceCurrency ??
      metaContent(html, ["product:price:currency", "og:price:currency"]),
    12
  )?.toUpperCase() ?? "THB";

  return amount !== null ? { amount, currency } : null;
}

function titleFromUrl(url: string) {
  const parsed = new URL(url);
  const slug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ");
  const title = cleanText(slug, 300);

  return title || parsed.hostname.replace(/^www\./i, "");
}

function brandFromUrl(url: string) {
  const hostname = new URL(url).hostname.replace(/^www\./i, "");
  const domain = hostname.split(".").slice(-3, -2)[0] ?? hostname.split(".")[0];

  return cleanText(domain?.replace(/[-_]+/g, " "), 200);
}

export function extractProductUrlPageDraft(input: Readonly<{
  html: string;
  productUrl: string;
}>): ProductUrlPageDraft {
  const product = jsonLdProductRecordsFromHtml(input.html)[0] ?? null;
  const htmlTitle = titleFromHtml(input.html);
  const title = cleanText(
    textFromStructuredValue(product?.name) ??
      metaContent(input.html, ["og:title", "twitter:title"]) ??
      htmlTitle,
    500
  ) ?? titleFromUrl(input.productUrl);
  const description = cleanText(
    textFromStructuredValue(product?.description) ??
      metaContent(input.html, ["description", "og:description", "twitter:description"]),
    4000
  );
  const brandName = cleanText(
    textFromStructuredValue(product?.brand) ??
      metaContent(input.html, ["product:brand", "og:site_name"]),
    200
  ) ?? brandFromUrl(input.productUrl);

  return {
    brandName,
    description,
    htmlTitle,
    imageUrls: imageUrlsFromHtml(input.html, input.productUrl, product),
    jsonLdProduct: product,
    pageText: pageTextFromHtml(input.html),
    price: priceFromProduct(product, input.html),
    title
  };
}

async function fetchTextWithLimit(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    return (await response.text()).slice(0, MAX_HTML_BYTES);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    const remaining = MAX_HTML_BYTES - received;
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
    received += value.length;
  }

  return new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
  );
}

export function normalizedProductImportUrl(value: unknown) {
  const text = cleanText(value, 2000);

  if (!text) {
    throw new Error("Product URL is required");
  }

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter a valid product URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Product URL must be http or https");
  }

  url.hash = "";

  return url.toString();
}

async function fetchProductPage(productUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(productUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "MattaNutraProductAdmin/1.0 (+https://mattanutra.com)"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Product page returned HTTP ${response.status}`);
    }

    return await fetchTextWithLimit(response);
  } finally {
    clearTimeout(timeout);
  }
}

function identifierInputsFromHtml(input: Readonly<{
  html: string | null;
  productUrl: string;
  snapshot: unknown;
}>): ProductIdentifierInput[] {
  const evidence = extractTrustedIdentifierEvidence({
    evidenceUrl: input.productUrl,
    html: input.html,
    snapshot: input.snapshot
  });

  return evidence
    .filter((item) => Boolean((item as { autoApprove?: boolean }).autoApprove))
    .map((item) => ({
      confidence: item.confidence,
      evidenceUrl: item.evidenceUrl,
      source: item.source,
      type: item.type,
      value: item.value
    }));
}

function translationsForTitle(input: Readonly<{
  description: string | null;
  title: string;
}>): Record<string, ProductTranslationInput> {
  return {
    en: {
      description: input.description,
      status: "draft",
      title: input.title
    }
  };
}

function countryPricingFromPrice(
  price: ProductUrlPageDraft["price"]
): ProductCountryPricing[] | undefined {
  return price
    ? [{
        countryCode: "TH",
        currency: price.currency,
        priceUpdatedAt: null,
        rrpPriceAmount: price.amount
      }]
    : undefined;
}

export async function createAdminProductFromUrl(input: Readonly<{
  actor?: string | null;
  productUrl: string;
}>): Promise<AdminProductUrlImportResult> {
  const productUrl = normalizedProductImportUrl(input.productUrl);
  const warnings: string[] = [];
  let html: string | null = null;

  try {
    html = await fetchProductPage(productUrl);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Unable to fetch product page"
    );
  }

  const draft = html
    ? extractProductUrlPageDraft({ html, productUrl })
    : {
        brandName: brandFromUrl(productUrl),
        description: null,
        htmlTitle: null,
        imageUrls: [],
        jsonLdProduct: null,
        pageText: null,
        price: null,
        title: titleFromUrl(productUrl)
      } satisfies ProductUrlPageDraft;
  let aiFacts: ProductImportFactInput[] = [];
  let productAudience: ProductAudience = "both";
  let aiNotes: string | null = null;
  let aiResponseId: string | undefined;
  const sourceSnapshot = {
    adminUrlImport: {
      fetchedAt: new Date().toISOString(),
      htmlTitle: draft.htmlTitle,
      pageText: draft.pageText,
      productUrl
    },
    imageUrls: draft.imageUrls,
    jsonLdProduct: draft.jsonLdProduct,
    price: draft.price
  };

  try {
    const enrichment = await enrichDraftProductCatalogueWithAi({
      brandName: draft.brandName,
      description: draft.description,
      imageUrls: draft.imageUrls,
      productTitle: draft.title,
      productUrl,
      sourceSnapshot
    });

    aiFacts = enrichment.facts;
    productAudience = enrichment.productAudience;
    aiNotes = enrichment.notes;
    aiResponseId = enrichment.responseId;
    warnings.push(...enrichment.warnings);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `AI enrichment failed: ${error.message}`
        : "AI enrichment failed"
    );
  }

  const finalSnapshot = {
    ...sourceSnapshot,
    aiCatalogueEnrichment: {
      notes: aiNotes,
      responseId: aiResponseId,
      warnings
    }
  };
  const identifiers = identifierInputsFromHtml({
    html,
    productUrl,
    snapshot: finalSnapshot
  });
  const row = await createAdminProduct({
    actor: input.actor ?? "admin_dashboard",
    brandName: draft.brandName,
    brandStatus: "pending_review",
    countryPricing: countryPricingFromPrice(draft.price),
    currency: draft.price?.currency ?? "THB",
    description: draft.description,
    facts: aiFacts,
    identifiers: identifiers.length > 0 ? identifiers : undefined,
    imageUrl: draft.imageUrls[0] ?? null,
    labelStatus: aiFacts.length > 0 ? "parsed" : "missing",
    platform: "manual",
    productAudience,
    productKind: "supplement",
    productUrl,
    region: "TH",
    replaceFacts: true,
    source: "admin_url_ai_import",
    sourceSnapshot: finalSnapshot,
    sourceUrl: productUrl,
    status: "pending_review",
    title: draft.title,
    translations: translationsForTitle({
      description: draft.description,
      title: draft.title
    })
  });

  return {
    row,
    warnings: [...new Set(warnings)].slice(0, 8)
  };
}
