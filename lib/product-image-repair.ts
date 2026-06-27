import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { toJsonValue } from "@/lib/assessment-store";
import { closeSqlPool, getSql } from "@/lib/db";
import {
  brandEvidenceMatches,
  imageHostPriority,
  minimumSearchScore,
  productTokens,
  tokenScore,
  viableImageUrl
} from "@/lib/delight-product-image-backfill";
import { contentImageCacheControl } from "@/lib/content-image-storage";
import { normalizeProductKey } from "@/lib/product-recommendations";
import {
  cleanHtmlText,
  imageUrlsFromHtml,
  productJsonLdImagesFromHtml,
  titleFromHtml
} from "../scripts/manufacturer-scrape-html.ts";

export type ProductImageIssue = "missing_image" | "broken_image";

export type ProductImageCandidateSource =
  | "existing_catalogue"
  | "product_import"
  | "product_page"
  | "source_page"
  | "duckduckgo_image_search";

export type ProductImageUnresolvedReason =
  | "no_candidate"
  | "ambiguous_match"
  | "unreachable_image"
  | "decode_failed"
  | "storage_missing"
  | "low_confidence"
  | "protected_good_cdn"
  | "skipped_limit";

export type ProductImageRepairEnvironment = "dev" | "uat" | "prd";

type ProductImageRepairProduct = Readonly<{
  activeDelightSellable: boolean;
  activeRetailerCount: number;
  brandName: string | null;
  fdaApprovalNumber: string | null;
  id: string;
  imageUrl: string | null;
  importImageUrls: string[];
  importSourceUrls: string[];
  productUrl: string;
  registerNumbers: string[];
  retailerNames: string[];
  sourceUrl: string | null;
  status: string;
  title: string;
  validationStatus: string;
}>;

type ProductImageRepairCandidate = Readonly<{
  bytes?: Buffer;
  contentType?: string;
  evidenceUrl: string | null;
  extension?: string;
  height?: number | null;
  imageUrl: string;
  score: number;
  source: ProductImageCandidateSource;
  sourceTitle: string | null;
  width?: number | null;
}>;

type StoredProductImage = Readonly<{
  cdnUrl: string;
  key: string;
}>;

export type ProductImageRepairResolvedRow = Readonly<{
  activeDelightSellable: boolean;
  brandName: string | null;
  evidenceUrl: string | null;
  id: string;
  issue: ProductImageIssue;
  newImageUrl: string | null;
  oldImageUrl: string | null;
  score: number;
  source: ProductImageCandidateSource;
  sourceTitle: string | null;
  storageKey: string | null;
  title: string;
  updated: boolean;
}>;

export type ProductImageRepairUnresolvedRow = Readonly<{
  activeDelightSellable: boolean;
  brandName: string | null;
  detail: string | null;
  id: string;
  issue: ProductImageIssue;
  oldImageUrl: string | null;
  reason: ProductImageUnresolvedReason;
  title: string;
}>;

export type ProductImageRepairReport = Readonly<{
  applied: boolean;
  before: {
    broken: number;
    healthy: number;
    missing: number;
  };
  brandCounts: Record<string, {
    broken: number;
    missing: number;
    unresolved: number;
    updated: number;
  }>;
  checked: number;
  dryRun: boolean;
  environment: ProductImageRepairEnvironment;
  generatedAt: string;
  resolved: ProductImageRepairResolvedRow[];
  retailerCounts: Record<string, {
    broken: number;
    missing: number;
    unresolved: number;
    updated: number;
  }>;
  skippedHealthy: number;
  sourceCounts: Record<string, number>;
  updated: number;
  unresolved: ProductImageRepairUnresolvedRow[];
}>;

export type RunProductImageRepairInput = Readonly<{
  apply?: boolean;
  delayMs?: number;
  environment: ProductImageRepairEnvironment;
  force?: boolean;
  limit?: number;
  outputPath?: string | null;
  csvOutputPath?: string | null;
}>;

type ImageValidationResult =
  | Readonly<{
      bytes: Buffer;
      contentType: string;
      extension: string;
      height: number | null;
      ok: true;
      width: number | null;
    }>
  | Readonly<{
      ok: false;
      reason: "unreachable_image" | "decode_failed";
      detail: string;
    }>;

type DuckDuckGoImageResult = Readonly<{
  height?: number;
  image?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
  width?: number;
}>;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const AMBIGUOUS_SCORE_DELTA = 0.04;
const PRODUCT_IMAGE_CACHE_CONTROL = contentImageCacheControl;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).replace(/\s+/g, " ").trim();

  return text ? text.slice(0, max) : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueTextValues(values: readonly unknown[]) {
  return [...new Set(values.flatMap((value) => {
    const text = cleanText(value, 3000);

    return text ? [text] : [];
  }))];
}

