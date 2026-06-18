import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJsonValue } from "@/lib/assessment-store";
import { closeSqlPool, getSql } from "@/lib/db";
import { normalizeProductKey } from "@/lib/product-recommendations";

type MissingImageProduct = Readonly<{
  brandName: string | null;
  id: string;
  registerNumber: string | null;
  title: string;
}>;

type ImagedProduct = Readonly<{
  brandName: string | null;
  id: string;
  imageUrl: string;
  productUrl: string;
  sourceUrl: string | null;
  status: string;
  title: string;
}>;

type ImageBackfillCandidate = Readonly<{
  evidenceUrl: string | null;
  imageUrl: string;
  score: number;
  source: "existing_catalogue" | "duckduckgo_image_search";
  sourceTitle: string | null;
}>;

export type DelightImageBackfillResult = Readonly<{
  applied: boolean;
  generatedAt: string;
  missingBefore: number;
  missingAfter: number;
  resolved: Array<{
    brandName: string | null;
    evidenceUrl: string | null;
    id: string;
    imageUrl: string;
    score: number;
    source: string;
    sourceTitle: string | null;
    title: string;
  }>;
  sourced: number;
  sourceCounts: Record<string, number>;
  updated: number;
  unresolved: Array<{ brandName: string | null; id: string; title: string }>;
}>;

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

export function productTokens(value: string, brandName?: string | null) {
  const brandPattern = brandName
    ? new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    : null;
  const ignored = new Set([
    "and",
    "the",
    "with",
    "plus",
    "dietary",
    "supplement",
    "product",
    "capsule",
    "capsules",
    "cap",
    "caps",
    "tablet",
    "tablets",
    "tab",
    "tabs",
    "softgel",
    "softgels",
    "bottle",
    "box",
    "piece",
    "pack",
    "mg",
    "mcg",
    "iu",
    "ml",
    "g",
    "s"
  ]);
  const allowedSingleTokens = new Set(["a", "b", "c", "d", "e", "k"]);
  const normalized = value
    .toLowerCase()
    .replace(brandPattern ?? /$a/, " ")
    .replace(/(\d+)(mg|mcg|iu|ml|g)\b/gi, "$1 $2")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9ก-๙]+/g, " ");

  return normalized
    .split(/\s+/)
    .filter((token) =>
      (token.length > 1 || allowedSingleTokens.has(token)) && !ignored.has(token)
    );
}

export function tokenScore(
  productTitle: string,
  candidateTitle: string,
  brandName?: string | null
) {
  const product = productTokens(productTitle, brandName);
  const candidate = productTokens(candidateTitle, brandName);

  if (product.length < 1 || candidate.length < 1) {
    return 0;
  }

  const productSet = new Set(product);
  const candidateSet = new Set(candidate);
  const productCoverage =
    product.filter((token) => candidateSet.has(token)).length / product.length;
  const candidateCoverage =
    candidate.filter((token) => productSet.has(token)).length / candidate.length;

  return productCoverage * 0.7 + candidateCoverage * 0.3;
}

function bestExistingImageCandidate(
  product: MissingImageProduct,
  imagedProducts: readonly ImagedProduct[]
): ImageBackfillCandidate | null {
  const normalizedBrandName = normalizeProductKey(product.brandName ?? "");
  const candidates = imagedProducts
    .filter((candidate) =>
      normalizeProductKey(candidate.brandName ?? "") === normalizedBrandName &&
      candidate.id !== product.id
    )
    .map((candidate) => ({
      candidate,
      score: tokenScore(product.title, candidate.title, product.brandName)
    }))
    .filter((item) => item.score >= 0.78)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return best
    ? {
        evidenceUrl: best.candidate.sourceUrl ?? best.candidate.productUrl,
        imageUrl: best.candidate.imageUrl,
        score: best.score,
        source: "existing_catalogue",
        sourceTitle: best.candidate.title
      }
    : null;
}

function extractDuckDuckGoVqd(html: string) {
  return html.match(/vqd=["']?([^"'&]+)/)?.[1] ?? null;
}

type DuckDuckGoImageResult = Readonly<{
  height?: number;
  image?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
  width?: number;
}>;

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

  return payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: DuckDuckGoImageResult[] }).results
    : [];
}

