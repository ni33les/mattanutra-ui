import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJsonValue } from "@/lib/assessment-store";
import { isUuidValue, normalizedUrl } from "@/lib/admin-product-helpers";
import { normalizedFactsForStorage, supplementIdsForFacts } from "@/lib/admin-product-facts";
import { refreshAndPersistProductValidations } from "@/lib/admin-product-writes";
import { closeSqlPool, getSql } from "@/lib/db";
import {
  brandEvidenceMatches,
  imageHostPriority,
  minimumSearchScore,
  viableImageUrl
} from "@/lib/delight-product-image-backfill";
import {
  fetchAndValidateFirstPartyImage,
  firstPartyImageStorageConfigFromEnv,
  mirrorImageToFirstParty
} from "@/lib/first-party-image-mirror";
import { isFirstPartyImageUrl } from "@/lib/first-party-image-rules";
import { replaceApprovedProductIdentifiers } from "@/lib/product-identifiers";
import {
  normalizeCurrencyCode,
  type ProductCountryPricing
} from "@/lib/product-countries";
import {
  normalizeProductFactKey,
  normalizeProductKey,
  type ProductAudience,
  type ProductKind,
  type ProductStatus
} from "@/lib/product-recommendations";
import {
  candidateIsGenericOrUnsafe,
  productImageCandidateScore
} from "@/lib/product-image-repair";
import type { ProductImportFactInput } from "@/lib/admin-products";
import {
  cleanHtmlText,
  imageUrlsFromHtml,
  productJsonLdImagesFromHtml,
  titleFromHtml
} from "../scripts/manufacturer-scrape-html.ts";

type CsvRecord = Record<string, string>;

export type ProductListRolloutEnvironment = "dev" | "uat";

export type ProductListRolloutRow = Readonly<{
  brandName: string;
  canonicalProductId: string;
  csvProductId: string;
  currency: string;
  facts: ProductImportFactInput[];
  ean13Values: string[];
  imageUrls: string[];
  isDhc: boolean;
  isNewAddition: boolean;
  leadTimeDays: number;
  manufacturerSkus: string[];
  productAudience: ProductAudience;
  productKind: ProductKind;
  productUrl: string;
  recordSource: string;
  rowNumber: number;
  rrpAmount: number | null;
  rrpConfidence: string | null;
  selectedRetail: boolean;
  sourceUrl: string;
  status: ProductStatus;
  title: string;
  englishTitle: string | null;
  thaiTitle: string | null;
}>;

export type ProductListRolloutSummary = Readonly<{
  applied: boolean;
  createdProducts: number;
  dhcRows: number;
  dhcSellablesDisabled: number;
  dryRun: boolean;
  environment: ProductListRolloutEnvironment;
  existingRows: number;
  generatedAt: string;
  imagesMirrored: number;
  invalidRows: Array<{ reason: string; rowNumber: number }>;
  newRows: number;
  nonDhcRows: number;
  productRowsUpdated: number;
  reportDirectory: string;
  retailSellablesUpserted: number;
  rows: number;
  stockRowsInserted: number;
  unresolvedImages: Array<{
    csvProductId: string;
    productId: string;
    reason: string;
    title: string;
  }>;
}>;

export type RunProductListRolloutInput = Readonly<{
  apply?: boolean;
  csvPath: string;
  dbUrl?: string | null;
  environment: ProductListRolloutEnvironment;
  imageOverridesPath?: string | null;
  outputDir?: string | null;
}>;

type ExistingProductRow = Readonly<{
  brand_name: string | null;
  id: string;
  image_url: string | null;
  normalized_url: string;
  product_url: string;
  status: string;
  title: string;
  validation_status: string;
}>;

type ImageCandidate = Readonly<{
  evidenceUrl: string | null;
  imageUrl: string;
  score: number;
  source: string;
  sourceTitle: string | null;
}>;

type ImageOverride = Readonly<{
  evidenceUrl: string | null;
  imageUrl: string;
}>;

const ROLLOUT_SOURCE = "product_list_rollout_2026_06";
const DHC_BRAND = "dhc";
const DEFAULT_LEAD_TIME_DAYS = 5;

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values: readonly unknown[]) {
  return values.map(csvCell).join(",");
}

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];

    if (inQuotes) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function splitList(value: string | null | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(/\s*(?:\||;|\n)\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function numberFromText(value: string | null | undefined) {
  const parsed = Number((value ?? "").replace(/,/g, "").trim());

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerFromText(value: string | null | undefined, fallback: number) {
  const parsed = numberFromText(value);

  return parsed === null ? fallback : Math.max(0, Math.round(parsed));
}

function normalizeStatus(value: string | null | undefined): ProductStatus {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  return normalized === "approved" || normalized === "ignored" || normalized === "pending_review"
    ? normalized
    : "pending_review";
}

function normalizeProductKind(value: string | null | undefined): ProductKind {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  return normalized === "food" || normalized === "multi" || normalized === "other" || normalized === "supplement"
    ? normalized
    : "supplement";
}

function normalizeProductAudience(value: string | null | undefined): ProductAudience {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  return normalized === "female" || normalized === "male" || normalized === "both"
    ? normalized
    : "both";
}

function parseFactsSummary(value: string | null | undefined, sourceUrl: string) {
  return splitList(value).flatMap((item): ProductImportFactInput[] => {
    const match = item.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s*([A-Za-zµ]+(?:\s+[A-Za-z]+)?)(?:\s+\[([^\]]+)])?/);
    const fallbackName = item.replace(/\s+\[[^\]]+]\s*$/g, "").trim();

    if (!match) {
      return fallbackName
        ? [{
            confidence: "moderate",
            name: fallbackName,
            sourceText: item,
            sourceUrl
          }]
        : [];
    }

    const [, rawName, rawAmount, rawUnit, rawConfidence] = match;
    const confidence = rawConfidence?.toLowerCase() === "high"
      ? "high"
      : rawConfidence?.toLowerCase() === "low"
        ? "low"
        : "moderate";

    return [{
      amount: Number(rawAmount),
      confidence,
      name: rawName.trim(),
      sourceText: item,
      sourceUrl,
      unit: rawUnit.trim()
    }];
  });
}