function normalizeRemoteImageUrl(value: string) {
  return value.replace(/^http:\/\//i, "https://");
}

function isHttpUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function isMattaNutraCdnUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return (
      hostname === "mattanutra.com" ||
      hostname.endsWith(".mattanutra.com") ||
      hostname === "mattanutra.sgp1.cdn.digitaloceanspaces.com" ||
      hostname === "mattanutra.sgp1.digitaloceanspaces.com"
    );
  } catch {
    return false;
  }
}

function contentTypeExtension(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim();

  if (normalized === "image/avif") return "avif";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";

  return null;
}

function urlExtension(url: string) {
  const match = url.toLowerCase().match(/\.(avif|jpe?g|png|webp)(?:\?|#|$)/);

  if (!match) {
    return null;
  }

  return match[1] === "jpeg" ? "jpg" : match[1];
}

function inferredContentType(extension: string) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";

  return "application/octet-stream";
}

function safeSlug(value: string, fallback = "product") {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || fallback;
}

function compactKey(value: string) {
  return normalizeProductKey(value).replace(/_/g, "");
}

function registerEvidenceMatches(registerNumbers: readonly string[], text: string) {
  const compactText = compactKey(text);

  return registerNumbers.some((number) => {
    const compactRegister = compactKey(number);

    return compactRegister.length >= 5 && compactText.includes(compactRegister);
  });
}

export function candidateIsGenericOrUnsafe(text: string) {
  const normalized = text.toLowerCase();

  if (
    /\b(?:placeholder|no[-_\s]?image|default[-_\s]?image|coming\s+soon|logo|banner|sprite|icon)\b/i.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:agricole|ayam|cat|cfmoto|chicken|dog|motorcycle|motorsport|pet|poultry|quad|renouveau|utv|vehicle)\b/i.test(normalized)
  ) {
    return true;
  }

  return false;
}

export function productImageCandidateScore(input: Readonly<{
  brandName?: string | null;
  candidateTitle?: string | null;
  evidenceText?: string | null;
  productTitle: string;
  registerNumbers?: readonly string[];
}>) {
  const evidenceText = [input.candidateTitle, input.evidenceText]
    .flatMap((value) => cleanText(value, 3000) ?? [])
    .join(" ");

  if (!evidenceText || candidateIsGenericOrUnsafe(evidenceText)) {
    return 0;
  }

  const base = tokenScore(input.productTitle, evidenceText, input.brandName);
  const brandBonus = brandEvidenceMatches(input.brandName, evidenceText) ? 0.08 : 0;
  const registerBonus = registerEvidenceMatches(input.registerNumbers ?? [], evidenceText)
    ? 0.12
    : 0;
  const doseTokens = productTokens(input.productTitle, input.brandName)
    .filter((token) => /^\d+$/.test(token));
  const doseBonus = doseTokens.some((token) => evidenceText.includes(token))
    ? 0.03
    : 0;

  return Math.min(0.99, base + brandBonus + registerBonus + doseBonus);
}

export function classifyProductImageState(input: Readonly<{
  force?: boolean;
  imageUrl?: string | null;
  reachable: boolean;
}>) {
  const imageUrl = cleanText(input.imageUrl, 3000);

  if (!imageUrl) {
    return {
      healthy: false,
      issue: "missing_image" as const,
      reason: null
    };
  }

  if (input.reachable && isMattaNutraCdnUrl(imageUrl) && !input.force) {
    return {
      healthy: true,
      issue: null,
      reason: "protected_good_cdn" as const
    };
  }

  if (input.reachable && !input.force) {
    return {
      healthy: true,
      issue: null,
      reason: null
    };
  }

  return {
    healthy: false,
    issue: "broken_image" as const,
    reason: null
  };
}