function imageHostPriority(value: string | null | undefined) {
  const url = cleanText(value, 2000)?.toLowerCase() ?? "";

  if (/blackmores|megawecare|vistra|centrum|caltrate|maxxlife|berocca|alinamin|healthaid|unilab/.test(url)) {
    return 0;
  }

  if (/watsons|boots|konvy|fascino|doctormhealth|healthymax|pharmacy/.test(url)) {
    return 1;
  }

  if (/susercontent|shopee|lazada/.test(url)) {
    return 2;
  }

  return 4;
}

const NON_HEALTH_IMAGE_RESULT_PATTERN =
  /\b(?:agricole|ayam|cat|cfmoto|chicken|dog|motorcycle|motorsport|pet|poultry|quad|renouveau|utv|vehicle)\b/i;
const HEALTH_IMAGE_RESULT_PATTERN =
  /\b(?:caps?|capsule|capsules|drug|health|immune|mineral|pharma|pharmacy|supplement|tablet|tablets|vitamin|วิตามิน|ยา|เม็ด|แคปซูล)\b/i;

function candidateText(result: DuckDuckGoImageResult) {
  return [result.title, result.url, result.image]
    .filter((value): value is string => Boolean(cleanText(value, 2000)))
    .join(" ");
}

function compactProductKey(value: string) {
  return normalizeProductKey(value).replace(/_/g, "");
}

function brandEvidenceMatches(brandName: string | null | undefined, text: string) {
  const brandKey = normalizeProductKey(brandName ?? "");

  if (!brandKey) {
    return false;
  }

  const haystackKey = normalizeProductKey(text);
  const haystackTokens = new Set(haystackKey.split("_").filter(Boolean));
  const aliases = [
    brandKey,
    compactProductKey(brandKey),
    ...brandKey.split("_").filter((token) => token.length >= 3)
  ].filter(Boolean);

  return aliases.some((alias) => {
    const normalizedAlias = normalizeProductKey(alias);

    if (!normalizedAlias) {
      return false;
    }

    if (normalizedAlias.length <= 3) {
      return haystackTokens.has(normalizedAlias);
    }

    return haystackKey.includes(normalizedAlias) ||
      compactProductKey(haystackKey).includes(compactProductKey(normalizedAlias));
  });
}

function minimumSearchScore(input: Readonly<{
  brandMatches: boolean;
  hostPriority: number;
  text: string;
}>) {
  if (NON_HEALTH_IMAGE_RESULT_PATTERN.test(input.text)) {
    return Number.POSITIVE_INFINITY;
  }

  if (!input.brandMatches) {
    return 0.86;
  }

  if (input.hostPriority <= 2) {
    return 0.68;
  }

  return HEALTH_IMAGE_RESULT_PATTERN.test(input.text) ? 0.76 : 0.82;
}

function viableImageUrl(value: unknown) {
  const url = cleanText(value, 3000);

  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  if (/\.(?:svg|gif)(?:\?|$)/i.test(url)) {
    return null;
  }

  return url;
}