function deterministicUuid(name: string) {
  const bytes = createHash("sha256")
    .update("mattanutra-product-list-rollout-v1")
    .update("\0")
    .update(name)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function syntheticNormalizedUrl(csvProductId: string) {
  return `https://mattanutra.com/product-list/${csvProductId.toLowerCase()}`;
}

function imageUrlsFromRow(record: CsvRecord) {
  return [
    record.primary_image_url,
    record.all_image_urls,
    record.import_image_urls,
    record.recommendation_image_urls,
    ...Array.from({ length: 10 }, (_, index) => record[`image_url_${index + 1}`])
  ].flatMap(splitList).filter(Boolean);
}

export function parseProductListRolloutCsv(text: string) {
  const parsed = parseCsv(text);
  const [headerRow, ...dataRows] = parsed;

  if (!headerRow) {
    return { invalidRows: [{ reason: "CSV is empty", rowNumber: 1 }], rows: [] };
  }

  const headers = headerRow.map(normalizeHeader);
  const invalidRows: Array<{ reason: string; rowNumber: number }> = [];
  const rows = dataRows.map((dataRow, index) => {
    const record = Object.fromEntries(
      headers.map((header, cellIndex) => [header, dataRow[cellIndex]?.trim() ?? ""])
    );
    const csvProductId = record.product_id?.trim() ?? "";
    const brandName = cleanText(record.brand_name, 200) ?? "";
    const title = cleanText(record.title, 500) ?? "";
    const productUrl = cleanText(record.product_url || record.source_url, 3000) ?? "";
    const sourceUrl = cleanText(record.source_url || record.product_url, 3000) ?? productUrl;
    const rowNumber = index + 2;
    const isNewAddition = /^MN-ADD-\d+$/i.test(csvProductId);
    const isDhc = brandName.trim().toLowerCase() === DHC_BRAND;
    const rrpAmount = numberFromText(record.delight_rrp_price_amount || record.price_amount);

    if (!csvProductId) invalidRows.push({ reason: "Missing product_id", rowNumber });
    if (!brandName) invalidRows.push({ reason: "Missing brand_name", rowNumber });
    if (!title) invalidRows.push({ reason: "Missing title", rowNumber });
    if (!productUrl) invalidRows.push({ reason: "Missing product_url/source_url", rowNumber });
    if (!isNewAddition && !isUuidValue(csvProductId)) {
      invalidRows.push({ reason: "Existing row product_id must be a UUID", rowNumber });
    }
    if (!isDhc && rrpAmount === null) {
      invalidRows.push({ reason: "Non-DHC row requires numeric RRP", rowNumber });
    }

    const canonicalProductId = isNewAddition
      ? deterministicUuid(csvProductId)
      : csvProductId;

    return {
      brandName,
      canonicalProductId,
      csvProductId,
      currency: normalizeCurrencyCode(record.delight_sellable_currency || record.currency, "THB"),
      ean13Values: splitList(record.active_ean13_values),
      facts: parseFactsSummary(record.facts_summary, sourceUrl),
      imageUrls: imageUrlsFromRow(record),
      isDhc,
      isNewAddition,
      leadTimeDays: integerFromText(record.delight_sellable_lead_time_days || record.delight_stock_lead_time_days, DEFAULT_LEAD_TIME_DAYS),
      manufacturerSkus: splitList(record.active_manufacturer_skus),
      productAudience: normalizeProductAudience(record.product_audience),
      productKind: normalizeProductKind(record.product_kind),
      productUrl,
      recordSource: cleanText(record.record_source, 100) ?? "",
      rowNumber,
      rrpAmount,
      rrpConfidence: cleanText(record.rrp_confidence, 100),
      selectedRetail: !isDhc,
      sourceUrl,
      status: normalizeStatus(record.product_status),
      title,
      englishTitle: cleanText(record.title_en, 500),
      thaiTitle: cleanText(record.title_th, 500)
    } satisfies ProductListRolloutRow;
  });

  const seen = new Map<string, number>();

  for (const row of rows) {
    const previous = seen.get(row.csvProductId);

    if (previous) {
      invalidRows.push({
        reason: `Duplicate product_id also appears on row ${previous}`,
        rowNumber: row.rowNumber
      });
    }

    seen.set(row.csvProductId, row.rowNumber);
  }

  return { invalidRows, rows };
}

export function productListRolloutCounts(rows: readonly ProductListRolloutRow[]) {
  return {
    dhcRows: rows.filter((row) => row.isDhc).length,
    existingRows: rows.filter((row) => !row.isNewAddition).length,
    newRows: rows.filter((row) => row.isNewAddition).length,
    nonDhcRows: rows.filter((row) => !row.isDhc).length,
    rows: rows.length
  };
}

export function productListRolloutRetailPolicy(row: ProductListRolloutRow) {
  return row.isDhc
    ? { disableRetailSellables: true, selectedRetail: false, targetStatus: row.status }
    : { disableRetailSellables: false, selectedRetail: true, targetStatus: "approved" as const };
}

async function loadImageOverrides(inputPath: string | null | undefined) {
  if (!inputPath) {
    return new Map<string, ImageOverride>();
  }

  const { readFile } = await import("node:fs/promises");
  const [headerRow, ...dataRows] = parseCsv(await readFile(inputPath, "utf8"));

  if (!headerRow) {
    return new Map<string, ImageOverride>();
  }

  const headers = headerRow.map(normalizeHeader);
  const overrides = new Map<string, ImageOverride>();

  for (const row of dataRows) {
    const record = Object.fromEntries(
      headers.map((header, cellIndex) => [header, row[cellIndex]?.trim() ?? ""])
    );
    const id = (record.mn_add_id || record.product_id || record.csv_product_id || "").trim();
    const imageUrl = cleanText(record.image_url, 3000);

    if (!id || !imageUrl) {
      continue;
    }

    overrides.set(id, {
      evidenceUrl: cleanText(record.evidence_url || record.source_url || record.product_url, 3000),
      imageUrl
    });
  }

  return overrides;
}

function targetDatabaseName(connection: string) {
  try {
    return new URL(connection).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

export function assertProductListRolloutDatabaseTarget(
  connection: string | undefined,
  environment: ProductListRolloutEnvironment
) {
  if (!connection) {
    throw new Error("DB_URL is required for product list rollout.");
  }

  const database = targetDatabaseName(connection).toLowerCase();

  if (!database || database === "defaultdb" || /(prd|prod)/i.test(database)) {
    throw new Error(`Refusing product list rollout against database ${database || "<unknown>"}.`);
  }

  if (environment === "dev" && !/(^mn-dev$|mattanutra-dev|dev)/i.test(database)) {
    throw new Error(`Expected DEV database, got ${database}.`);
  }

  if (environment === "uat" && !/(^mn-uat$|mattanutra-uat|uat)/i.test(database)) {
    throw new Error(`Expected UAT database, got ${database}.`);
  }
}

async function fetchHtmlPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "th,en-GB;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });

    if (!response.ok || !/html|text/i.test(response.headers.get("content-type") ?? "")) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRemoteImageUrl(url: string) {
  return url.replace(/^http:\/\//i, "https://");
}

async function duckDuckGoImageResults(query: string) {
  const headers = {
    Accept: "text/html",
    "Accept-Language": "th,en-GB;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
  const page = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { headers }
  ).catch(() => null);

  if (!page?.ok) {
    return [];
  }

  const html = await page.text();
  const vqd = html.match(/vqd=["']?([^"'&]+)/)?.[1];

  if (!vqd) {
    return [];
  }

  const response = await fetch(
    `https://duckduckgo.com/i.js?l=th-th&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
    {
      headers: {
        ...headers,
        Accept: "application/json,text/javascript,*/*",
        Referer: "https://duckduckgo.com/"
      }
    }
  ).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as { results?: Array<{
    image?: string;
    thumbnail?: string;
    title?: string;
    url?: string;
  }> } | null;

  return payload?.results ?? [];
}

function candidateText(result: { image?: string; thumbnail?: string; title?: string; url?: string }) {
  return [result.title, result.url, result.image, result.thumbnail].filter(Boolean).join(" ");
}

async function buildImageCandidates(row: ProductListRolloutRow) {
  const directCandidates = row.imageUrls.flatMap((imageUrl): ImageCandidate[] => {
    const viable = viableImageUrl(imageUrl);

    return viable
      ? [{
          evidenceUrl: row.sourceUrl,
          imageUrl: normalizeRemoteImageUrl(viable),
          score: 0.93,
          source: "csv_image_url",
          sourceTitle: row.title
        }]
      : [];
  });
  const pageCandidates: ImageCandidate[] = [];

  for (const url of [...new Set([row.productUrl, row.sourceUrl])].filter((value) => /^https?:\/\//i.test(value)).slice(0, 4)) {
    const html = await fetchHtmlPage(url);

    if (!html) {
      continue;
    }

    const pageTitle = titleFromHtml(html);
    const pageText = cleanHtmlText(html).slice(0, 5000);
    const score = productImageCandidateScore({
      brandName: row.brandName,
      candidateTitle: pageTitle,
      evidenceText: pageText,
      productTitle: row.title
    });

    for (const imageUrl of [
      ...productJsonLdImagesFromHtml(html, url),
      ...imageUrlsFromHtml(html, url)
    ]) {
      const viable = viableImageUrl(imageUrl);

      if (!viable) {
        continue;
      }

      pageCandidates.push({
        evidenceUrl: url,
        imageUrl: normalizeRemoteImageUrl(viable),
        score,
        source: url === row.productUrl ? "product_page" : "source_page",
        sourceTitle: pageTitle
      });
    }
  }

  const searchResults = await duckDuckGoImageResults([
    row.brandName,
    row.title,
    "product"
  ].filter(Boolean).join(" "));
  const searchCandidates = searchResults.flatMap((result): ImageCandidate[] => {
    const imageUrl = viableImageUrl(result.image ?? result.thumbnail);
    const text = candidateText(result);
    const score = productImageCandidateScore({
      brandName: row.brandName,
      candidateTitle: result.title ?? null,
      evidenceText: text,
      productTitle: row.title
    });
    const minimumScore = minimumSearchScore({
      brandMatches: brandEvidenceMatches(row.brandName, text),
      hostPriority: imageHostPriority(result.url ?? imageUrl),
      text
    });

    if (!imageUrl || score < minimumScore) {
      return [];
    }

    return [{
      evidenceUrl: cleanText(result.url, 3000),
      imageUrl: normalizeRemoteImageUrl(imageUrl),
      score: score + Math.max(0, 0.08 - imageHostPriority(result.url ?? imageUrl) * 0.02),
      source: "duckduckgo_image_search",
      sourceTitle: cleanText(result.title, 500)
    }];
  });

  return [...directCandidates, ...pageCandidates, ...searchCandidates]
    .filter((candidate) => !candidateIsGenericOrUnsafe([
      candidate.imageUrl,
      candidate.evidenceUrl,
      candidate.sourceTitle
    ].filter(Boolean).join(" ")))
    .sort((first, second) => second.score - first.score);
}

async function bestImageCandidate(row: ProductListRolloutRow) {
  const candidates = await buildImageCandidates(row);
  const failures: string[] = [];

  for (const candidate of candidates.slice(0, 14)) {
    const validation = await fetchAndValidateFirstPartyImage({
      imageUrl: candidate.imageUrl,
      timeoutMs: 10000
    });

    if (validation.ok) {
      return { candidate, reason: null };
    }

    failures.push(`${validation.reason}:${candidate.source}`);
  }

  return {
    candidate: null,
    reason: failures[0] ?? "no_candidate"
  };
}

async function validatedOverrideImageCandidate(row: ProductListRolloutRow, override: ImageOverride) {
  const candidate: ImageCandidate = {
    evidenceUrl: override.evidenceUrl ?? row.sourceUrl,
    imageUrl: normalizeRemoteImageUrl(override.imageUrl),
    score: 1,
    source: "manual_override",
    sourceTitle: row.title
  };
  const validation = await fetchAndValidateFirstPartyImage({
    imageUrl: candidate.imageUrl,
    timeoutMs: 10000
  });

  return validation.ok
    ? { candidate, reason: null }
    : { candidate: null, reason: validation.reason };
}

async function loadExistingProducts(productIds: readonly string[]) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  if (productIds.length < 1) {
    return new Map<string, ExistingProductRow>();
  }

  const rows = await sql<ExistingProductRow[]>`
    select
      id::text,
      title,
      brand_name,
      image_url,
      product_url,
      normalized_url,
      status,
      validation_status
    from public.products
    where id = any(${productIds}::uuid[])
  `;

  return new Map(rows.map((row) => [row.id, row]));
}

async function loadOrganisations() {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const rows = await sql<Array<{ id: string; slug: string }>>`
    select id::text, slug
    from public.organisations
    where slug in ('delight-pharmacy', 'enchanted-pharmacy')
  `;
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const delight = bySlug.get("delight-pharmacy");
  const enchanted = bySlug.get("enchanted-pharmacy");

  if (!delight || !enchanted) {
    throw new Error("Both delight-pharmacy and enchanted-pharmacy organisations are required.");
  }

  return { delight, enchanted };
}

async function ensureBrand(input: Readonly<{ brandName: string; selectedRetail: boolean }>) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const normalizedBrandName = normalizeProductKey(input.brandName);
  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_brands (
      name,
      normalized_name,
      status,
      created_at,
      updated_at
    )
    values (
      ${input.brandName},
      ${normalizedBrandName},
      ${input.selectedRetail ? "approved" : "pending_review"},
      now(),
      now()
    )
    on conflict (normalized_name) do update set
      name = excluded.name,
      status = case
        when ${input.selectedRetail} then 'approved'
        when public.product_brands.status = 'approved' then public.product_brands.status
        else public.product_brands.status
      end,
      updated_at = now()
    returning id::text
  `;
  const brandId = rows[0]?.id;

  if (!brandId) {
    throw new Error(`Unable to upsert brand ${input.brandName}`);
  }

  await sql`
    insert into public.product_brand_countries (
      brand_id,
      country_code,
      created_at,
      updated_at
    )
    values (${brandId}::uuid, 'TH', now(), now())
    on conflict (brand_id, country_code) do update set updated_at = excluded.updated_at
  `;

  return { brandId, normalizedBrandName };
}

function productSourceSnapshot(
  row: ProductListRolloutRow,
  image: Readonly<{ candidate?: ImageCandidate | null; mirroredUrl?: string | null }> = {}
) {
  return {
    productListRollout: {
      csvProductId: row.csvProductId,
      imageCandidate: image.candidate
        ? {
            evidenceUrl: image.candidate.evidenceUrl,
            imageUrl: image.candidate.imageUrl,
            score: image.candidate.score,
            source: image.candidate.source,
            sourceTitle: image.candidate.sourceTitle
          }
        : null,
      mirroredImageUrl: image.mirroredUrl ?? null,
      recordSource: row.recordSource,
      rolledOutAt: new Date().toISOString(),
      rrpConfidence: row.rrpConfidence,
      source: ROLLOUT_SOURCE
    }
  };
}

function countryPricing(row: ProductListRolloutRow): ProductCountryPricing[] {
  return [{
    countryCode: "TH",
    currency: row.currency,
    priceUpdatedAt: row.rrpAmount === null ? null : new Date().toISOString(),
    rrpPriceAmount: row.rrpAmount
  }];
}

async function upsertProduct(input: Readonly<{
  imageUrl: string | null;
  imageCandidate: ImageCandidate | null;
  row: ProductListRolloutRow;
}>) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const { brandId, normalizedBrandName } = await ensureBrand({
    brandName: input.row.brandName,
    selectedRetail: input.row.selectedRetail
  });
  const policy = productListRolloutRetailPolicy(input.row);
  const sourceSnapshot = productSourceSnapshot(input.row, {
    candidate: input.imageCandidate,
    mirroredUrl: input.imageUrl
  });
  const productRows = await sql<Array<{ created: boolean; id: string }>>`
    insert into public.products (
      id,
      platform,
      region,
      external_product_id,
      title,
      normalized_title,
      brand_id,
      brand_name,
      normalized_brand_name,
      image_url,
      product_url,
      normalized_url,
      source_url,
      source_snapshot,
      product_kind,
      product_audience,
      status,
      label_status,
      availability_status,
      currency,
      source,
      created_at,
      updated_at
    )
    values (
      ${input.row.canonicalProductId}::uuid,
      'manual',
      'TH',
      ${input.row.isNewAddition ? input.row.csvProductId : null},
      ${input.row.title},
      ${normalizeProductKey(input.row.title)},
      ${brandId}::uuid,
      ${input.row.brandName},
      ${normalizedBrandName},
      ${input.imageUrl},
      ${input.row.productUrl},
      ${input.row.isNewAddition ? syntheticNormalizedUrl(input.row.csvProductId) : normalizedUrl(input.row.productUrl)},
      ${input.row.sourceUrl},
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${input.row.productKind},
      ${input.row.productAudience},
      ${policy.targetStatus},
      ${input.row.facts.length > 0 ? "parsed" : "missing"},
      'unknown',
      ${input.row.currency},
      ${ROLLOUT_SOURCE},
      now(),
      now()
    )
    on conflict (id) do update set
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      image_url = coalesce(excluded.image_url, public.products.image_url),
      product_url = excluded.product_url,
      source_url = excluded.source_url,
      source_snapshot = public.products.source_snapshot || excluded.source_snapshot,
      product_kind = excluded.product_kind,
      product_audience = excluded.product_audience,
      status = excluded.status,
      label_status = excluded.label_status,
      currency = excluded.currency,
      updated_at = now()
    returning id::text, (xmax = 0) as created
  `;
  const productId = productRows[0]?.id;

  if (!productId) {
    throw new Error(`Unable to upsert product ${input.row.csvProductId}`);
  }

  await sql`
    insert into public.product_countries (
      product_id,
      country_code,
      rrp_price_amount,
      currency,
      price_updated_at,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      'TH',
      ${input.row.rrpAmount},
      ${input.row.currency},
      case when ${input.row.rrpAmount}::numeric is null then null else now() end,
      now(),
      now()
    )
    on conflict (product_id, country_code) do update set
      rrp_price_amount = excluded.rrp_price_amount,
      currency = excluded.currency,
      price_updated_at = case
        when public.product_countries.rrp_price_amount is distinct from excluded.rrp_price_amount
          or public.product_countries.currency is distinct from excluded.currency
          then now()
        else public.product_countries.price_updated_at
      end,
      updated_at = now()
  `;

  if (input.row.englishTitle) {
    await upsertTranslation(productId, "en", input.row.englishTitle);
  }

  if (input.row.thaiTitle) {
    await upsertTranslation(productId, "th", input.row.thaiTitle);
  }

  if (input.row.facts.length > 0 && input.row.isNewAddition) {
    await replaceRolloutFacts(productId, input.row.facts);
  }

  await replaceIdentifiers(productId, input.row);
  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_list_rollout_applied',
      ${ROLLOUT_SOURCE},
      ${sql.json(toJsonValue({
        countryPricing: countryPricing(input.row),
        csvProductId: input.row.csvProductId,
        selectedRetail: input.row.selectedRetail,
        status: policy.targetStatus
      }))}::jsonb
    )
  `;

  return { created: Boolean(productRows[0]?.created), productId };
}

async function upsertTranslation(productId: string, locale: string, title: string) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  await sql`
    insert into public.product_translations (
      product_id,
      locale,
      title,
      status,
      source,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      ${locale},
      ${title},
      'complete',
      ${ROLLOUT_SOURCE},
      ${sql.json(toJsonValue({ source: ROLLOUT_SOURCE }))}::jsonb,
      now(),
      now()
    )
    on conflict (product_id, locale) do update set
      title = excluded.title,
      status = excluded.status,
      source = excluded.source,
      metadata = public.product_translations.metadata || excluded.metadata,
      updated_at = now()
  `;
}

async function replaceRolloutFacts(productId: string, facts: readonly ProductImportFactInput[]) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const normalizedFacts = normalizedFactsForStorage(facts);
  const supplementMatches = await supplementIdsForFacts(sql, normalizedFacts);
  const factRows = normalizedFacts.flatMap((fact) => {
    const factName = fact.name.trim();
    const match = supplementMatches.get(normalizeProductFactKey(factName));

    return match
      ? [{
          amount: fact.amount,
          confidence: fact.confidence ?? "moderate",
          item_type: fact.itemType ?? "supplement",
          name: match.name,
          normalized_name: normalizeProductFactKey(match.name),
          serving_label: fact.servingLabel ?? null,
          source: ROLLOUT_SOURCE,
          source_text: fact.sourceText ?? null,
          source_url: fact.sourceUrl ?? null,
          supplement_id: match.id,
          unit: fact.unit ?? null
        }]
      : [];
  });

  await sql`
    delete from public.product_facts
    where product_id = ${productId}::uuid
      and source = ${ROLLOUT_SOURCE}
  `;

  if (factRows.length < 1) {
    return;
  }

  await sql`
    insert into public.product_facts (
      product_id,
      item_type,
      supplement_id,
      name,
      normalized_name,
      amount,
      unit,
      serving_label,
      confidence,
      source,
      source_url,
      source_text,
      created_at,
      updated_at
    )
    select
      ${productId}::uuid,
      item_type,
      supplement_id,
      name,
      normalized_name,
      amount,
      unit,
      serving_label,
      confidence,
      source,
      source_url,
      source_text,
      now(),
      now()
    from jsonb_to_recordset(${sql.json(toJsonValue(factRows))}::jsonb) as fact(
      amount numeric,
      confidence text,
      item_type text,
      name text,
      normalized_name text,
      serving_label text,
      source text,
      source_text text,
      source_url text,
      supplement_id uuid,
      unit text
    )
  `;
}

async function replaceIdentifiers(productId: string, row: ProductListRolloutRow) {
  const identifiers = [
    ...row.ean13Values.map((value) => ({
      confidence: "high" as const,
      evidenceUrl: row.sourceUrl,
      source: ROLLOUT_SOURCE,
      type: "ean13" as const,
      value
    })),
    ...row.manufacturerSkus.map((value) => ({
      confidence: "high" as const,
      evidenceUrl: row.sourceUrl,
      source: ROLLOUT_SOURCE,
      type: "manufacturer_sku" as const,
      value
    }))
  ];

  if (identifiers.length > 0) {
    const sql = getSql();

    if (!sql) throw new Error("Database is not configured");

    await replaceApprovedProductIdentifiers(sql, {
      actor: ROLLOUT_SOURCE,
      identifiers,
      productId,
      replaceTypes: ["ean13", "manufacturer_sku"]
    });
  }
}

async function productApprovedForRetail(productId: string) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const rows = await sql<Array<{ approved: boolean }>>`
    select exists (
      select 1
      from public.products
      where id = ${productId}::uuid
        and status = 'approved'
    ) as approved
  `;

  return Boolean(rows[0]?.approved);
}

async function approveProductForRetail(productId: string) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  await sql`
    update public.products
    set status = 'approved', updated_at = now()
    where id = ${productId}::uuid
  `;
}

async function upsertRetailSellables(input: Readonly<{
  organisationIds: readonly string[];
  row: ProductListRolloutRow;
}>) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  let sellables = 0;
  let stockRows = 0;

  if (!(await productApprovedForRetail(input.row.canonicalProductId))) {
    throw new Error("Retail product list rollout can only activate approved platform products");
  }

  for (const organisationId of input.organisationIds) {
    await sql`
      insert into public.retail_sellable_products (
        organisation_id,
        product_id,
        status,
        rrp_price_amount,
        currency,
        lead_time_days,
        backorder_policy,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${organisationId}::uuid,
        ${input.row.canonicalProductId}::uuid,
        'active',
        ${input.row.rrpAmount},
        ${input.row.currency},
        ${input.row.leadTimeDays || DEFAULT_LEAD_TIME_DAYS},
        'allow',
        ${sql.json(toJsonValue({
          csvProductId: input.row.csvProductId,
          source: ROLLOUT_SOURCE
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id) do update set
        status = 'active',
        rrp_price_amount = excluded.rrp_price_amount,
        currency = excluded.currency,
        lead_time_days = excluded.lead_time_days,
        backorder_policy = excluded.backorder_policy,
        metadata = public.retail_sellable_products.metadata || excluded.metadata,
        updated_at = now()
    `;
    sellables += 1;

    const inserted = await sql<Array<{ id: string }>>`
      insert into public.retail_product_stock (
        organisation_id,
        product_id,
        status,
        stock_quantity,
        lead_time_days,
        currency,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${organisationId}::uuid,
        ${input.row.canonicalProductId}::uuid,
        'active',
        0,
        ${input.row.leadTimeDays || DEFAULT_LEAD_TIME_DAYS},
        ${input.row.currency},
        ${sql.json(toJsonValue({
          csvProductId: input.row.csvProductId,
          source: ROLLOUT_SOURCE
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id) do nothing
      returning id::text
    `;
    stockRows += inserted.length;
  }

  return { sellables, stockRows };
}

async function disableDhcSellables(organisationIds: readonly string[]) {
  const sql = getSql();

  if (!sql) throw new Error("Database is not configured");

  const rows = await sql<Array<{ id: string }>>`
    update public.retail_sellable_products sellable
    set
      status = 'disabled',
      metadata = sellable.metadata || ${sql.json(toJsonValue({
        disabledBy: ROLLOUT_SOURCE,
        reason: "DHC is master-only in the product list rollout"
      }))}::jsonb,
      updated_at = now()
    from public.products products
    where products.id = sellable.product_id
      and sellable.organisation_id = any(${organisationIds}::uuid[])
      and lower(coalesce(products.brand_name, '')) = ${DHC_BRAND}
      and sellable.status = 'active'
    returning sellable.id::text
  `;

  return rows.length;
}

async function writeReports(input: Readonly<{
  existingProducts: ReadonlyMap<string, ExistingProductRow>;
  imageRows: readonly unknown[][];
  outputDir: string;
  rows: readonly ProductListRolloutRow[];
  summary: ProductListRolloutSummary;
}>) {
  await mkdir(input.outputDir, { recursive: true });

  await writeReportFile(
    path.join(input.outputDir, "apply_summary.json"),
    `${JSON.stringify(input.summary, null, 2)}\n`
  );
  await writeCsvReport(
    path.join(input.outputDir, "image_candidates.csv"),
    ["csv_product_id", "product_id", "title", "status", "source", "score", "image_url", "evidence_url", "reason"],
    input.imageRows
  );
  await writeCsvReport(
    path.join(input.outputDir, "normalized_input.csv"),
    [
      "row_number",
      "csv_product_id",
      "product_id",
      "is_new",
      "is_dhc",
      "selected_retail",
      "brand",
      "title",
      "rrp_amount",
      "currency",
      "lead_time_days",
      "target_status",
      "product_url",
      "source_url",
      "ean13_values",
      "manufacturer_skus",
      "image_url_count"
    ],
    input.rows.map((row) => [
      row.rowNumber,
      row.csvProductId,
      row.canonicalProductId,
      row.isNewAddition,
      row.isDhc,
      row.selectedRetail,
      row.brandName,
      row.title,
      row.rrpAmount ?? "",
      row.currency,
      row.leadTimeDays,
      productListRolloutRetailPolicy(row).targetStatus,
      row.productUrl,
      row.sourceUrl,
      row.ean13Values.join("|"),
      row.manufacturerSkus.join("|"),
      row.imageUrls.length
    ])
  );
  await writeCsvReport(
    path.join(input.outputDir, "mn_add_uuid_map.csv"),
    ["csv_product_id", "product_id", "brand", "title", "source_url"],
    input.rows
      .filter((row) => row.isNewAddition)
      .map((row) => [
        row.csvProductId,
        row.canonicalProductId,
        row.brandName,
        row.title,
        row.sourceUrl
      ])
  );
  await writeCsvReport(
    path.join(input.outputDir, "row_diffs.csv"),
    [
      "csv_product_id",
      "product_id",
      "change_type",
      "existing_status",
      "target_status",
      "existing_title",
      "target_title",
      "existing_brand",
      "target_brand",
      "existing_image_state",
      "target_selected_retail",
      "rrp_amount",
      "currency"
    ],
    input.rows.map((row) => {
      const existing = input.existingProducts.get(row.canonicalProductId);
      const existingImageState = !existing?.image_url
        ? "missing"
        : isFirstPartyImageUrl(existing.image_url)
          ? "first_party"
          : "external";
      const changeType = existing
        ? "update"
        : row.isNewAddition
          ? "create"
          : "missing_existing";

      return [
        row.csvProductId,
        row.canonicalProductId,
        changeType,
        existing?.status ?? "",
        productListRolloutRetailPolicy(row).targetStatus,
        existing?.title ?? "",
        row.title,
        existing?.brand_name ?? "",
        row.brandName,
        existingImageState,
        row.selectedRetail,
        row.rrpAmount ?? "",
        row.currency
      ];
    })
  );
  await writeCsvReport(
    path.join(input.outputDir, "retail_changes.csv"),
    [
      "csv_product_id",
      "product_id",
      "brand",
      "title",
      "organisation_slug",
      "action",
      "rrp_amount",
      "currency",
      "lead_time_days",
      "backorder_policy",
      "stock_quantity_action"
    ],
    input.rows.flatMap((row) => {
      const organisationSlugs = ["delight-pharmacy", "enchanted-pharmacy"];

      return organisationSlugs.map((slug) => [
        row.csvProductId,
        row.canonicalProductId,
        row.brandName,
        row.title,
        slug,
        row.selectedRetail ? "upsert_active_sellable" : "disable_active_sellable_if_present",
        row.selectedRetail ? row.rrpAmount ?? "" : "",
        row.selectedRetail ? row.currency : "",
        row.selectedRetail ? row.leadTimeDays : "",
        row.selectedRetail ? "allow" : "",
        row.selectedRetail ? "preserve_existing_or_insert_zero" : "unchanged"
      ]);
    })
  );
}

async function writeReportFile(filePath: string, contents: string) {
  const tmp = `${filePath}.tmp`;

  await writeFile(tmp, contents, "utf8");
  await rename(tmp, filePath);
}

async function writeCsvReport(
  filePath: string,
  header: readonly unknown[],
  rows: readonly (readonly unknown[])[]
) {
  await writeReportFile(
    filePath,
    [
      csvLine(header),
      ...rows.map(csvLine)
    ].join("\n") + "\n",
  );
}

export function defaultProductListRolloutOutputDir(environment: ProductListRolloutEnvironment) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join("reports", "product-list-rollout", `${environment}-${stamp}`);
}

export async function runProductListRollout(input: RunProductListRolloutInput) {
  if (input.dbUrl) {
    process.env.DB_URL = input.dbUrl;
  }

  process.env.MATTANUTRA_ENV = input.environment;
  assertProductListRolloutDatabaseTarget(process.env.DB_URL, input.environment);

  if (input.apply && !firstPartyImageStorageConfigFromEnv()) {
    throw new Error("Apply requires DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_CDN_ENDPOINT.");
  }

  const { readFile } = await import("node:fs/promises");
  const parsed = parseProductListRolloutCsv(await readFile(input.csvPath, "utf8"));
  const rows = parsed.rows;
  const counts = productListRolloutCounts(rows);
  const outputDir = input.outputDir ?? defaultProductListRolloutOutputDir(input.environment);
  const imageOverrides = await loadImageOverrides(input.imageOverridesPath);
  const existingProducts = await loadExistingProducts(rows.map((row) => row.canonicalProductId));
  const missingExistingRows = rows.filter((row) => !row.isNewAddition && !existingProducts.has(row.canonicalProductId));
  const invalidRows = [
    ...parsed.invalidRows,
    ...missingExistingRows.map((row) => ({
      reason: "Existing UUID row was not found in target database",
      rowNumber: row.rowNumber
    }))
  ];
  const orgs = await loadOrganisations();
  const imageRows: unknown[][] = [];
  const imageByProductId = new Map<string, { candidate: ImageCandidate | null; url: string | null }>();
  const unresolvedImages: ProductListRolloutSummary["unresolvedImages"] = [];

  for (const row of rows) {
    if (!row.selectedRetail) {
      continue;
    }

    const existing = existingProducts.get(row.canonicalProductId);

    if (existing?.image_url && isFirstPartyImageUrl(existing.image_url)) {
      imageByProductId.set(row.canonicalProductId, {
        candidate: null,
        url: existing.image_url
      });
      imageRows.push([row.csvProductId, row.canonicalProductId, row.title, "preserved", "existing_first_party", "", existing.image_url, "", ""]);
      continue;
    }

    const override = imageOverrides.get(row.csvProductId) ??
      imageOverrides.get(row.canonicalProductId);
    const resolved = override
      ? await validatedOverrideImageCandidate(row, override)
      : await bestImageCandidate(row);

    if (!resolved.candidate) {
      unresolvedImages.push({
        csvProductId: row.csvProductId,
        productId: row.canonicalProductId,
        reason: resolved.reason ?? "unresolved",
        title: row.title
      });
      imageRows.push([row.csvProductId, row.canonicalProductId, row.title, "unresolved", "", "", "", "", resolved.reason ?? "unresolved"]);
      continue;
    }

    if (input.apply) {
      const mirrored = await mirrorImageToFirstParty({
        entityId: row.canonicalProductId,
        evidenceUrl: resolved.candidate.evidenceUrl ?? row.sourceUrl,
        imageUrl: resolved.candidate.imageUrl,
        namespace: "products",
        source: ROLLOUT_SOURCE
      });

      imageByProductId.set(row.canonicalProductId, {
        candidate: resolved.candidate,
        url: mirrored.url
      });
      imageRows.push([row.csvProductId, row.canonicalProductId, row.title, "mirrored", resolved.candidate.source, resolved.candidate.score.toFixed(3), mirrored.url, resolved.candidate.evidenceUrl ?? "", ""]);
    } else {
      imageByProductId.set(row.canonicalProductId, {
        candidate: resolved.candidate,
        url: null
      });
      imageRows.push([row.csvProductId, row.canonicalProductId, row.title, "resolved_dry_run", resolved.candidate.source, resolved.candidate.score.toFixed(3), resolved.candidate.imageUrl, resolved.candidate.evidenceUrl ?? "", ""]);
    }
  }

  if (invalidRows.length > 0) {
    const summary: ProductListRolloutSummary = {
      applied: false,
      createdProducts: 0,
      dhcRows: counts.dhcRows,
      dhcSellablesDisabled: 0,
      dryRun: !input.apply,
      environment: input.environment,
      existingRows: counts.existingRows,
      generatedAt: new Date().toISOString(),
      imagesMirrored: 0,
      invalidRows,
      newRows: counts.newRows,
      nonDhcRows: counts.nonDhcRows,
      productRowsUpdated: 0,
      reportDirectory: outputDir,
      retailSellablesUpserted: 0,
      rows: counts.rows,
      stockRowsInserted: 0,
      unresolvedImages
    };

    await writeReports({ existingProducts, imageRows, outputDir, rows, summary });
    throw new Error(`Product list rollout has ${invalidRows.length} invalid row(s). See ${outputDir}.`);
  }

  if (input.apply && unresolvedImages.length > 0) {
    const summary: ProductListRolloutSummary = {
      applied: false,
      createdProducts: 0,
      dhcRows: counts.dhcRows,
      dhcSellablesDisabled: 0,
      dryRun: false,
      environment: input.environment,
      existingRows: counts.existingRows,
      generatedAt: new Date().toISOString(),
      imagesMirrored: 0,
      invalidRows: [],
      newRows: counts.newRows,
      nonDhcRows: counts.nonDhcRows,
      productRowsUpdated: 0,
      reportDirectory: outputDir,
      retailSellablesUpserted: 0,
      rows: counts.rows,
      stockRowsInserted: 0,
      unresolvedImages
    };

    await writeReports({ existingProducts, imageRows, outputDir, rows, summary });
    throw new Error(`Product list rollout has ${unresolvedImages.length} unresolved selected image(s). See ${outputDir}.`);
  }

  let createdProducts = 0;
  let productRowsUpdated = 0;
  let retailSellablesUpserted = 0;
  let stockRowsInserted = 0;
  let dhcSellablesDisabled = 0;
  const affectedProductIds: string[] = [];

  if (input.apply) {
    for (const row of rows) {
      const image = imageByProductId.get(row.canonicalProductId);
      const result = await upsertProduct({
        imageCandidate: image?.candidate ?? null,
        imageUrl: row.selectedRetail ? image?.url ?? null : existingProducts.get(row.canonicalProductId)?.image_url ?? null,
        row
      });

      affectedProductIds.push(result.productId);
      createdProducts += result.created ? 1 : 0;
      productRowsUpdated += result.created ? 0 : 1;

      if (row.selectedRetail) {
        await approveProductForRetail(row.canonicalProductId);

        const retail = await upsertRetailSellables({
          organisationIds: [orgs.delight, orgs.enchanted],
          row
        });
        retailSellablesUpserted += retail.sellables;
        stockRowsInserted += retail.stockRows;
      }
    }

    dhcSellablesDisabled = await disableDhcSellables([orgs.delight, orgs.enchanted]);

    if (affectedProductIds.length > 0) {
      await refreshAndPersistProductValidations(getSql()!, affectedProductIds);
      await getSql()!`
        update public.products
        set status = 'approved', updated_at = now()
        where id = any(${rows.filter((row) => row.selectedRetail).map((row) => row.canonicalProductId)}::uuid[])
      `;
    }
  }

  const summary: ProductListRolloutSummary = {
    applied: Boolean(input.apply),
    createdProducts,
    dhcRows: counts.dhcRows,
    dhcSellablesDisabled,
    dryRun: !input.apply,
    environment: input.environment,
    existingRows: counts.existingRows,
    generatedAt: new Date().toISOString(),
    imagesMirrored: input.apply
      ? imageRows.filter((row) => row[3] === "mirrored").length
      : 0,
    invalidRows: [],
    newRows: counts.newRows,
    nonDhcRows: counts.nonDhcRows,
    productRowsUpdated,
    reportDirectory: outputDir,
    retailSellablesUpserted,
    rows: counts.rows,
    stockRowsInserted,
    unresolvedImages
  };

  await writeReports({ existingProducts, imageRows, outputDir, rows, summary });
  await closeSqlPool();

  return summary;
}