function extractDuckDuckGoVqd(html: string) {
  return html.match(/vqd=["']?([^"'&]+)/)?.[1] ?? null;
}

async function duckDuckGoImageResults(query: string) {
  const page = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    {
      headers: {
        Accept: "text/html",
        "Accept-Language": "th,en-GB;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    }
  );

  if (!page.ok) {
    return [];
  }

  const vqd = extractDuckDuckGoVqd(await page.text());

  if (!vqd) {
    return [];
  }

  const response = await fetch(
    `https://duckduckgo.com/i.js?l=th-th&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
    {
      headers: {
        Accept: "application/json,text/javascript,*/*",
        Referer: "https://duckduckgo.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as unknown;

  return payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: DuckDuckGoImageResult[] }).results
    : [];
}

function candidateText(result: DuckDuckGoImageResult) {
  return [result.title, result.url, result.image]
    .filter((value): value is string => Boolean(cleanText(value, 3000)))
    .join(" ");
}

async function fetchImageBuffer(url: string): Promise<ImageValidationResult> {
  const normalizedUrl = normalizeRemoteImageUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        detail: `HTTP ${response.status}`,
        ok: false,
        reason: "unreachable_image"
      };
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return {
        detail: `image too large: ${contentLength} bytes`,
        ok: false,
        reason: "decode_failed"
      };
    }

    const contentTypeHeader = response.headers.get("content-type") ?? "";
    const headerExtension = contentTypeExtension(contentTypeHeader);
    const extension = headerExtension ?? urlExtension(normalizedUrl);

    if (!extension || extension === "gif") {
      return {
        detail: `unsupported content type: ${contentTypeHeader || "unknown"}`,
        ok: false,
        reason: "decode_failed"
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length > MAX_IMAGE_BYTES) {
      return {
        detail: `image too large: ${bytes.length} bytes`,
        ok: false,
        reason: "decode_failed"
      };
    }

    const metadata = await sharp(bytes).metadata().catch((error: unknown) => ({
      imageRepairDecodeError: error instanceof Error ? error.message : String(error)
    }));

    if ("imageRepairDecodeError" in metadata) {
      return {
        detail: metadata.imageRepairDecodeError,
        ok: false,
        reason: "decode_failed"
      };
    }

    return {
      bytes,
      contentType: contentTypeExtension(contentTypeHeader)
        ? contentTypeHeader.split(";")[0]?.trim() || inferredContentType(extension)
        : inferredContentType(extension),
      extension,
      height: metadata.height ?? null,
      ok: true,
      width: metadata.width ?? null
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      ok: false,
      reason: "unreachable_image"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function imageUrlLooksReachable(url: string) {
  return (await fetchImageBuffer(url)).ok;
}

type SpacesConfig = Readonly<{
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}>;

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function digitalOceanEndpointConfig(value: string) {
  try {
    const url = new URL(value);
    const parts = url.hostname.split(".");

    if (
      parts.length < 4 ||
      parts.at(-2) !== "digitaloceanspaces" ||
      parts.at(-1) !== "com"
    ) {
      return null;
    }

    const bucket = parts[0];
    const region = parts[1];

    return bucket && region
      ? {
          bucket,
          cdnBaseUrl: `${url.protocol}//${bucket}.${region}.cdn.digitaloceanspaces.com`,
          endpoint: `${url.protocol}//${region}.digitaloceanspaces.com`,
          region
        }
      : null;
  } catch {
    return null;
  }
}

function digitalOceanCredentialPair(value: string) {
  const separator = value.includes(":") ? ":" : value.includes("|") ? "|" : "";

  if (!separator) {
    throw new Error(
      "DO_SPACES_KEY must include both access and secret values as access:secret or access|secret."
    );
  }

  const separatorIndex = value.indexOf(separator);
  const accessKeyId = value.slice(0, separatorIndex).trim();
  const secretAccessKey = value.slice(separatorIndex + 1).trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "DO_SPACES_KEY must include both access and secret values as access:secret or access|secret."
    );
  }

  return { accessKeyId, secretAccessKey };
}

function digitalOceanCredentialsFromEnv() {
  const explicitAccessKeyId = envValue(
    "DO_SPACES_ACCESS_KEY_ID",
    "DO_SPACES_ACCESS_KEY"
  );
  const explicitSecretAccessKey = envValue(
    "DO_SPACES_SECRET_ACCESS_KEY",
    "DO_SPACES_SECRET_KEY"
  );

  if (explicitAccessKeyId || explicitSecretAccessKey) {
    if (!explicitAccessKeyId || !explicitSecretAccessKey) {
      throw new Error(
        "Set both DO_SPACES_ACCESS_KEY_ID and DO_SPACES_SECRET_ACCESS_KEY for DigitalOcean Spaces storage."
      );
    }

    return {
      accessKeyId: explicitAccessKeyId,
      secretAccessKey: explicitSecretAccessKey
    };
  }

  const legacyCredential = envValue("DO_SPACES_KEY");

  return legacyCredential
    ? digitalOceanCredentialPair(legacyCredential)
    : null;
}

export function productImageRepairSpacesConfigFromEnv(): SpacesConfig | null {
  const endpointConfig = digitalOceanEndpointConfig(envValue("DO_SPACES_ENDPOINT"));
  const credential = digitalOceanCredentialsFromEnv();

  if (!endpointConfig || !credential) {
    return null;
  }

  const { accessKeyId, secretAccessKey } = credential;
  const publicBaseUrl =
    envValue(
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_CDN_URL",
      "DO_SPACES_PUBLIC_BASE_URL"
    ) || endpointConfig.cdnBaseUrl;

  return {
    accessKeyId,
    bucket: endpointConfig.bucket,
    endpoint: endpointConfig.endpoint,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/g, ""),
    region: endpointConfig.region,
    secretAccessKey
  };
}