async function imageUrlLooksReachable(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      method: "GET",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";

    return response.ok && (
      contentType.startsWith("image/") ||
      /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function bestSearchImageCandidate(
  product: MissingImageProduct
): Promise<ImageBackfillCandidate | null> {
  const query = [
    product.brandName,
    product.title,
    product.registerNumber,
    "product"
  ].filter(Boolean).join(" ");
  const results = await duckDuckGoImageResults(query);
  const scored = results
    .map((result) => {
      const imageUrl = viableImageUrl(result.image ?? result.thumbnail);
      const text = candidateText(result);
      const score = tokenScore(product.title, text, product.brandName);
      const hostPriority = imageHostPriority(result.url ?? imageUrl);
      const minimumScore = minimumSearchScore({
        brandMatches: brandEvidenceMatches(product.brandName, text),
        hostPriority,
        text
      });

      return imageUrl && score >= minimumScore
        ? {
            result,
            imageUrl,
            score: score + Math.max(0, 0.08 - hostPriority * 0.02)
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const item of scored) {
    if (await imageUrlLooksReachable(item.imageUrl)) {
      return {
        evidenceUrl: cleanText(item.result.url, 3000),
        imageUrl: item.imageUrl,
        score: item.score,
        source: "duckduckgo_image_search",
        sourceTitle: cleanText(item.result.title, 500)
      };
    }
  }

  return null;
}

async function loadMissingDelightImages() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  return sql<Array<{
    brand_name: string | null;
    id: string;
    register_number: string | null;
    title: string;
  }>>`
    select
      products.id::text,
      products.title,
      products.brand_name,
      products.source_snapshot -> 'sheet' ->> 'registerNumber' as register_number
    from public.retail_sellable_products sellable
    join public.organisations org on org.id = sellable.organisation_id
    join public.products products on products.id = sellable.product_id
    where org.name ilike 'Delight%'
      and sellable.status = 'active'
      and products.image_url is null
    order by products.brand_name, products.title
  `.then((rows) => rows.map((row): MissingImageProduct => ({
    brandName: row.brand_name,
    id: row.id,
    registerNumber: row.register_number,
    title: row.title
  })));
}

async function loadImagedProducts() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  return sql<Array<{
    brand_name: string | null;
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
      status
    from public.products
    where image_url is not null
      and status <> 'ignored'
  `.then((rows) => rows.map((row): ImagedProduct => ({
    brandName: row.brand_name,
    id: row.id,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    sourceUrl: row.source_url,
    status: row.status,
    title: row.title
  })));
}

async function updateProductImage(
  product: MissingImageProduct,
  candidate: ImageBackfillCandidate
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const metadata = {
    delightImageBackfill: {
      evidenceUrl: candidate.evidenceUrl,
      imageUrl: candidate.imageUrl,
      score: candidate.score,
      source: candidate.source,
      sourceTitle: candidate.sourceTitle,
      updatedAt: new Date().toISOString()
    }
  };

  await sql`
    update public.products
    set
      image_url = ${candidate.imageUrl},
      source_snapshot = source_snapshot || ${sql.json(toJsonValue(metadata))}::jsonb,
      updated_at = now()
    where id = ${product.id}::uuid
      and image_url is null
  `;

  await sql`
    update public.product_imports
    set
      image_urls = case
        when cardinality(image_urls) = 0 then array[${candidate.imageUrl}]::text[]
        else image_urls
      end,
      raw_snapshot = raw_snapshot || ${sql.json(toJsonValue(metadata))}::jsonb,
      updated_at = now()
    where product_id = ${product.id}::uuid
  `;
}

async function writeReport(outputPath: string | null, report: DelightImageBackfillResult) {
  if (!outputPath) {
    return;
  }

  const absolute = path.resolve(outputPath);
  const temporary = `${absolute}.tmp`;

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporary, absolute);
}

export async function runDelightProductImageBackfill(input: Readonly<{
  apply?: boolean;
  delayMs?: number;
  limit?: number;
  outputPath?: string | null;
}>) {
  const missing = await loadMissingDelightImages();
  const imagedProducts = await loadImagedProducts();
  const limit = Math.max(1, Math.round(input.limit ?? (missing.length || 1)));
  const selected = missing.slice(0, limit);
  const resolved = new Map<string, ImageBackfillCandidate>();
  const resolvedRows: DelightImageBackfillResult["resolved"] = [];
  const unresolved: DelightImageBackfillResult["unresolved"] = [];

  for (const product of selected) {
    const existing = bestExistingImageCandidate(product, imagedProducts);
    const candidate = existing ?? await bestSearchImageCandidate(product);

    if (candidate) {
      resolved.set(product.id, candidate);
      resolvedRows.push({
        brandName: product.brandName,
        evidenceUrl: candidate.evidenceUrl,
        id: product.id,
        imageUrl: candidate.imageUrl,
        score: candidate.score,
        source: candidate.source,
        sourceTitle: candidate.sourceTitle,
        title: product.title
      });

      if (input.apply) {
        await updateProductImage(product, candidate);
      }
    } else {
      unresolved.push({
        brandName: product.brandName,
        id: product.id,
        title: product.title
      });
    }

    await sleep(Math.max(0, Math.round(input.delayMs ?? 350)));
  }

  const sourceCounts: Record<string, number> = {};

  for (const candidate of resolved.values()) {
    sourceCounts[candidate.source] = (sourceCounts[candidate.source] ?? 0) + 1;
  }

  const missingAfter = input.apply
    ? (await loadMissingDelightImages()).length
    : missing.length - resolved.size;
  const report: DelightImageBackfillResult = {
    applied: Boolean(input.apply),
    generatedAt: new Date().toISOString(),
    missingAfter,
    missingBefore: missing.length,
    resolved: resolvedRows,
    sourced: resolved.size,
    sourceCounts,
    updated: input.apply ? resolved.size : 0,
    unresolved
  };

  await writeReport(input.outputPath ?? null, report);
  await closeSqlPool();

  return report;
}