export function validateProductImageRepairOptions(input: Readonly<{
  apply?: boolean;
  spacesConfig?: SpacesConfig | null;
}>) {
  if (input.apply && !input.spacesConfig) {
    throw new Error(
      "Product image repair apply mode requires DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, and DO_SPACES_CDN_ENDPOINT."
    );
  }
}

export function assertProductImageRepairDatabaseTarget(
  connection: string | undefined,
  environment: ProductImageRepairEnvironment
) {
  if (!connection) {
    throw new Error("DB_URL is required for product image repair.");
  }

  const url = new URL(connection);
  const database = url.pathname.replace(/^\/+/, "");

  if (!database || database.toLowerCase() === "defaultdb") {
    throw new Error("Product image repair refuses to run against defaultdb.");
  }

  if (environment === "uat" && !/uat/i.test(database)) {
    throw new Error(`Product image repair expected a UAT database, got ${database}.`);
  }

  if (environment === "prd" && !/(prd|prod)/i.test(database)) {
    throw new Error(`Product image repair expected a PRD database, got ${database}.`);
  }
}

export function productImageRepairStorageKey(input: Readonly<{
  environment: ProductImageRepairEnvironment;
  extension: string;
  imageUrl: string;
  productId: string;
  title: string;
  uploadedAt?: Date;
}>) {
  const hash = createHash("sha256")
    .update(input.imageUrl)
    .digest("hex")
    .slice(0, 12);
  const date = (input.uploadedAt ?? new Date()).toISOString().slice(0, 10);
  const titleSlug = safeSlug(input.title);

  return `${input.environment}/products/${date}/${input.productId}/${hash}-${titleSlug}.${input.extension}`;
}

async function uploadProductImageToSpaces(input: Readonly<{
  candidate: ProductImageRepairCandidate & Required<Pick<ProductImageRepairCandidate, "bytes" | "contentType" | "extension">>;
  config: SpacesConfig;
  environment: ProductImageRepairEnvironment;
  product: ProductImageRepairProduct;
}>) {
  const key = productImageRepairStorageKey({
    environment: input.environment,
    extension: input.candidate.extension,
    imageUrl: input.candidate.imageUrl,
    productId: input.product.id,
    title: input.product.title
  });
  const client = new S3Client({
    credentials: {
      accessKeyId: input.config.accessKeyId,
      secretAccessKey: input.config.secretAccessKey
    },
    endpoint: input.config.endpoint,
    forcePathStyle: false,
    region: input.config.region
  });

  await client.send(
    new PutObjectCommand({
      ACL: "public-read",
      Body: input.candidate.bytes,
      Bucket: input.config.bucket,
      CacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      ContentType: input.candidate.contentType,
      Key: key
    })
  );

  return {
    cdnUrl: `${input.config.publicBaseUrl}/${key}`,
    key
  };
}

async function loadProductImageRepairProducts() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{
    active_delight_sellable: boolean;
    active_retailer_count: number | string | null;
    brand_name: string | null;
    fda_approval_number: string | null;
    id: string;
    image_url: string | null;
    import_image_urls: string[] | null;
    import_source_urls: string[] | null;
    product_url: string;
    register_numbers: string[] | null;
    retailer_names: string[] | null;
    source_url: string | null;
    status: string;
    title: string;
    validation_status: string;
  }>>`
    select
      products.id::text,
      products.title,
      products.brand_name,
      products.status,
      products.validation_status,
      products.image_url,
      products.product_url,
      products.source_url,
      products.fda_approval_number,
      coalesce(imports.image_urls, array[]::text[]) as import_image_urls,
      coalesce(imports.source_urls, array[]::text[]) as import_source_urls,
      coalesce(regulatory.register_numbers, array[]::text[]) as register_numbers,
      coalesce(retail.active_retailer_count, 0) as active_retailer_count,
      coalesce(retail.retailer_names, array[]::text[]) as retailer_names,
      coalesce(retail.active_delight_sellable, false) as active_delight_sellable
    from public.products products
    left join lateral (
      select
        coalesce(array_agg(distinct image_url) filter (where image_url is not null and btrim(image_url) <> ''), array[]::text[]) as image_urls,
        coalesce(array_agg(distinct product_imports.source_url) filter (where product_imports.source_url is not null and btrim(product_imports.source_url) <> ''), array[]::text[]) as source_urls
      from public.product_imports product_imports
      left join lateral unnest(product_imports.image_urls) as import_images(image_url) on true
      where product_imports.product_id = products.id
    ) imports on true
    left join lateral (
      select coalesce(array_agg(distinct product_regulatory_approvals.approval_number) filter (where product_regulatory_approvals.approval_number is not null and btrim(product_regulatory_approvals.approval_number) <> ''), array[]::text[]) as register_numbers
      from public.product_regulatory_approvals product_regulatory_approvals
      where product_regulatory_approvals.product_id = products.id
    ) regulatory on true
    left join lateral (
      select
        count(distinct organisations.id) filter (where retail_sellable_products.status = 'active') as active_retailer_count,
        coalesce(array_agg(distinct organisations.name) filter (where retail_sellable_products.status = 'active'), array[]::text[]) as retailer_names,
        bool_or(retail_sellable_products.status = 'active' and organisations.name ilike 'Delight%') as active_delight_sellable
      from public.retail_sellable_products retail_sellable_products
      join public.organisations organisations on organisations.id = retail_sellable_products.organisation_id
      where retail_sellable_products.product_id = products.id
    ) retail on true
    where products.status <> 'ignored'
    order by
      coalesce(retail.active_delight_sellable, false) desc,
      products.status = 'approved' desc,
      products.validation_status = 'pass' desc,
      coalesce(retail.active_retailer_count, 0) desc,
      products.brand_name asc nulls last,
      products.title asc
  `;

  return rows.map((row): ProductImageRepairProduct => ({
    activeDelightSellable: row.active_delight_sellable,
    activeRetailerCount: Number(row.active_retailer_count ?? 0),
    brandName: row.brand_name,
    fdaApprovalNumber: row.fda_approval_number,
    id: row.id,
    imageUrl: row.image_url,
    importImageUrls: uniqueTextValues(row.import_image_urls ?? []),
    importSourceUrls: uniqueTextValues(row.import_source_urls ?? []),
    productUrl: row.product_url,
    registerNumbers: uniqueTextValues([
      row.fda_approval_number,
      ...(row.register_numbers ?? [])
    ]),
    retailerNames: uniqueTextValues(row.retailer_names ?? []),
    sourceUrl: row.source_url,
    status: row.status,
    title: row.title,
    validationStatus: row.validation_status
  }));
}

async function loadImagedCatalogueProducts() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  return sql<Array<{
    brand_name: string | null;
    fda_approval_number: string | null;
    id: string;
    image_url: string;
    product_url: string;
    source_url: string | null;
    status: string;
    title: string;
  }>>`
    select
      id::text,
      title,
      brand_name,
      image_url,
      product_url,
      source_url,
      fda_approval_number,
      status
    from public.products
    where image_url is not null
      and btrim(image_url) <> ''
      and status <> 'ignored'
  `;
}

async function buildExistingCatalogueCandidates(
  product: ProductImageRepairProduct,
  imagedProducts: Awaited<ReturnType<typeof loadImagedCatalogueProducts>>
) {
  const normalizedBrandName = normalizeProductKey(product.brandName ?? "");
  const candidates = imagedProducts
    .filter((candidate) =>
      candidate.id !== product.id &&
      normalizeProductKey(candidate.brand_name ?? "") === normalizedBrandName
    )
    .map((candidate): ProductImageRepairCandidate | null => {
      const evidenceText = [
        candidate.title,
        candidate.fda_approval_number,
        candidate.product_url,
        candidate.source_url
      ].filter(Boolean).join(" ");
      const score = productImageCandidateScore({
        brandName: product.brandName,
        candidateTitle: candidate.title,
        evidenceText,
        productTitle: product.title,
        registerNumbers: product.registerNumbers
      });

      return score >= 0.78
        ? {
            evidenceUrl: candidate.source_url ?? candidate.product_url,
            imageUrl: normalizeRemoteImageUrl(candidate.image_url),
            score,
            source: "existing_catalogue",
            sourceTitle: candidate.title
          }
        : null;
    })
    .filter((candidate): candidate is ProductImageRepairCandidate => Boolean(candidate));

  return candidates;
}

function buildImportImageCandidates(product: ProductImageRepairProduct) {
  const evidenceText = [
    product.title,
    product.brandName,
    product.fdaApprovalNumber,
    ...product.registerNumbers,
    ...product.importSourceUrls
  ].filter(Boolean).join(" ");

  return product.importImageUrls.flatMap((imageUrl): ProductImageRepairCandidate[] => {
    const viable = viableImageUrl(imageUrl);

    if (!viable) {
      return [];
    }

    const score = Math.max(0.82, productImageCandidateScore({
      brandName: product.brandName,
      candidateTitle: product.title,
      evidenceText,
      productTitle: product.title,
      registerNumbers: product.registerNumbers
    }));

    return [{
      evidenceUrl: product.importSourceUrls[0] ?? product.sourceUrl ?? product.productUrl,
      imageUrl: normalizeRemoteImageUrl(viable),
      score,
      source: "product_import",
      sourceTitle: product.title
    }];
  });
}

async function fetchHtmlPage(url: string) {
  if (!isHttpUrl(url)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

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

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!/html|text/i.test(contentType)) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildPageCandidates(product: ProductImageRepairProduct) {
  const urls = uniqueTextValues([
    product.productUrl,
    product.sourceUrl,
    ...product.importSourceUrls
  ]).filter(isHttpUrl);
  const candidates: ProductImageRepairCandidate[] = [];

  for (const url of urls.slice(0, 5)) {
    const html = await fetchHtmlPage(url);

    if (!html) {
      continue;
    }

    const pageTitle = titleFromHtml(html);
    const pageText = cleanHtmlText(html).slice(0, 5000);
    const score = productImageCandidateScore({
      brandName: product.brandName,
      candidateTitle: pageTitle,
      evidenceText: pageText,
      productTitle: product.title,
      registerNumbers: product.registerNumbers
    });

    if (score < 0.7) {
      continue;
    }

    const imageUrls = [
      ...productJsonLdImagesFromHtml(html, url),
      ...imageUrlsFromHtml(html, url)
    ];
    const source: ProductImageCandidateSource =
      url === product.productUrl ? "product_page" : "source_page";

    for (const imageUrl of uniqueTextValues(imageUrls).slice(0, 8)) {
      const viable = viableImageUrl(imageUrl);

      if (!viable) {
        continue;
      }

      candidates.push({
        evidenceUrl: url,
        imageUrl: normalizeRemoteImageUrl(viable),
        score,
        source,
        sourceTitle: pageTitle
      });
    }
  }

  return candidates;
}

async function buildSearchCandidates(product: ProductImageRepairProduct) {
  const query = [
    product.brandName,
    product.title,
    product.fdaApprovalNumber,
    product.registerNumbers[0],
    "product"
  ].filter(Boolean).join(" ");
  const results = await duckDuckGoImageResults(query);

  return results.flatMap((result): ProductImageRepairCandidate[] => {
    const imageUrl = viableImageUrl(result.image ?? result.thumbnail);
    const text = candidateText(result);
    const score = productImageCandidateScore({
      brandName: product.brandName,
      candidateTitle: result.title ?? null,
      evidenceText: text,
      productTitle: product.title,
      registerNumbers: product.registerNumbers
    });
    const hostPriority = imageHostPriority(result.url ?? imageUrl);
    const minimumScore = minimumSearchScore({
      brandMatches: brandEvidenceMatches(product.brandName, text),
      hostPriority,
      text
    });

    if (!imageUrl || score < minimumScore) {
      return [];
    }

    return [{
      evidenceUrl: cleanText(result.url, 3000),
      imageUrl: normalizeRemoteImageUrl(imageUrl),
      score: score + Math.max(0, 0.08 - hostPriority * 0.02),
      source: "duckduckgo_image_search",
      sourceTitle: cleanText(result.title, 500)
    }];
  });
}

async function validateCandidates(
  candidates: readonly ProductImageRepairCandidate[]
) {
  const sorted = [...candidates]
    .filter((candidate) => !candidateIsGenericOrUnsafe([
      candidate.imageUrl,
      candidate.evidenceUrl,
      candidate.sourceTitle
    ].filter(Boolean).join(" ")))
    .sort((first, second) => second.score - first.score);
  const validated: ProductImageRepairCandidate[] = [];
  const failedReasons: ProductImageUnresolvedReason[] = [];

  for (const candidate of sorted.slice(0, 12)) {
    const validation = await fetchImageBuffer(candidate.imageUrl);

    if (!validation.ok) {
      failedReasons.push(validation.reason);
      continue;
    }

    validated.push({
      ...candidate,
      bytes: validation.bytes,
      contentType: validation.contentType,
      extension: validation.extension,
      height: validation.height,
      width: validation.width
    });

    if (validated.length >= 2) {
      break;
    }
  }

  return {
    failedReasons,
    validated
  };
}

async function bestProductImageCandidate(input: Readonly<{
  imagedProducts: Awaited<ReturnType<typeof loadImagedCatalogueProducts>>;
  product: ProductImageRepairProduct;
}>) {
  const sourceBatches = [
    await buildExistingCatalogueCandidates(input.product, input.imagedProducts),
    buildImportImageCandidates(input.product),
    await buildPageCandidates(input.product),
    await buildSearchCandidates(input.product)
  ];
  const candidates = sourceBatches.flat();
  const { failedReasons, validated } = await validateCandidates(candidates);

  if (validated.length === 0) {
    return {
      candidate: null,
      detail: failedReasons.length > 0 ? failedReasons.join(", ") : null,
      reason: failedReasons[0] ?? (candidates.length > 0 ? "low_confidence" : "no_candidate")
    } as const;
  }

  const [best, second] = validated.sort((first, secondCandidate) =>
    secondCandidate.score - first.score
  );

  if (second && Math.abs(best.score - second.score) < AMBIGUOUS_SCORE_DELTA) {
    return {
      candidate: null,
      detail: `${best.source}:${best.sourceTitle ?? best.imageUrl} vs ${second.source}:${second.sourceTitle ?? second.imageUrl}`,
      reason: "ambiguous_match" as const
    };
  }

  return {
    candidate: best,
    detail: null,
    reason: null
  } as const;
}

async function updateProductImage(input: Readonly<{
  candidate: ProductImageRepairCandidate;
  environment: ProductImageRepairEnvironment;
  originalImageUrl: string | null;
  product: ProductImageRepairProduct;
  stored: StoredProductImage;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const metadata = {
    productImageRepair: {
      environment: input.environment,
      evidenceUrl: input.candidate.evidenceUrl,
      height: input.candidate.height ?? null,
      imageUrl: input.candidate.imageUrl,
      mirroredImageUrl: input.stored.cdnUrl,
      score: input.candidate.score,
      source: input.candidate.source,
      sourceTitle: input.candidate.sourceTitle,
      storageKey: input.stored.key,
      updatedAt: new Date().toISOString(),
      width: input.candidate.width ?? null
    }
  };

  await sql`
    update public.products
    set
      image_url = ${input.stored.cdnUrl},
      source_snapshot = source_snapshot || ${sql.json(toJsonValue(metadata))}::jsonb,
      updated_at = now()
    where id = ${input.product.id}::uuid
      and (
        ${input.originalImageUrl}::text is null
        or image_url is null
        or image_url = ${input.originalImageUrl}
      )
  `;

  await sql`
    update public.product_imports
    set
      image_urls = case
        when not (${input.stored.cdnUrl} = any(image_urls)) then array_prepend(${input.stored.cdnUrl}, image_urls)
        else image_urls
      end,
      raw_snapshot = raw_snapshot || ${sql.json(toJsonValue(metadata))}::jsonb,
      updated_at = now()
    where product_id = ${input.product.id}::uuid
  `;
}

function incrementCount(
  counts: Record<string, {
    broken: number;
    missing: number;
    unresolved: number;
    updated: number;
  }>,
  key: string,
  field: "broken" | "missing" | "unresolved" | "updated"
) {
  counts[key] ??= {
    broken: 0,
    missing: 0,
    unresolved: 0,
    updated: 0
  };
  counts[key][field] += 1;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text)
    ? `"${text.replace(/"/g, "\"\"")}"`
    : text;
}

export function productImageRepairReportCsv(report: ProductImageRepairReport) {
  const header = [
    "status",
    "product_id",
    "title",
    "brand",
    "issue",
    "reason",
    "old_image_url",
    "new_image_url",
    "source",
    "evidence_url",
    "score",
    "active_delight_sellable",
    "storage_key",
    "detail"
  ];
  const resolvedRows = report.resolved.map((row) => [
    row.updated ? "updated" : "resolved_dry_run",
    row.id,
    row.title,
    row.brandName ?? "",
    row.issue,
    "",
    row.oldImageUrl ?? "",
    row.newImageUrl ?? "",
    row.source,
    row.evidenceUrl ?? "",
    row.score.toFixed(3),
    row.activeDelightSellable,
    row.storageKey ?? "",
    row.sourceTitle ?? ""
  ]);
  const unresolvedRows = report.unresolved.map((row) => [
    "unresolved",
    row.id,
    row.title,
    row.brandName ?? "",
    row.issue,
    row.reason,
    row.oldImageUrl ?? "",
    "",
    "",
    "",
    "",
    row.activeDelightSellable,
    "",
    row.detail ?? ""
  ]);

  return [header, ...resolvedRows, ...unresolvedRows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n") + "\n";
}

async function writeReports(report: ProductImageRepairReport, input: RunProductImageRepairInput) {
  if (input.outputPath) {
    const absolute = path.resolve(input.outputPath);
    const temporary = `${absolute}.tmp`;

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(temporary, absolute);
  }

  if (input.csvOutputPath) {
    const absolute = path.resolve(input.csvOutputPath);
    const temporary = `${absolute}.tmp`;

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(temporary, productImageRepairReportCsv(report), "utf8");
    await rename(temporary, absolute);
  }
}

export async function runProductImageRepair(input: RunProductImageRepairInput) {
  const spacesConfig = productImageRepairSpacesConfigFromEnv();

  validateProductImageRepairOptions({
    apply: input.apply,
    spacesConfig
  });

  const products = await loadProductImageRepairProducts();
  const imagedProducts = await loadImagedCatalogueProducts();
  const limit = input.limit
    ? Math.max(1, Math.round(input.limit))
    : products.length || 1;
  const selected = products.slice(0, limit);
  const before = {
    broken: 0,
    healthy: 0,
    missing: 0
  };
  const brandCounts: ProductImageRepairReport["brandCounts"] = {};
  const retailerCounts: ProductImageRepairReport["retailerCounts"] = {};
  const resolved: ProductImageRepairResolvedRow[] = [];
  const unresolved: ProductImageRepairUnresolvedRow[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const product of selected) {
    const existingReachable = product.imageUrl
      ? await imageUrlLooksReachable(product.imageUrl)
      : false;
    const imageState = classifyProductImageState({
      force: input.force,
      imageUrl: product.imageUrl,
      reachable: existingReachable
    });

    if (imageState.healthy || !imageState.issue) {
      before.healthy += 1;
      continue;
    }

    before[imageState.issue === "missing_image" ? "missing" : "broken"] += 1;
    const brandKey = product.brandName ?? "Unknown brand";

    incrementCount(
      brandCounts,
      brandKey,
      imageState.issue === "missing_image" ? "missing" : "broken"
    );

    for (const retailerName of product.retailerNames) {
      incrementCount(
        retailerCounts,
        retailerName,
        imageState.issue === "missing_image" ? "missing" : "broken"
      );
    }

    const best = await bestProductImageCandidate({
      imagedProducts,
      product
    });

    if (!best.candidate) {
      unresolved.push({
        activeDelightSellable: product.activeDelightSellable,
        brandName: product.brandName,
        detail: best.detail,
        id: product.id,
        issue: imageState.issue,
        oldImageUrl: product.imageUrl,
        reason: best.reason,
        title: product.title
      });
      incrementCount(brandCounts, brandKey, "unresolved");

      for (const retailerName of product.retailerNames) {
        incrementCount(retailerCounts, retailerName, "unresolved");
      }

      await sleep(Math.max(0, Math.round(input.delayMs ?? 350)));
      continue;
    }

    let stored: StoredProductImage | null = null;

    if (input.apply) {
      if (!spacesConfig) {
        throw new Error("Product image repair storage config became unavailable.");
      }

      if (!best.candidate.bytes || !best.candidate.contentType || !best.candidate.extension) {
        unresolved.push({
          activeDelightSellable: product.activeDelightSellable,
          brandName: product.brandName,
          detail: "validated candidate did not include image bytes",
          id: product.id,
          issue: imageState.issue,
          oldImageUrl: product.imageUrl,
          reason: "decode_failed",
          title: product.title
        });
        await sleep(Math.max(0, Math.round(input.delayMs ?? 350)));
        continue;
      }

      stored = await uploadProductImageToSpaces({
        candidate: {
          ...best.candidate,
          bytes: best.candidate.bytes,
          contentType: best.candidate.contentType,
          extension: best.candidate.extension
        },
        config: spacesConfig,
        environment: input.environment,
        product
      });
      await updateProductImage({
        candidate: best.candidate,
        environment: input.environment,
        originalImageUrl: product.imageUrl,
        product,
        stored
      });
      incrementCount(brandCounts, brandKey, "updated");

      for (const retailerName of product.retailerNames) {
        incrementCount(retailerCounts, retailerName, "updated");
      }
    }

    sourceCounts[best.candidate.source] =
      (sourceCounts[best.candidate.source] ?? 0) + 1;
    resolved.push({
      activeDelightSellable: product.activeDelightSellable,
      brandName: product.brandName,
      evidenceUrl: best.candidate.evidenceUrl,
      id: product.id,
      issue: imageState.issue,
      newImageUrl: stored?.cdnUrl ?? null,
      oldImageUrl: product.imageUrl,
      score: best.candidate.score,
      source: best.candidate.source,
      sourceTitle: best.candidate.sourceTitle,
      storageKey: stored?.key ?? null,
      title: product.title,
      updated: Boolean(input.apply)
    });

    await sleep(Math.max(0, Math.round(input.delayMs ?? 350)));
  }

  const report: ProductImageRepairReport = {
    applied: Boolean(input.apply),
    before,
    brandCounts,
    checked: selected.length,
    dryRun: !input.apply,
    environment: input.environment,
    generatedAt: new Date().toISOString(),
    resolved,
    retailerCounts,
    skippedHealthy: before.healthy,
    sourceCounts,
    updated: input.apply ? resolved.length : 0,
    unresolved
  };

  await writeReports(report, input);
  await closeSqlPool();

  return report;
}

export function defaultProductImageRepairReportPaths(
  environment: ProductImageRepairEnvironment
) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stem = path.join("reports", `product-image-repair-${environment}-${stamp}`);

  return {
    csvOutputPath: `${stem}.csv`,
    outputPath: `${stem}.json`
  };
}
