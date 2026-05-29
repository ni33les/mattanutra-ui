import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getSql } from "@/lib/db";
import {
  parseMegaWeCareThaiFacts,
  productEvidenceHash
} from "@/lib/megawecare-import";
import {
  extractDhcProductId,
  isDhcSupplementProduct,
  parseDhcFacts
} from "@/lib/dhc-import";
import {
  isSwisseSkincareOnlyProduct,
  parseSwisseFacts
} from "@/lib/swisse-import";
import {
  extractVistraFdaNumber,
  parseVistraThaiFacts
} from "@/lib/vistra-import";
import {
  createAdminProduct,
  deletePendingManufacturerImportProduct,
  finishProductImportRun,
  resolveProductImportReview,
  stageProductImport,
  startProductImportRun,
  updateAdminProduct,
  upsertProductOffer,
  validateProductImportForApproval,
  type ProductImportFactInput
} from "@/lib/admin-products";
import { translateDraftProductCopyWithAi } from "@/lib/product-copy-translation";
import {
  correctDraftProductFactsWithAi,
  enrichDraftProductCatalogueWithAi,
  recoverDraftProductFactsWithAi
} from "@/lib/product-fact-correction";
import {
  normalizeProductKey,
  normalizeProductFactKey,
  normalizeProductFactName
} from "@/lib/product-recommendations";

const REQUEST_TIMEOUT_MS = 20_000;
const execFileAsync = promisify(execFile);

const INITIAL_BRANDS = new Set([
  "blackmores",
  "centrum",
  "dhc",
  "mega we care",
  "nature made",
  "swisse",
  "vistra"
]);

const BRAND_PRODUCT_PRESETS: Record<string, string[]> = {
  blackmores: [
    "https://www.blackmores.co.th/en/products/supplement/2099-blackmores-multivitamin-active",
    "https://www.blackmores.co.th/en/products/supplement/2096-blackmores-multivitamin-nutri-50-dietary-suppleme",
    "https://www.blackmores.co.th/en/products/supplement/2115-blackmores-koala-multivitamin-mineral",
    "https://www.blackmores.co.th/en/products/supplement/2118-blackmores-bio-zinc-a-chelate",
    "https://www.blackmores.co.th/en/products/supplement/2122-blackmores-bio-calciumd3"
  ]
};

const BRAND_DISCOVERY_PAGES: Record<string, string[]> = {
  blackmores: [
    "https://www.blackmores.com.au/products",
    "https://www.blackmores.co.th/en/products/supplement"
  ],
  centrum: [
    "https://www.centrum.com/products/"
  ],
  "mega we care": [
    "https://www.megawecare.co.th/en/product-category/supplement/"
  ],
  swisse: [
    "https://swisse.co.th/collections/all"
  ],
  dhc: [
    "https://www.dhc.co.jp/health/health/"
  ],
  vistra: [
    "https://www.vistra.co.th/product-category/heath-wellness_th/"
  ]
};

type ScrapedManufacturerProduct = Readonly<{
  brandName: string;
  description: string | null;
  descriptionEn: string | null;
  descriptionTh: string | null;
  fdaApprovalNumber: string | null;
  imageUrls: string[];
  parsedFacts: readonly ProductImportFactInput[];
  productTitle: string;
  skipReason?: string | null;
  titleEn: string | null;
  titleTh: string | null;
  translations?: Record<string, {
    description?: string | null;
    status?: "complete" | "draft" | "missing";
    title?: string | null;
  }>;
  rawSnapshot: Record<string, unknown>;
  sourceUrl: string;
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

async function delay(ms: number) {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function concurrentMapOrdered<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, items.length)) },
      () => worker()
    )
  );

  return results;
}

function isRetryableNetworkError(error: unknown) {
  const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);

  return /fetch failed|CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|aborted/i.test(message);
}

function normalizeBrand(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function languageFromUrl(url: string) {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase();

    if (segment === "en" || segment === "th") {
      return segment;
    }
  } catch {
    return null;
  }

  return null;
}

function languageFromHtml(html: string) {
  const lang =
    html.match(/<html\b[^>]*\blang=["']?([a-z]{2})(?:[-_][a-z]{2})?["'\s>]/i)?.[1] ??
    html.match(/<meta\b[^>]*(?:property|name)=["']og:locale["'][^>]*content=["']([a-z]{2})[-_][a-z]{2}["'][^>]*>/i)?.[1] ??
    html.match(/<meta\b[^>]*content=["']([a-z]{2})[-_][a-z]{2}["'][^>]*(?:property|name)=["']og:locale["'][^>]*>/i)?.[1];

  if (!lang) {
    return null;
  }

  const normalized = lang.toLowerCase();

  return normalized === "en" || normalized === "th" ? normalized : normalized;
}

function manufacturerHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9,th;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
}

async function fetchWithCurl(url: string, accept: string) {
  const marker = "\n__MATTANUTRA_HTTP_STATUS__:";
  const { stdout } = await execFileAsync(
    "curl",
    [
      "--max-time",
      String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
      "-sL",
      "-H",
      `Accept: ${accept}`,
      "-H",
      "Accept-Language: en-GB,en;q=0.9,th;q=0.8",
      "-H",
      "Cache-Control: no-cache",
      "-H",
      `User-Agent: ${manufacturerHeaders()["User-Agent"]}`,
      "-w",
      `${marker}%{http_code}`,
      url
    ],
    { maxBuffer: 8_000_000 }
  );
  const markerIndex = stdout.lastIndexOf(marker);
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const status = markerIndex >= 0
    ? Number(stdout.slice(markerIndex + marker.length).trim())
    : 200;

  if (Number.isFinite(status) && status >= 400) {
    throw new Error(`${url} returned ${status}`);
  }

  return body;
}

async function fetchHtml(url: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: manufacturerHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 403) {
          return await fetchWithCurl(url, manufacturerHeaders().Accept);
        }

        throw new Error(`${url} returned ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt >= 4 || !isRetryableNetworkError(error)) {
        throw error;
      }

      await delay(attempt * 1_000);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function fetchJson(url: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          ...manufacturerHeaders(),
          Accept: "application/json,text/plain,*/*"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 403) {
          return JSON.parse(await fetchWithCurl(url, "application/json,text/plain,*/*")) as unknown;
        }

        throw new Error(`${url} returned ${response.status}`);
      }

      return await response.json() as unknown;
    } catch (error) {
      lastError = error;

      if (attempt >= 4 || !isRetryableNetworkError(error)) {
        throw error;
      }

      await delay(attempt * 1_000);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function productUrlsFromListingHtml(html: string, listingUrl: string) {
  const patterns = [
    /href=["']([^"']*\/(?:en|th)\/products\/supplement\/[^"']+)["']/gi,
    /href=["']([^"']*\/products\/[a-z0-9][^"']*)["']/gi,
    /href=["']([^"']*\/product\/[a-z0-9][^"']*)["']/gi
  ];
  const matches = patterns.flatMap((pattern) => [...html.matchAll(pattern)]);
  const baseUrl = new URL(listingUrl);
  const baseHost = baseUrl.hostname.replace(/^www\./i, "");

  return matches.flatMap((match) => {
    try {
      const url = new URL(match[1], baseUrl);
      const path = url.pathname.toLowerCase();
      const host = url.hostname.replace(/^www\./i, "");
      const segments = path.split("/").filter(Boolean);

      if (
        host !== baseHost ||
        path.includes("/wp-json/") ||
        path === "/products" ||
        path === "/products/" ||
        path.includes("/product-category/") ||
        path.includes("/product-tag/") ||
        path.includes("/product_cat/") ||
        path.endsWith(".oembed")
      ) {
        return [];
      }

      if (
        host === "blackmores.com.au" &&
        segments[0] === "products" &&
        (
          segments.length !== 2 ||
          [
            "best-sellers",
            "by-category",
            "by-ingredient",
            "new-products",
            "vegan-certified"
          ].includes(segments[1] ?? "")
        )
      ) {
        return [];
      }

      if (
        host === "centrum.com" &&
        (
          segments[0] !== "products" ||
          segments.length < 3 ||
          path.includes("/coupons") ||
          path.includes("/articles")
        )
      ) {
        return [];
      }

      return [normalizedUrlWithoutHash(url.toString(), baseUrl)];
    } catch {
      return [];
    }
  });
}

function normalizedUrlWithoutHash(input: string, baseUrl: URL) {
  const url = new URL(input, baseUrl);
  url.hash = "";

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

function parseNextData(html: string) {
  const json = html.match(/<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i)?.[1];

  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function findHitArrays(value: unknown, output: unknown[][] = []) {
  if (!value || typeof value !== "object") {
    return output;
  }

  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      value.some((item) => {
        const record = item && typeof item === "object" && "body" in item
          ? (item as { body?: unknown }).body
          : item;

        return Boolean(record && typeof record === "object" && "title" in record);
      })
    ) {
      output.push(value);
    }

    for (const item of value.slice(0, 5)) {
      findHitArrays(item, output);
    }

    return output;
  }

  for (const child of Object.values(value)) {
    findHitArrays(child, output);
  }

  return output;
}

function productUrlsFromBlackmoresAuNextData(html: string, listingUrl: string) {
  const baseUrl = new URL(listingUrl);

  if (baseUrl.hostname.replace(/^www\./i, "") !== "blackmores.com.au") {
    return [];
  }

  const data = parseNextData(html);
  const hitArrays = findHitArrays(data);
  const hits = hitArrays.sort((first, second) => second.length - first.length)[0] ?? [];
  const urls: string[] = [];
  let skipped = 0;

  for (const hit of hits) {
    const record = hit && typeof hit === "object" && "body" in hit
      ? (hit as { body?: unknown }).body
      : hit;

    if (!record || typeof record !== "object") {
      skipped += 1;
      continue;
    }

    const urlValue = (record as { url?: unknown }).url;
    const titleValue = (record as { title?: unknown }).title;

    if (typeof urlValue !== "string" || /^random product/i.test(String(titleValue ?? ""))) {
      skipped += 1;
      continue;
    }

    try {
      const url = new URL(urlValue, baseUrl);
      const segments = url.pathname.toLowerCase().split("/").filter(Boolean);

      if (
        url.hostname.replace(/^www\./i, "") === "blackmores.com.au" &&
        segments[0] === "products" &&
        segments.length === 2
      ) {
        urls.push(url.toString().replace(/#.*$/, ""));
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  if (hits.length > 0) {
    console.log(
      `[discover] Blackmores AU search state reports ${hits.length} items; ${new Set(urls).size} importable product pages, ${skipped} skipped`
    );
  }

  return urls;
}

function findProductRecordWithVariants(
  value: unknown,
  depth = 0
): Record<string, unknown> | null {
  if (depth > 10) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const record = findProductRecordWithVariants(item, depth + 1);

      if (record) {
        return record;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.productVariants)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const record = findProductRecordWithVariants(child, depth + 1);

    if (record) {
      return record;
    }
  }

  return null;
}

async function megaWeCareProductRecordsFromApi() {
  const endpoint = "https://www.megawecare.co.th/wp-json/wp/v2/product?product_cat=177&per_page=100&_embed=1";
  const payload = await fetchJson(endpoint);

  return Array.isArray(payload)
    ? payload.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

async function megaWeCareProductUrlsFromApi() {
  const records = await megaWeCareProductRecordsFromApi();
  const urls = records.flatMap((record) => {
    const link = typeof record.link === "string" ? record.link : null;

    return link ? [link] : [];
  });

  console.log(
    `[discover] Mega We Care WordPress API returned ${records.length} supplement products; ${new Set(urls).size} importable product pages`
  );

  return [...new Set(urls)];
}

async function swisseProductUrlsFromCollections() {
  const baseUrl = "https://swisse.co.th/collections/all";
  const discovered = new Set<string>();

  for (let page = 1; page <= 10; page += 1) {
    const listingUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
    const html = await fetchHtml(listingUrl);
    const pageUrls = productUrlsFromListingHtml(html, listingUrl)
      .filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.hostname.replace(/^www\./i, "") === "swisse.co.th" &&
            parsed.pathname.toLowerCase().split("/").includes("products");
        } catch {
          return false;
        }
      });
    let added = 0;

    for (const rawUrl of pageUrls) {
      const url = canonicalSwisseProductUrl(rawUrl);

      if (url && !discovered.has(url)) {
        discovered.add(url);
        added += 1;
      }
    }

    if (pageUrls.length === 0 || (page > 1 && added === 0)) {
      break;
    }
  }

  console.log(
    `[discover] Swisse Thailand collections returned ${discovered.size} importable product pages`
  );

  return [...discovered];
}

function canonicalSwisseProductUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "products");
    const slug = productIndex >= 0 ? segments[productIndex + 1] : null;

    if (
      url.hostname.replace(/^www\./i, "") !== "swisse.co.th" ||
      !slug ||
      slug.includes(".")
    ) {
      return null;
    }

    return `https://swisse.co.th/products/${slug}`;
  } catch {
    return null;
  }
}

function canonicalVistraProductUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "product");
    const slug = productIndex >= 0 ? segments[productIndex + 1] : null;

    if (
      url.hostname.replace(/^www\./i, "") !== "vistra.co.th" ||
      !slug ||
      slug.includes(".")
    ) {
      return null;
    }

    return `https://www.vistra.co.th/product/${slug}/`;
  } catch {
    return null;
  }
}

function canonicalDhcProductUrl(value: string, base = "https://www.dhc.co.jp") {
  try {
    const url = new URL(value, base);
    const host = url.hostname.replace(/^www\./i, "");
    const productId = extractDhcProductId(url.toString());

    if (host !== "dhc.co.jp" || !productId) {
      return null;
    }

    return `https://www.dhc.co.jp/goods/${productId}.html`;
  } catch {
    return null;
  }
}

function dhcProductUrlsFromHtml(html: string, listingUrl: string) {
  const patterns = [
    /href=["']([^"']*\/goods\/\d+\.html[^"']*)["']/gi,
    /href=["']([^"']*\/goods\/goodsdetail\.jsp\?[^"']*gCode=\d+[^"']*)["']/gi,
    /href=["']([^"']*\/Product-Show(?:Render)?\?[^"']*(?:pid|gCode)=\d+[^"']*)["']/gi
  ];

  return [...new Set(patterns.flatMap((pattern) =>
    [...html.matchAll(pattern)]
      .map((match) => canonicalDhcProductUrl(decodeEntities(match[1] ?? ""), listingUrl))
      .filter((url): url is string => Boolean(url))
  ))];
}

async function dhcProductUrlsFromHealthSupplements() {
  const discovered = new Set<string>();
  const pageSize = 20;
  const maxPages = Math.min(60, positiveInt(argValue("dhc-max-pages"), 25));

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const listingUrl =
      `https://www.dhc.co.jp/on/demandware.store/Sites-dhc-Site/ja_JP/Search-ShowAjax?cgid=0201000000&prefn1=txPreferentialFlag&prefv1=false&sz=${pageSize}&start=${start}`;
    const html = await fetchHtml(listingUrl);
    const pageUrls = dhcProductUrlsFromHtml(html, listingUrl);
    let added = 0;

    for (const url of pageUrls) {
      if (!discovered.has(url)) {
        discovered.add(url);
        added += 1;
      }
    }

    if (pageUrls.length === 0 || (page > 0 && added === 0)) {
      break;
    }
  }

  console.log(
    `[discover] DHC Japan health/supplement catalogue returned ${discovered.size} importable product pages`
  );

  return [...discovered];
}

async function vistraProductUrlsFromHealthWellness() {
  const baseUrl = "https://www.vistra.co.th/product-category/heath-wellness_th/";
  const discovered = new Set<string>();

  for (let page = 1; page <= 12; page += 1) {
    const listingUrls = page === 1
      ? [baseUrl]
      : [
        `${baseUrl}page/${page}/`,
        `${baseUrl}?product-page=${page}`
      ];
    let pageUrls: string[] = [];

    for (const listingUrl of listingUrls) {
      try {
        const html = await fetchHtml(listingUrl);
        pageUrls = productUrlsFromListingHtml(html, listingUrl)
          .map(canonicalVistraProductUrl)
          .filter((url): url is string => Boolean(url));

        if (pageUrls.length > 0) {
          break;
        }
      } catch (error) {
        if (page === 1) {
          throw error;
        }

        console.warn(`[discover] Vistra page ${page} unavailable: ${errorMessage(error)}`);
      }
    }

    let added = 0;

    for (const url of pageUrls) {
      if (!discovered.has(url)) {
        discovered.add(url);
        added += 1;
      }
    }

    if (pageUrls.length === 0 || (page > 1 && added === 0)) {
      break;
    }
  }

  console.log(
    `[discover] Vistra Health & Wellness returned ${discovered.size} importable product pages`
  );

  return [...discovered];
}

function wordpressRenderedText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.rendered === "string") {
    return value.rendered;
  }

  return "";
}

function megaWeCareImageUrlsFromApi(record: Record<string, unknown>) {
  const urls: string[] = [];
  const yoast = isRecord(record.yoast_head_json)
    ? record.yoast_head_json
    : {};
  const ogImages = Array.isArray(yoast.og_image) ? yoast.og_image : [];

  for (const image of ogImages) {
    if (isRecord(image) && typeof image.url === "string") {
      urls.push(image.url);
    }
  }

  const embedded = isRecord(record._embedded) ? record._embedded : {};
  const featuredMedia = Array.isArray(embedded["wp:featuredmedia"])
    ? embedded["wp:featuredmedia"]
    : [];

  for (const media of featuredMedia) {
    if (isRecord(media) && typeof media.source_url === "string") {
      urls.push(media.source_url);
    }
  }

  return [...new Set(urls)].filter((url) =>
    /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)
  ).slice(0, 8);
}

async function megaWeCareProductRecordFromUrl(sourceUrl: string) {
  const slug = new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1);

  if (!slug) {
    return null;
  }

  const endpoint = `https://www.megawecare.co.th/wp-json/wp/v2/product?slug=${encodeURIComponent(slug)}&_embed=1`;
  const payload = await fetchJson(endpoint);

  return Array.isArray(payload) && isRecord(payload[0]) ? payload[0] : null;
}

async function scrapeMegaWeCareProduct(url: string, brandName: string) {
  const [record, renderedHtml] = await Promise.all([
    megaWeCareProductRecordFromUrl(url),
    fetchHtml(url).catch((error) => {
      console.warn(`[scrape] Mega rendered HTML unavailable for ${url}: ${errorMessage(error)}`);
      return "";
    })
  ]);

  if (!record) {
    throw new Error(`Mega We Care product was not found in WordPress API: ${url}`);
  }

  const title = cleanHtmlText(wordpressRenderedText(record.title)) || "Imported product";
  const contentHtml = wordpressRenderedText(record.content);
  const excerptHtml = wordpressRenderedText(record.excerpt);
  const yoastHead = typeof record.yoast_head === "string" ? record.yoast_head : "";
  const yoast = isRecord(record.yoast_head_json) ? record.yoast_head_json : {};
  const yoastDescription = typeof yoast.description === "string"
    ? yoast.description
    : null;
  const sourceHtml = [contentHtml, excerptHtml, yoastHead, renderedHtml].filter(Boolean).join("\n");
  const sourceText = textFromHtml(sourceHtml);
  const localizedNames = localizedProductNamesFromText(sourceText);
  const description =
    cleanHtmlText(yoastDescription ?? "") ||
    descriptionFromHtml(sourceHtml, sourceText) ||
    textFromHtml(excerptHtml).slice(0, 4000) ||
    null;
  const deterministicFacts = parsedFactsFromHtml(sourceHtml, sourceText, "mega we care");
  const megaThaiFacts = parseMegaWeCareThaiFacts(sourceText, typeof record.link === "string" ? record.link : url);
  const parsedFacts = [...deterministicFacts, ...megaThaiFacts];
  const supplementFactsUrl = supplementFactsUrlFromHtml(sourceHtml, url);
  const imageUrls = [
    ...megaWeCareImageUrlsFromApi(record),
    ...imageUrlsFromHtml(renderedHtml, url)
  ];
  const labelImageUrls = imageUrls.filter((imageUrl) =>
    /label|supplement|nutrition|fact|ingredient|product|megawecare|mega-we-care/i.test(imageUrl)
  );

  return {
    brandName,
    description,
    descriptionEn: null,
    descriptionTh: description,
    fdaApprovalNumber: fdaNumberFromText(sourceText),
    imageUrls: [...new Set(imageUrls)].slice(0, 8),
    parsedFacts,
    productTitle: title,
    rawSnapshot: {
      activeIngredientCount: parsedFacts.length,
      apiSource: "megawecare_wordpress_product_v1",
      description,
      descriptionTh: description,
      extractedText: sourceText.slice(0, 20_000),
      labelImageUrls,
      localizedNames,
      locale: "mixed",
      modified: record.modified ?? null,
      parser: "megawecare_wordpress_api_v1",
      renderedHtmlLength: renderedHtml.length,
      supplementFactsUrl,
      wordpressProductId: record.id ?? null,
      yoastDescription
    },
    sourceUrl: typeof record.link === "string" ? record.link : url,
    titleEn: localizedNames.titleEn ?? title,
    titleTh: localizedNames.titleTh
  } satisfies ScrapedManufacturerProduct;
}

function swisseProductVendorFromHtml(html: string, text: string) {
  const vendorJson =
    html.match(/"vendor"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/"brand"\s*:\s*\{\s*"@type"\s*:\s*"Brand"\s*,\s*"name"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/<meta\b[^>]*property=["']product:brand["'][^>]*content=["']([^"']+)["']/i)?.[1];

  if (vendorJson) {
    return cleanHtmlText(vendorJson).slice(0, 200);
  }

  if (/Swisse Skincare/i.test(text)) {
    return "Swisse Skincare";
  }

  return "Swisse";
}

function swisseSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "Benefits|Key Ingredients|Directions and Warnings|Directions|Warnings|Where To Buy|Reasons to love us|You may also like|Description";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

function swissePriceAmountFromText(text: string) {
  const match = text.match(/(?:sale\s+price|regular\s+price|price)?\s*(?:฿|THB)\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i) ??
    text.match(/(?:sale\s+price|regular\s+price|price)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:฿|THB)/i);
  const parsed = match ? Number(match[1].replace(/,/g, "")) : null;

  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
}

function swisseOfferPlatform(url: string, label: string) {
  const combined = `${url} ${label}`.toLowerCase();

  if (combined.includes("shopee")) {
    return "shopee";
  }

  if (combined.includes("lazada")) {
    return "lazada";
  }

  if (combined.includes("line")) {
    return "line";
  }

  if (combined.includes("tiktok")) {
    return "tiktok";
  }

  return "direct";
}

function swisseWhereToBuyLinksFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);
  const canonicalHost = baseUrl.hostname.replace(/^www\./i, "");
  const links: Array<{
    label: string;
    linkType: "direct";
    network: string;
    platform: string;
    priority: number;
    status: "active";
    url: string;
  }> = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1];
    const label = cleanHtmlText(match[2]);
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const combined = `${attrs} ${label}`;

    if (
      !href ||
      /\b(?:sign\s*in|log\s*in|account|cart|checkout|search)\b/i.test(label) ||
      !/where\s*to\s*buy|buy\s+at|shop\s+now|shopee|lazada|line|tiktok/i.test(combined)
    ) {
      continue;
    }

    try {
      const url = new URL(decodeEntities(href), baseUrl).toString();
      const host = new URL(url).hostname.replace(/^www\./i, "");

      if (
        !/^https?:\/\//i.test(url) ||
        host === canonicalHost ||
        /swisse\.co\.th\/(?:collections|pages|blogs|account|cart|search|customer_authentication)/i.test(url)
      ) {
        continue;
      }

      links.push({
        label: label || "Where to buy",
        linkType: "direct",
        network: "swisse_where_to_buy",
        platform: swisseOfferPlatform(url, label),
        priority: Math.max(0, 100 - links.length),
        status: "active",
        url
      });
    } catch {
      // Ignore malformed merchant URLs.
    }
  }

  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 8);
}

async function scrapeSwisseProduct(url: string, brandName: string) {
  const html = await fetchHtml(url);
  const text = textFromHtml(html);
  const title = titleFromHtml(html)
    .replace(/\s*[|–-]\s*Swisse(?:\s+Thailand)?\s*$/i, "")
    .trim();
  const vendor = swisseProductVendorFromHtml(html, text);
  const benefits = swisseSectionFromText(text, "Benefits");
  const keyIngredients = swisseSectionFromText(text, "Key Ingredients");
  const directionsWarnings = swisseSectionFromText(text, "Directions and Warnings") ??
    swisseSectionFromText(text, "Directions");
  const description = descriptionFromHtml(html, text) ?? benefits ?? keyIngredients ?? null;
  const sourceText = [
    text,
    benefits ? `Benefits ${benefits}` : "",
    keyIngredients ? `Key Ingredients ${keyIngredients}` : "",
    directionsWarnings ? `Directions and Warnings ${directionsWarnings}` : ""
  ].filter(Boolean).join("\n\n");
  const skipReason = isSwisseSkincareOnlyProduct({
    productTitle: title,
    productVendor: vendor,
    sourceText
  }) ? "skincare_topical_non_supplement" : null;
  const swisseFacts = parseSwisseFacts(sourceText, url);
  const genericFacts = parsedFactsFromText(sourceText);
  const parsedFacts = [...new Map([...swisseFacts, ...genericFacts].map((fact) => [
    `${normalizeProductFactKey(fact.name)}|${fact.amount}|${fact.unit}`,
    fact
  ])).values()];
  const imageUrls = imageUrlsFromHtml(html, url);
  const labelImageUrls = imageUrls.filter((imageUrl) =>
    /label|supplement|nutrition|fact|ingredient|product|cdn\/shop\/products/i.test(imageUrl)
  );
  const productOffers = swisseWhereToBuyLinksFromHtml(html, url);

  return {
    brandName,
    description,
    descriptionEn: description,
    descriptionTh: null,
    fdaApprovalNumber: fdaNumberFromText(text),
    imageUrls,
    parsedFacts,
    productTitle: title || "Imported product",
    rawSnapshot: {
      activeIngredientCount: parsedFacts.length,
      benefits,
      description,
      descriptionEn: description,
      directionsWarnings,
      extractedText: sourceText.slice(0, 20_000),
      importSkipReason: skipReason,
      keyIngredients,
      labelImageUrls,
      locale: "en",
      parser: "swisse_shopify_product_v1",
      priceAmount: swissePriceAmountFromText(text),
      productOffers,
      productVendor: vendor,
      renderedHtmlLength: html.length,
      supplementFactsUrl: supplementFactsUrlFromHtml(html, url),
      whereToBuyLinks: productOffers
    },
    skipReason,
    sourceUrl: normalizedUrlWithoutHash(url, new URL(url)),
    titleEn: title || null,
    titleTh: null
  } satisfies ScrapedManufacturerProduct;
}

function vistraSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "ส่วนประกอบ|วิธี(?:การ)?รับประทาน|ข้อมูลสำหรับผู้แพ้อาหาร|คำเตือน|เลขสารระบบอาหาร|หมวดหมู่|แชร์|สินค้าที่เกี่ยวข้อง";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

function vistraThaiTitleFromText(title: string, text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const titleIndex = compact.toLowerCase().indexOf(title.toLowerCase());
  const afterTitle = titleIndex >= 0 ? compact.slice(titleIndex + title.length) : compact;
  const match = afterTitle.match(
    /([ก-๙0-9\s"'()\-+]{8,180}?ผลิตภัณฑ์เสริมอาหาร[ก-๙0-9\s"'()\-+]*)\s+(?=ส่วนประกอบ|คุณสมบัติ|วิธี|เลขสารระบบอาหาร|หมวดหมู่)/i
  );

  return match ? cleanHtmlText(match[1]).slice(0, 500) : null;
}

function vistraCategoryTagsFromText(text: string) {
  const match = text.match(/หมวดหมู่\s*[:：]?\s*(.+?)(?=\s+(?:แชร์|Share|ป้ายกำกับ|Tag|สินค้าที่เกี่ยวข้อง|$))/i)?.[1];

  return match
    ? match
      .split(/[,،|/]/)
      .map((tag) => cleanHtmlText(tag).slice(0, 120))
      .filter(Boolean)
      .slice(0, 12)
    : [];
}

async function scrapeVistraProduct(url: string, brandName: string) {
  const canonicalUrl = canonicalVistraProductUrl(url) ?? url;
  const html = await fetchHtml(canonicalUrl);
  const text = textFromHtml(html);
  const title = titleFromHtml(html)
    .replace(/\s*[|–-]\s*Vistra(?:\s+Thailand)?\s*$/i, "")
    .trim();
  const properties = vistraSectionFromText(text, "คุณสมบัติ");
  const description = descriptionFromHtml(html, text) ?? properties ?? null;
  const sourceText = [
    text,
    properties ? `คุณสมบัติ ${properties}` : ""
  ].filter(Boolean).join("\n\n");
  const vistraFacts = parseVistraThaiFacts(sourceText, canonicalUrl);
  const genericFacts = parsedFactsFromText(sourceText);
  const parsedFacts = [...new Map([...vistraFacts, ...genericFacts].map((fact) => [
    `${normalizeProductFactKey(fact.name)}|${fact.amount}|${fact.unit}`,
    fact
  ])).values()];
  const imageUrls = imageUrlsFromHtml(html, canonicalUrl);
  const labelImageUrls = imageUrls.filter((imageUrl) =>
    /label|supplement|nutrition|fact|ingredient|vistra|product/i.test(imageUrl)
  );
  const titleTh = vistraThaiTitleFromText(title, sourceText);
  const categoryTags = vistraCategoryTagsFromText(sourceText);

  return {
    brandName,
    description,
    descriptionEn: null,
    descriptionTh: description,
    fdaApprovalNumber: extractVistraFdaNumber(sourceText) ?? fdaNumberFromText(sourceText),
    imageUrls,
    parsedFacts,
    productTitle: title || "Imported product",
    rawSnapshot: {
      activeIngredientCount: parsedFacts.length,
      categoryTags,
      description,
      descriptionTh: description,
      extractedText: sourceText.slice(0, 20_000),
      htmlHash: productEvidenceHash(html),
      importScope: "vistra_health_wellness",
      labelImageUrls,
      locale: "th",
      parser: "vistra_wordpress_health_wellness_v1",
      productSlug: new URL(canonicalUrl).pathname.split("/").filter(Boolean).at(-1) ?? null,
      properties,
      renderedHtmlLength: html.length,
      sourceCategoryUrl: "https://www.vistra.co.th/product-category/heath-wellness_th/",
      supplementFactsUrl: supplementFactsUrlFromHtml(html, canonicalUrl)
    },
    sourceUrl: canonicalUrl,
    titleEn: title || null,
    titleTh
  } satisfies ScrapedManufacturerProduct;
}

function dhcSectionFromText(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern =
    "注意書き|成分・原材料|栄養成分表示|原材料名|アレルギー物質|健康食品について|レビュー|関連する商品|関連カテゴリ";
  const match = text.match(new RegExp(`${escapedHeading}\\s+([\\s\\S]{1,2500}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));

  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null;
}

function dhcPriceAmountFromHtml(html: string) {
  const jsonLdPrice = jsonLdProductRecordsFromHtml(html)
    .map((record) => isRecord(record.offers) ? record.offers.price : null)
    .find((price) => typeof price === "string" || typeof price === "number");
  const parsed = Number(String(jsonLdPrice ?? "").replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function scrapeDhcProduct(url: string, brandName: string) {
  const canonicalUrl = canonicalDhcProductUrl(url) ?? url;
  const html = await fetchHtml(canonicalUrl);
  const text = textFromHtml(html);
  const jsonLdProduct = jsonLdProductRecordsFromHtml(html)[0] ?? {};
  const jsonLdName = typeof jsonLdProduct.name === "string"
    ? cleanHtmlText(jsonLdProduct.name)
    : null;
  const jsonLdDescription = typeof jsonLdProduct.description === "string"
    ? cleanHtmlText(jsonLdProduct.description)
    : null;
  const title = (jsonLdName ?? titleFromHtml(html))
    .replace(/\s*[|｜]\s*(?:ビタミン通販の)?DHC.*$/i, "")
    .trim();
  const description =
    jsonLdDescription ??
    descriptionFromHtml(html, text) ??
    dhcSectionFromText(text, "商品情報") ??
    null;
  const nutrition = dhcSectionFromText(text, "成分・原材料");
  const sourceText = [
    text,
    nutrition ? `成分・原材料 ${nutrition}` : ""
  ].filter(Boolean).join("\n\n");
  const dhcFacts = parseDhcFacts(sourceText, canonicalUrl);
  const genericFacts = parsedFactsFromText(sourceText);
  const parsedFacts = [...new Map([...dhcFacts, ...genericFacts].map((fact) => [
    `${normalizeProductFactKey(fact.name)}|${fact.amount}|${fact.unit}`,
    fact
  ])).values()];
  const imageUrls = [
    ...productJsonLdImagesFromHtml(html, canonicalUrl),
    ...imageUrlsFromHtml(html, canonicalUrl)
  ];
  const labelImageUrls = imageUrls.filter((imageUrl) =>
    /\/large\/|\/goods\/|\/Sites-dhc_catalog|detail|supplement|nutrition|ingredient|product/i.test(imageUrl)
  );
  const skipReason = isDhcSupplementProduct({
    productTitle: title,
    sourceText
  }) ? null : "dhc_non_supplement_or_pharmaceutical";

  return {
    brandName,
    description,
    descriptionEn: null,
    descriptionTh: null,
    fdaApprovalNumber: fdaNumberFromText(sourceText),
    imageUrls: [...new Set(imageUrls)].slice(0, 8),
    parsedFacts,
    productTitle: title || "Imported product",
    rawSnapshot: {
      activeIngredientCount: parsedFacts.length,
      descriptionJa: description,
      extractedText: sourceText.slice(0, 20_000),
      htmlHash: productEvidenceHash(html),
      importScope: "dhc_japan_supplements",
      importSkipReason: skipReason,
      labelImageUrls,
      locale: "ja",
      nutrition,
      parser: "dhc_demandware_health_supplements_v1",
      priceAmount: dhcPriceAmountFromHtml(html),
      productId: extractDhcProductId(canonicalUrl),
      renderedHtmlLength: html.length,
      sourceCategoryUrl: "https://www.dhc.co.jp/health/health/",
      supplementFactsUrl: supplementFactsUrlFromHtml(html, canonicalUrl)
    },
    skipReason,
    sourceUrl: canonicalUrl,
    titleEn: null,
    titleTh: null
  } satisfies ScrapedManufacturerProduct;
}

function productVariantImageUrlsFromNextData(html: string, sourceUrl: string) {
  const pageUrl = new URL(sourceUrl);

  if (pageUrl.hostname.replace(/^www\./i, "") !== "blackmores.com.au") {
    return [];
  }

  const data = parseNextData(html);
  const productRecord = findProductRecordWithVariants(data);
  const productVariants = arrayValue(productRecord?.productVariants);
  const imageUrls: string[] = [];
  const sortedVariants = [...productVariants].sort((first, second) => {
    const firstRecord = isRecord(first) ? first : {};
    const secondRecord = isRecord(second) ? second : {};

    if (firstRecord.default === true && secondRecord.default !== true) {
      return -1;
    }

    if (secondRecord.default === true && firstRecord.default !== true) {
      return 1;
    }

    return String(firstRecord.name ?? "").localeCompare(
      String(secondRecord.name ?? "")
    );
  });

  for (const variant of sortedVariants) {
    const variantRecord = isRecord(variant) ? variant : {};
    const imageGallery = isRecord(variantRecord.imageGallery)
      ? variantRecord.imageGallery
      : {};
    const images = arrayValue(imageGallery.images).sort((first, second) => {
      const firstIndex = Number(isRecord(first) ? first.index : 0);
      const secondIndex = Number(isRecord(second) ? second.index : 0);

      return (
        (Number.isFinite(firstIndex) ? firstIndex : 0) -
        (Number.isFinite(secondIndex) ? secondIndex : 0)
      );
    });

    for (const image of images) {
      const url = isRecord(image) && typeof image.url === "string"
        ? image.url
        : "";

      if (url && /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)) {
        imageUrls.push(url);
      }
    }
  }

  return [...new Set(imageUrls)].slice(0, 8);
}

function blackmoresProductRecordFromHtml(html: string) {
  return findProductRecordWithVariants(parseNextData(html));
}

async function discoverProductUrls(normalizedBrand: string) {
  if (normalizedBrand === "mega we care") {
    return megaWeCareProductUrlsFromApi();
  }

  if (normalizedBrand === "swisse") {
    return swisseProductUrlsFromCollections();
  }

  if (normalizedBrand === "vistra") {
    return vistraProductUrlsFromHealthWellness();
  }

  if (normalizedBrand === "dhc") {
    return dhcProductUrlsFromHealthSupplements();
  }

  const explicitListingUrls = argValue("discovery-urls")
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const listingUrls = explicitListingUrls && explicitListingUrls.length > 0
    ? explicitListingUrls
    : BRAND_DISCOVERY_PAGES[normalizedBrand] ?? [];
  const discovered: string[] = [];

  for (const listingUrl of listingUrls) {
    const html = await fetchHtml(listingUrl);
    discovered.push(
      ...productUrlsFromBlackmoresAuNextData(html, listingUrl),
      ...productUrlsFromListingHtml(html, listingUrl)
    );
  }

  return discovered;
}

async function productUrlsFromArgs(normalizedBrand: string) {
  const value = argValue("product-urls");
  const explicitOrPresetUrls = value
    ? value.split(",").map((url) => url.trim()).filter(Boolean)
    : hasArg("no-presets")
      ? []
    : BRAND_PRODUCT_PRESETS[normalizedBrand] ?? [];
  const urls = hasArg("discover")
    ? [...explicitOrPresetUrls, ...(await discoverProductUrls(normalizedBrand))]
    : explicitOrPresetUrls;
  const limit = positiveInt(argValue("limit"), urls.length);

  return [...new Set(urls)].slice(0, limit);
}

function decodeEntities(value: string) {
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

function textFromHtml(html: string) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function cleanHtmlText(html: string) {
  return textFromHtml(html).replace(/\s+/g, " ").trim();
}

function titleFromHtml(html: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return textFromHtml(h1 ?? title ?? "Imported product").slice(0, 240);
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];

    if (value) {
      return cleanHtmlText(value);
    }
  }

  return null;
}

function descriptionFromHtml(html: string, text: string) {
  const meta =
    metaContent(html, "description") ??
    metaContent(html, "og:description") ??
    metaContent(html, "twitter:description");

  if (meta) {
    return meta.slice(0, 4000);
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => sentence.length > 80 && sentence.length < 600)
    ?.slice(0, 4000) ?? null;
}

function localizedProductNamesFromText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const pairedMatch = compact.match(
    /ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)\s+ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i
  );

  if (pairedMatch) {
    return {
      titleEn: cleanHtmlText(pairedMatch[2]).slice(0, 500) || null,
      titleTh: cleanHtmlText(pairedMatch[1]).slice(0, 500) || null
    };
  }

  return {
    titleEn:
      compact
        .match(/ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1]
        ? cleanHtmlText(
          compact.match(/ชื่อผลิตภัณฑ์\s*\(อังกฤษ\)\s*[:：]\s*(.+?)(?=\s+(?:เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1] ?? ""
        ).slice(0, 500)
        : null,
    titleTh:
      compact
        .match(/ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)(?=\s+(?:ชื่อผลิตภัณฑ์|เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1]
        ? cleanHtmlText(
          compact.match(/ชื่อผลิตภัณฑ์\s*\(ไทย\)\s*[:：]\s*(.+?)(?=\s+(?:ชื่อผลิตภัณฑ์|เลขทะเบียน|รูปแบบ|ส่วนประกอบ|คุณสมบัติ|วิธีรับประทาน|คำเตือน|$))/i)?.[1] ?? ""
        ).slice(0, 500)
        : null
  };
}

function imagePriority(url: string) {
  if (/\/sliced-images\/global\/products\//i.test(url)) {
    return 0;
  }

  if (/\/media\/product\/img-/i.test(url)) {
    return 0;
  }

  if (/\/media\/product\/social-thmb/i.test(url)) {
    return 1;
  }

  if (/\/media\/product\//i.test(url)) {
    return 2;
  }

  if (/\/products\/[^/?]+\.(?:avif|jpe?g|png|webp)/i.test(url)) {
    return 3;
  }

  if (/\/tile-(?:new-)?/i.test(url)) {
    return 8;
  }

  if (/logo|ico-|icon|btn|share|bullet|banner|privacy-options|woman-holding|woman-running|three-products-straight/i.test(url)) {
    return 10;
  }

  return 5;
}

function centrumProductImageUrlsFromHtml(html: string, sourceUrl: string) {
  const pageUrl = new URL(sourceUrl);

  if (pageUrl.hostname.replace(/^www\./i, "") !== "centrum.com") {
    return [];
  }

  const carouselStart = html.search(/class=["'][^"']*\bproduct-img\b[^"']*["']/i);
  const carouselHtml = carouselStart >= 0
    ? html.slice(carouselStart, html.indexOf("</script>", carouselStart) > carouselStart
      ? html.indexOf("</script>", carouselStart)
      : Math.min(html.length, carouselStart + 12_000))
    : "";
  const matches = [
    ...carouselHtml.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)
  ];
  const baseUrl = new URL(sourceUrl);
  const productSlugTokens = new Set(
    pageUrl.pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !["and", "the", "plus"].includes(token)) ?? []
  );

  return [...new Set(matches.flatMap((match) => {
    try {
      const url = new URL(decodeEntities(match[1]), baseUrl).toString();

      if (!/\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url) || imagePriority(url) >= 10) {
        return [];
      }

      const urlTokens = new Set(
        decodeURIComponent(url)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 1)
      );
      const matchingTokens = [...productSlugTokens].filter((token) => urlTokens.has(token)).length;
      const isProductAsset = /\/sliced-images\/global\/products\/|\/products\//i.test(url);

      return isProductAsset || matchingTokens >= 2 ? [url] : [];
    } catch {
      return [];
    }
  }))]
    .sort((first, second) => imagePriority(first) - imagePriority(second))
    .slice(0, 8);
}

function imageUrlsFromHtml(html: string, sourceUrl: string) {
  const matches = [
    ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)
  ];
  const baseUrl = new URL(sourceUrl);
  const structuredProductImages = productVariantImageUrlsFromNextData(
    html,
    sourceUrl
  );
  const centrumProductImages = centrumProductImageUrlsFromHtml(html, sourceUrl);
  const htmlImageUrls = matches.flatMap((match) => {
    try {
      return [new URL(decodeEntities(match[1]), baseUrl).toString()];
    } catch {
      return [];
    }
  });

  return [...new Set([...structuredProductImages, ...centrumProductImages, ...htmlImageUrls].filter((url) =>
    /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url) &&
    imagePriority(url) < 10
  ))]
    .sort((first, second) => imagePriority(first) - imagePriority(second))
    .slice(0, 8);
}

function jsonLdProductRecordsFromHtml(html: string) {
  const records: Record<string, unknown>[] = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1] ?? "")) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];

      for (const value of values) {
        if (isRecord(value) && value["@type"] === "Product") {
          records.push(value);
        }
      }
    } catch {
      // Ignore malformed analytics JSON-LD.
    }
  }

  return records;
}

function productJsonLdImagesFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);

  return [...new Set(jsonLdProductRecordsFromHtml(html).flatMap((record) => {
    const image = record.image;
    const images = Array.isArray(image) ? image : [image];

    return images.flatMap((value) => {
      if (typeof value !== "string") {
        return [];
      }

      try {
        return [new URL(decodeEntities(value), baseUrl).toString()];
      } catch {
        return [];
      }
    });
  }).filter((url) => /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url)))];
}

function supplementFactsUrlFromHtml(html: string, sourceUrl: string) {
  const baseUrl = new URL(sourceUrl);
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const attrs = match[1];
    const text = cleanHtmlText(match[2]);

    if (!/supplement facts|nutrition facts|ข้อมูล/i.test(`${attrs} ${text}`)) {
      continue;
    }

    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];

    if (!href) {
      continue;
    }

    try {
      return new URL(decodeEntities(href), baseUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
}

const haleonPdfUrlsByPage = new Map<string, Promise<string[]>>();
const labelTextByPdfUrl = new Map<string, Promise<string | null>>();

function tokenSet(value: string) {
  return new Set(
    decodeEntities(value)
      .toLowerCase()
      .replace(/%20/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((token) =>
        token.length > 1 &&
        ![
          "centrum",
          "products",
          "product",
          "supplement",
          "supplements",
          "vitamin",
          "vitamins",
          "multivitamin",
          "multivitamins",
          "tablets",
          "tablet",
          "gummies",
          "gummy",
          "plus",
          "the",
          "and",
          "for"
        ].includes(token)
      )
  );
}

async function haleonPdfUrls(indexUrl: string) {
  const normalized = normalizedUrlWithoutHash(indexUrl, new URL(indexUrl));
  const existing = haleonPdfUrlsByPage.get(normalized);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const html = await fetchHtml(normalized);
    const baseUrl = new URL(normalized);

    return [...new Set([...html.matchAll(/(?:href|src)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)]
      .flatMap((match) => {
        try {
          return [new URL(decodeEntities(match[1]), baseUrl).toString()];
        } catch {
          return [];
        }
      }))];
  })();

  haleonPdfUrlsByPage.set(normalized, promise);

  return promise;
}

function scoreLabelPdfForProduct(input: Readonly<{
  pdfUrl: string;
  productTitle: string;
  sourceUrl: string;
}>) {
  const productUrl = new URL(input.sourceUrl);
  const slug = productUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const productTokens = tokenSet(`${slug} ${input.productTitle}`);
  const pdfTokens = tokenSet(input.pdfUrl);
  let score = 0;

  for (const token of productTokens) {
    if (pdfTokens.has(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }

  if (/women|woman|female|prenatal|postnatal|maternal|menopause/i.test(input.productTitle) &&
    /women|woman|prenatal|postnatal|maternal|menopause/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/\bmen\b|male|prostate/i.test(input.productTitle) && /\bmen\b|male|prostate/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/(?:50|35)-?plus|50\+|35\+/i.test(input.productTitle) &&
    /(?:50|35)-?plus|50\+|35\+/i.test(input.pdfUrl)) {
    score += 3;
  }

  if (/kids|children/i.test(input.productTitle) && /kids|children/i.test(input.pdfUrl)) {
    score += 4;
  }

  if (/liquid/i.test(input.productTitle) && /liquid/i.test(input.pdfUrl)) {
    score += 5;
  }

  if (/omega/i.test(input.productTitle) && /omega/i.test(input.pdfUrl)) {
    score += 5;
  }

  return score;
}

async function centrumSupplementFactsUrl(input: Readonly<{
  html: string;
  productTitle: string;
  sourceUrl: string;
}>) {
  const direct = supplementFactsUrlFromHtml(input.html, input.sourceUrl);

  if (direct && /\.pdf(?:\?|$)/i.test(direct)) {
    return direct;
  }

  const indexUrl = direct && /haleon\.info/i.test(direct)
    ? direct
    : "https://haleon.info/en-us/Centrum";
  const pdfUrls = await haleonPdfUrls(indexUrl);
  const ranked = pdfUrls
    .map((pdfUrl) => ({
      pdfUrl,
      score: scoreLabelPdfForProduct({
        pdfUrl,
        productTitle: input.productTitle,
        sourceUrl: input.sourceUrl
      })
    }))
    .sort((first, second) => second.score - first.score || first.pdfUrl.localeCompare(second.pdfUrl));

  return ranked[0] && ranked[0].score >= 4 ? ranked[0].pdfUrl : direct;
}

async function extractPdfTextWithPython(pdfUrl: string) {
  if (!hasArg("extract-label-pdfs")) {
    return null;
  }

  const existing = labelTextByPdfUrl.get(pdfUrl);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "mattanutra-label-"));
    const pdfPath = path.join(temporaryDirectory, "label.pdf");
    const python = process.env.PYTHON || process.env.PYTHON3 || "python3";

    try {
      const response = await fetch(pdfUrl, { headers: manufacturerHeaders() });

      if (!response.ok) {
        throw new Error(`${pdfUrl} returned ${response.status}`);
      }

      await writeFile(pdfPath, Buffer.from(await response.arrayBuffer()));
      const script = [
        "import sys",
        "from pypdf import PdfReader",
        "reader = PdfReader(sys.argv[1])",
        "text = '\\n'.join(page.extract_text() or '' for page in reader.pages)",
        "print(text)"
      ].join("\n");
      const { stdout } = await execFileAsync(
        python,
        ["-c", script, pdfPath],
        { maxBuffer: 2_000_000 }
      );

      return stdout.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20_000) || null;
    } catch (error) {
      console.warn(`[label] could not extract ${pdfUrl}: ${errorMessage(error)}`);
      return null;
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  })();

  labelTextByPdfUrl.set(pdfUrl, promise);

  return promise;
}

function fdaNumberFromText(text: string) {
  const thaiAdApproval = text.match(/ฆอ\.?\s*([0-9][0-9\-/.]+\/[0-9]{4})/i)?.[1];

  if (thaiAdApproval) {
    return `ฆอ. ${thaiAdApproval}`;
  }

  return text.match(/\b(?:FDA|อย)\.?\s*(?:No\.?|เลขที่)?\s*[:：]?\s*([0-9\-\/.]{6,})/i)?.[1] ?? null;
}

function parseQuantity(value: string) {
  const match = cleanHtmlText(value).match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(i\.?\s*u\.?|iu|micrograms?|mcg|µg|ug|mg|g)\b/i
  );

  if (!match) {
    return null;
  }

  return {
    amount: Number(match[1].replace(/,/g, "")),
    unit: match[2]
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("i.u.", "iu")
      .replace("i.u", "iu")
      .replace(/^micrograms?$/, "mcg")
      .replace("µg", "mcg")
      .replace("ug", "mcg")
  };
}

function numberFromIngredientAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function unitFromIngredientUnits(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return parseQuantity(`1 ${cleanHtmlText(value)}`)?.unit ?? null;
}

function blackmoresIngredientDisplayName(value: unknown) {
  const name = cleanHtmlText(String(value ?? ""));

  if (!name || /^active ingredients per/i.test(name)) {
    return null;
  }

  const equivalent = name.match(/^equivalent\s+(.+)$/i)?.[1];

  if (equivalent) {
    if (/\b(?:dry|rhizome|root|leaf|fruit|herb)\b/i.test(equivalent)) {
      return null;
    }

    return blackmoresIngredientDisplayName(equivalent);
  }

  const standardized = name.match(/^standardi[sz]ed to\s+(.+)$/i)?.[1];

  if (standardized) {
    return standardized;
  }

  if (/\b(?:palmidrol|palmitoylethanolamide|levagen|pea)\b/i.test(name)) {
    return "Palmitoylethanolamide PEA";
  }

  if (/\b(?:ascorbic acid|vitamin c)\b/i.test(name)) {
    return "Vitamin C";
  }

  if (/\b(?:colecalciferol|cholecalciferol|vitamin d3)\b/i.test(name)) {
    return "Vitamin D3";
  }

  return normalizeProductFactName(name);
}

function blackmoresStructuredIngredientsFromHtml(html: string) {
  const record = blackmoresProductRecordFromHtml(html);
  const ingredients = arrayValue(record?.ingredients);

  return ingredients
    .map((ingredient) => isRecord(ingredient) ? ingredient : null)
    .filter((ingredient): ingredient is Record<string, unknown> => Boolean(ingredient));
}

function blackmoresStructuredIngredientPriority(rawName: string) {
  if (/^standardi[sz]ed to\b/i.test(rawName)) {
    return 0;
  }

  if (/^equivalent\b/i.test(rawName)) {
    return 1;
  }

  if (/\b(?:palmidrol|palmitoylethanolamide|levagen|pea|ascorbic acid|vitamin c|colecalciferol|cholecalciferol|vitamin d3)\b/i.test(rawName)) {
    return 2;
  }

  return 5;
}

function blackmoresStructuredSourceRowLooksRedundant(rawName: string) {
  return /\b(?:extract dry conc|phosphate|pentahydrate|carbonate|ascorbate|oxide|sulfate|sulphate|nitrate|hydrochloride|hcl)\b/i.test(rawName);
}

function shouldPreferBlackmoresFact(
  next: ProductImportFactInput & { priority: number },
  current: ProductImportFactInput & { priority: number }
) {
  if (next.priority !== current.priority) {
    return next.priority < current.priority;
  }

  const key = normalizeProductFactKey(next.name);

  if (
    (key === "vitamin_d" || key === "vitamin_d3") &&
    next.unit?.toLowerCase() === "iu" &&
    current.unit?.toLowerCase() !== "iu"
  ) {
    return true;
  }

  return current.amount === null && next.amount !== null;
}

function parsedFactsFromBlackmoresNextDataIngredients(html: string) {
  const candidates = blackmoresStructuredIngredientsFromHtml(html)
    .map((ingredient) => {
      const rawName = cleanHtmlText(String(ingredient.ingredientName ?? ""));
      const name = blackmoresIngredientDisplayName(rawName);
      const amount = numberFromIngredientAmount(ingredient.amount);
      const unit = unitFromIngredientUnits(ingredient.units);

      if (!name || amount === null || !unit) {
        return null;
      }

      return {
        amount,
        confidence: "high" as const,
        name,
        priority: blackmoresStructuredIngredientPriority(rawName),
        rawName,
        unit
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const hasAuthoritativeEquivalent = candidates.some((fact) => fact.priority <= 1);
  const deduped = new Map<string, ProductImportFactInput & { priority: number }>();

  for (const fact of candidates) {
    if (
      hasAuthoritativeEquivalent &&
      fact.priority > 2 &&
      blackmoresStructuredSourceRowLooksRedundant(fact.rawName)
    ) {
      continue;
    }

    const key = normalizeProductFactKey(fact.name);
    const current = deduped.get(key);
    const next = {
      amount: fact.amount,
      confidence: fact.confidence,
      name: fact.name,
      priority: fact.priority,
      unit: fact.unit
    };

    if (!current || shouldPreferBlackmoresFact(next, current)) {
      deduped.set(key, next);
    }
  }

  return [...deduped.values()].map((fact) => ({
    amount: fact.amount,
    confidence: fact.confidence,
    name: fact.name,
    unit: fact.unit
  }));
}

function parsedFactsFromBlackmoresHtml(html: string) {
  const factPattern =
    /<td[^>]*class=["'][^"']*comp_ttl[^"']*["'][^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/td>\s*<td[^>]*class=["'][^"']*comp_quan[^"']*["'][^>]*>\s*<div>([\s\S]*?)<\/div>/gi;

  return [...html.matchAll(factPattern)]
    .map((match) => {
      const quantity = parseQuantity(match[2]);

      if (!quantity) {
        return null;
      }

      return {
        amount: quantity.amount,
        confidence: "moderate" as const,
        name: normalizeProductFactName(cleanHtmlText(match[1])),
        unit: quantity.unit
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

function parsedFactsFromText(text: string) {
  const factPattern = /([A-Za-z][A-Za-z0-9\s()+\-./]{2,60})\s+(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|iu)\b/gi;

  return [...text.matchAll(factPattern)]
    .slice(0, 80)
    .map((match) => {
      const followingText = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8);

      if (/^\s*\//.test(followingText)) {
        return null;
      }

      return {
        amount: Number(match[2]),
        confidence: "low" as const,
        name: normalizeProductFactName(match[1].trim()),
        unit: match[3].toLowerCase().replace("µg", "mcg").replace("ug", "mcg")
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

function parsedFactsFromHtml(html: string, text: string, normalizedBrand: string) {
  if (normalizedBrand === "blackmores") {
    const blackmoresNextDataFacts =
      parsedFactsFromBlackmoresNextDataIngredients(html);

    if (blackmoresNextDataFacts.length > 0) {
      return blackmoresNextDataFacts;
    }

    const blackmoresFacts = parsedFactsFromBlackmoresHtml(html);

    if (blackmoresFacts.length > 0) {
      return blackmoresFacts;
    }
  }

  return parsedFactsFromText(text);
}

function dosageFromText(text: string) {
  const headingPattern =
    "(?:Dosage|Directions|Recommended use|How to use|วิธีรับประทาน|วิธีกิน|ปริมาณที่แนะนำ)";
  const stopPattern =
    "(?:Active ingredients|Ingredients|Supplement facts|ส่วนประกอบ|ข้อมูลโภชนาการ|คำเตือน|Warnings)";
  const match = text.match(new RegExp(`${headingPattern}\\s+([\\s\\S]{1,600}?)\\s+${stopPattern}`, "i"));

  return match?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) ?? null;
}

async function scrapeProduct(url: string, brandName: string) {
  const normalizedBrand = normalizeBrand(brandName);

  if (normalizedBrand === "mega we care") {
    return scrapeMegaWeCareProduct(url, brandName);
  }

  if (normalizedBrand === "swisse") {
    return scrapeSwisseProduct(url, brandName);
  }

  if (normalizedBrand === "vistra") {
    return scrapeVistraProduct(url, brandName);
  }

  if (normalizedBrand === "dhc") {
    return scrapeDhcProduct(url, brandName);
  }

  const html = await fetchHtml(url);
  const text = textFromHtml(html);
  const title = titleFromHtml(html);
  const description = descriptionFromHtml(html, text);
  const locale = languageFromUrl(url) ?? languageFromHtml(html);
  const localizedNames = normalizedBrand === "mega we care"
    ? localizedProductNamesFromText(text)
    : { titleEn: null, titleTh: null };
  const supplementFactsUrl = normalizedBrand === "centrum"
    ? await centrumSupplementFactsUrl({ html, productTitle: title, sourceUrl: url })
    : supplementFactsUrlFromHtml(html, url);
  const labelText = supplementFactsUrl && /\.pdf(?:\?|$)/i.test(supplementFactsUrl)
    ? await extractPdfTextWithPython(supplementFactsUrl)
    : null;
  const sourceText = labelText
    ? `${text}\n\nSupplement facts label evidence:\n${labelText}`
    : text;
  const parsedFacts = parsedFactsFromHtml(html, sourceText, normalizedBrand);

  return {
    brandName,
    description,
    descriptionEn: locale === "en" ? description : null,
    descriptionTh: locale === "th" ? description : null,
    fdaApprovalNumber: fdaNumberFromText(text),
    imageUrls: imageUrlsFromHtml(html, url),
    parsedFacts,
    productTitle: title,
    rawSnapshot: {
      activeIngredientCount: parsedFacts.length,
      candidateSupplierReason:
        normalizedBrand === "blackmores"
          ? "Blackmores Thailand product pages expose structured active ingredient tables, product images and FDA advertising approval text."
          : null,
      dosage: dosageFromText(text),
      description,
      descriptionEn: locale === "en" ? description : null,
      descriptionTh: locale === "th" ? description : null,
      extractedLabelText: labelText,
      extractedText: sourceText.slice(0, 20_000),
      htmlLength: html.length,
      localizedNames,
      locale: locale ?? "unknown",
      parser:
        normalizedBrand === "blackmores"
          ? "blackmores_structured_ingredients_v2"
          : normalizedBrand === "centrum"
            ? "centrum_product_page_v1"
          : "generic_text_v1",
      structuredIngredients:
        normalizedBrand === "blackmores"
          ? blackmoresStructuredIngredientsFromHtml(html)
          : [],
      supplementFactsUrl
    },
    sourceUrl: url,
    titleEn: localizedNames.titleEn ?? (locale === "en" ? title : null),
    titleTh: localizedNames.titleTh ?? (locale === "th" ? title : null)
  } satisfies ScrapedManufacturerProduct;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hasFailedAiFactCorrection(product: ScrapedManufacturerProduct) {
  const correction = product.rawSnapshot.aiFactCorrection;

  return Boolean(
    correction &&
    typeof correction === "object" &&
    "failedAt" in correction
  );
}

function hasAiFactFallback(product: ScrapedManufacturerProduct) {
  const fallback = product.rawSnapshot.aiFactFallback;

  return Boolean(
    fallback &&
    typeof fallback === "object" &&
    "recoveredAt" in fallback
  );
}

function hasSuccessfulAiFactCorrection(product: ScrapedManufacturerProduct) {
  const correction = product.rawSnapshot.aiFactCorrection;

  return Boolean(
    correction &&
    typeof correction === "object" &&
    "correctedAt" in correction
  );
}

function importSkipReason(product: ScrapedManufacturerProduct) {
  const rawReason = product.rawSnapshot.importSkipReason;
  const reason = product.skipReason ?? (typeof rawReason === "string" ? rawReason : null);

  return reason?.trim() || null;
}

function isSkippedProduct(product: ScrapedManufacturerProduct) {
  return Boolean(importSkipReason(product));
}

function hasThaiText(value: string | null | undefined) {
  return Boolean(value && /[ก-๙]/.test(value));
}

function hasBilingualDisplay(product: ScrapedManufacturerProduct) {
  return Boolean(
    product.titleEn?.trim() &&
    product.titleTh?.trim() &&
    product.descriptionEn?.trim() &&
    product.descriptionTh?.trim()
  );
}

function qualityDisplayBlockers(product: ScrapedManufacturerProduct) {
  const blockers: string[] = [];

  if (!hasBilingualDisplay(product)) {
    blockers.push("missing_bilingual_copy");
  }

  if (product.titleTh?.trim() && !hasThaiText(product.titleTh)) {
    blockers.push("thai_title_not_localized");
  }

  if (product.descriptionTh?.trim() && !hasThaiText(product.descriptionTh)) {
    blockers.push("thai_description_not_localized");
  }

  return blockers;
}

function productAudienceFromRawSnapshot(snapshot: Record<string, unknown>) {
  const correction = snapshot.aiFactCorrection;

  if (!correction || typeof correction !== "object") {
    return null;
  }

  const value = (correction as Record<string, unknown>).productAudience;

  return value === "both" || value === "female" || value === "male"
    ? value
    : null;
}

function hasSuccessfulAiCopyTranslation(product: ScrapedManufacturerProduct) {
  const translation = product.rawSnapshot.aiCopyTranslation;

  return Boolean(
    translation &&
    typeof translation === "object" &&
    "translatedAt" in translation &&
    qualityDisplayBlockers(product).length === 0
  );
}

async function translateProductCopyForImport(
  product: ScrapedManufacturerProduct,
  index: number,
  total: number,
  failOpen: boolean
): Promise<{ failed: boolean; product: ScrapedManufacturerProduct; translated: boolean }> {
  console.log(`[copy] ${index}/${total} ${product.productTitle}`);

  try {
    const enCopy = await translateDraftProductCopyWithAi({
      brandName: product.brandName,
      description: product.description,
      descriptionEn: product.descriptionEn,
      descriptionTh: product.descriptionTh,
      productTitle: product.productTitle,
      productTitleEn: product.titleEn,
      productTitleTh: product.titleTh,
      productUrl: product.sourceUrl,
      sourceSnapshot: product.rawSnapshot,
      targetLocale: "en"
    });
    const thCopy = await translateDraftProductCopyWithAi({
      brandName: product.brandName,
      description: product.description,
      descriptionEn: enCopy.description ?? product.descriptionEn,
      descriptionTh: product.descriptionTh,
      productTitle: product.productTitle,
      productTitleEn: enCopy.title ?? product.titleEn,
      productTitleTh: product.titleTh,
      productUrl: product.sourceUrl,
      sourceSnapshot: product.rawSnapshot,
      targetLocale: "th"
    });
    const zhCopy = await translateDraftProductCopyWithAi({
      brandName: product.brandName,
      description: product.description,
      descriptionEn: enCopy.description ?? product.descriptionEn,
      descriptionTh: thCopy.description ?? product.descriptionTh,
      productTitle: product.productTitle,
      productTitleEn: enCopy.title ?? product.titleEn,
      productTitleTh: thCopy.title ?? product.titleTh,
      productUrl: product.sourceUrl,
      sourceSnapshot: product.rawSnapshot,
      targetLocale: "zh-CN"
    });
    const titleEn = enCopy.title ?? product.titleEn;
    const descriptionEn = enCopy.description ?? product.descriptionEn;
    const titleTh = thCopy.title ?? product.titleTh;
    const descriptionTh = thCopy.description ?? product.descriptionTh;
    const zhTitle = zhCopy.title;
    const zhDescription = zhCopy.description;

    return {
      failed: false,
      product: {
        ...product,
        descriptionEn,
        descriptionTh,
        rawSnapshot: {
          ...product.rawSnapshot,
          aiCopyTranslation: {
            en: {
              description: descriptionEn,
              notes: enCopy.notes,
              responseId: enCopy.responseId ?? null,
              title: titleEn
            },
            th: {
              description: descriptionTh,
              notes: thCopy.notes,
              responseId: thCopy.responseId ?? null,
              title: titleTh
            },
            "zh-CN": {
              description: zhDescription,
              notes: zhCopy.notes,
              responseId: zhCopy.responseId ?? null,
              title: zhTitle
            },
            descriptionEn,
            descriptionTh,
            notes: [enCopy.notes, thCopy.notes, zhCopy.notes].filter(Boolean).join(" | ") || null,
            outputLocaleMode: "single_display_locale",
            responseIds: {
              en: enCopy.responseId ?? null,
              th: thCopy.responseId ?? null,
              "zh-CN": zhCopy.responseId ?? null
            },
            titleEn,
            titleTh,
            translatedAt: new Date().toISOString()
          }
        },
        translations: {
          ...(product.translations ?? {}),
          en: {
            description: descriptionEn,
            status: titleEn && descriptionEn ? "complete" : "draft",
            title: titleEn
          },
          th: {
            description: descriptionTh,
            status: titleTh && descriptionTh ? "complete" : "draft",
            title: titleTh
          },
          "zh-CN": {
            description: zhDescription,
            status: zhTitle && zhDescription ? "complete" : zhTitle || zhDescription ? "draft" : "missing",
            title: zhTitle
          }
        },
        titleEn,
        titleTh
      },
      translated: true
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[copy] ${product.productTitle} failed: ${message}`);

    if (!failOpen) {
      throw error;
    }

    return {
      failed: true,
      product: {
        ...product,
        rawSnapshot: {
          ...product.rawSnapshot,
          aiCopyTranslation: {
            error: message,
            failedAt: new Date().toISOString()
          }
        }
      },
      translated: false
    };
  }
}

async function translateProductsCopyWithAi(input: Readonly<{
  delayMs: number;
  failOpen: boolean;
  products: readonly ScrapedManufacturerProduct[];
  startAt: number;
}>) {
  let failed = 0;
  let translated = 0;
  const products: ScrapedManufacturerProduct[] = [];

  for (let index = 0; index < input.products.length; index += 1) {
    const product = input.products[index];
    const productNumber = index + 1;

    if (productNumber < input.startAt || hasSuccessfulAiCopyTranslation(product)) {
      products.push(product);
      continue;
    }

    const result = await translateProductCopyForImport(
      product,
      productNumber,
      input.products.length,
      input.failOpen
    );
    products.push(result.product);

    if (result.translated) {
      translated += 1;
    }

    if (result.failed) {
      failed += 1;
    }

    await delay(input.delayMs);
  }

  return { failed, products, translated };
}

async function canAutoApproveProduct(product: ScrapedManufacturerProduct) {
  if (isSkippedProduct(product) || !hasBilingualDisplay(product)) {
    return false;
  }

  const qualityValidation = product.rawSnapshot.qualityValidation;
  const qualityDecision = qualityValidation && typeof qualityValidation === "object"
    ? (qualityValidation as Record<string, unknown>).decision
    : null;

  if (qualityDecision && qualityDecision !== "auto_approve") {
    return false;
  }

  const validation = await validateProductImportForApproval({
    facts: product.parsedFacts,
    imageUrl: product.imageUrls[0] ?? null,
    labelStatus: product.parsedFacts.length > 0 ? "parsed" : "missing",
    productUrl: product.sourceUrl,
    sourceUrl: product.sourceUrl,
    title: product.productTitle,
    titleEn: product.titleEn
  });

  return validation.status === "pass" &&
    (hasSuccessfulAiFactCorrection(product) || hasCurrentQualityEnrichment(product)) &&
    !hasFailedAiFactCorrection(product);
}

async function importCleanApprovedProduct(product: ScrapedManufacturerProduct) {
  const productTitle = decodeEntities(product.productTitle);
  const titleEn = product.titleEn ? decodeEntities(product.titleEn) : null;
  const titleTh = product.titleTh ? decodeEntities(product.titleTh) : null;

  const row = await createAdminProduct({
    actor: "manufacturer_scraper_clean_import",
    availableCountryCodes: ["TH"],
    brandStatus: "approved",
    brandName: product.brandName,
    description: product.description,
    descriptionEn: product.descriptionEn,
    descriptionTh: product.descriptionTh,
    facts: product.parsedFacts,
    fdaApprovalNumber: product.fdaApprovalNumber,
    imageUrl: product.imageUrls[0] ?? null,
    labelStatus: product.parsedFacts.length > 0 ? "parsed" : "missing",
    manufacturerCountryCodes: ["TH"],
    status: "pending_review",
    platform: "manual",
    productAudience: qualityProductAudience(product) ?? undefined,
    productKind: product.parsedFacts.length >= 6 ? "multi" : "supplement",
    productUrl: product.sourceUrl,
    region: "TH",
    replaceFacts: true,
    source: "manufacturer_import",
    sourceSnapshot: {
      ...product.rawSnapshot,
      productImportMode: "clean_auto_approve"
    },
    sourceUrl: product.sourceUrl,
    title: productTitle,
    titleEn,
    titleTh
  });

  if (row.validation.status !== "pass") {
    await deletePendingManufacturerImportProduct(row.id);
    return {
      approved: false,
      productId: row.id,
      reason: row.validation.summary
    };
  }

  const approvedRow = await updateAdminProduct({
    actor: "manufacturer_scraper_clean_import",
    changeNote: "manufacturer_import_clean_auto_approved",
    id: row.id,
    status: "approved"
  });

  return {
    approved: approvedRow.status === "approved" &&
      approvedRow.validation.status === "pass",
    productId: approvedRow.id,
    reason: approvedRow.validation.summary
  };
}

function productOfferSnapshots(product: ScrapedManufacturerProduct) {
  const value = product.rawSnapshot.productOffers ?? product.rawSnapshot.whereToBuyLinks;

  return Array.isArray(value)
    ? value
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .flatMap((item) => {
        const url = typeof item.url === "string" ? item.url.trim() : "";

        if (!url) {
          return [];
        }

        return [{
          availabilityStatus: "unknown" as const,
          commissionRate: null,
          currency: "THB",
          linkType: item.linkType === "affiliate" ? "affiliate" as const : "direct" as const,
          network: typeof item.network === "string" ? item.network : "manufacturer_where_to_buy",
          platform: typeof item.platform === "string" ? item.platform : null,
          priceAmount: typeof item.priceAmount === "number" ? item.priceAmount : null,
          priority: typeof item.priority === "number" ? item.priority : 0,
          status: (
            item.status === "inactive" || item.status === "flagged_stale"
              ? item.status
              : "active"
          ) as "active" | "flagged_stale" | "inactive",
          url
        }];
      })
    : [];
}

async function upsertProductOffersForImport(product: ScrapedManufacturerProduct, productId: string | null | undefined) {
  if (!productId) {
    return 0;
  }

  let upserted = 0;

  for (const offer of productOfferSnapshots(product)) {
    await upsertProductOffer({
      actor: "manufacturer_scraper_offer_import",
      availabilityStatus: offer.availabilityStatus,
      commissionRate: offer.commissionRate,
      currency: offer.currency,
      linkType: offer.linkType,
      network: offer.network,
      platform: offer.platform,
      priceAmount: offer.priceAmount,
      priority: offer.priority,
      productId,
      status: offer.status,
      url: offer.url
    });
    upserted += 1;
  }

  return upserted;
}

async function correctProductWithAi(
  product: ScrapedManufacturerProduct,
  index: number,
  total: number,
  failOpen: boolean,
  allowFallback: boolean
): Promise<{ corrected: boolean; failed: boolean; product: ScrapedManufacturerProduct; recovered: boolean }> {
  console.log(`[ai] ${index}/${total} ${product.productTitle}`);

  try {
    const correction = await correctDraftProductFactsWithAi({
      brandName: product.brandName,
      currentFacts: product.parsedFacts,
      description: product.description,
      descriptionEn: product.descriptionEn,
      descriptionTh: product.descriptionTh,
      productTitle: product.productTitle,
      productTitleEn: product.titleEn,
      productTitleTh: product.titleTh,
      productUrl: product.sourceUrl,
      productAudience: productAudienceFromRawSnapshot(product.rawSnapshot),
      sourceSnapshot: product.rawSnapshot
    });

    return {
      corrected: true,
      failed: false,
      recovered: false,
      product: {
        ...product,
        parsedFacts: correction.facts,
        rawSnapshot: {
          ...product.rawSnapshot,
          aiFactCorrection: {
            correctedAt: new Date().toISOString(),
            correctedFactCount: correction.facts.length,
            originalFactCount: product.parsedFacts.length,
            productAudience: correction.productAudience,
            responseId: correction.responseId ?? null,
            notes: correction.notes
          }
        }
      }
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[ai] ${product.productTitle} failed: ${message}`);

    if (allowFallback) {
      try {
        const fallback = await recoverDraftProductFactsWithAi({
          brandName: product.brandName,
          currentFacts: product.parsedFacts,
          description: product.description,
          descriptionEn: product.descriptionEn,
          descriptionTh: product.descriptionTh,
          productTitle: product.productTitle,
          productTitleEn: product.titleEn,
          productTitleTh: product.titleTh,
          productUrl: product.sourceUrl,
          productAudience: productAudienceFromRawSnapshot(product.rawSnapshot),
          sourceSnapshot: product.rawSnapshot
        });

        return {
          corrected: false,
          failed: false,
          recovered: true,
          product: {
            ...product,
            parsedFacts: fallback.facts,
            rawSnapshot: {
              ...product.rawSnapshot,
              aiFactCorrection: {
                failedAt: new Date().toISOString(),
                error: message,
                originalFactCount: product.parsedFacts.length
              },
              aiFactFallback: {
                recoveredAt: new Date().toISOString(),
                recoveredFactCount: fallback.facts.length,
                responseId: fallback.responseId ?? null,
                notes: fallback.notes,
                productAudience: fallback.productAudience,
                reviewRequired: true
              }
            }
          }
        };
      } catch (fallbackError) {
        console.warn(
          `[ai] ${product.productTitle} fallback failed: ${errorMessage(fallbackError)}`
        );
      }
    }

    if (!failOpen) {
      throw error;
    }

    return {
      corrected: false,
      failed: true,
      recovered: false,
      product: {
        ...product,
        rawSnapshot: {
          ...product.rawSnapshot,
          aiFactCorrection: {
            failedAt: new Date().toISOString(),
            error: message,
            originalFactCount: product.parsedFacts.length
          }
        }
      }
    };
  }
}

async function correctProductsWithAi(input: Readonly<{
  allowFallback: boolean;
  delayMs: number;
  failOpen: boolean;
  products: readonly ScrapedManufacturerProduct[];
  startAt: number;
}>) {
  let corrected = 0;
  let failed = 0;
  let recovered = 0;
  const products: ScrapedManufacturerProduct[] = [];

  for (let index = 0; index < input.products.length; index += 1) {
    const product = input.products[index];
    const productNumber = index + 1;

    if (productNumber < input.startAt) {
      products.push(product);
      continue;
    }

    const result = await correctProductWithAi(
      product,
      productNumber,
      input.products.length,
      input.failOpen,
      input.allowFallback
    );
    products.push(result.product);

    if (result.corrected) {
      corrected += 1;
    }

    if (result.failed) {
      failed += 1;
    }

    if (result.recovered) {
      recovered += 1;
    }

    await delay(input.delayMs);
  }

  return { corrected, failed, products, recovered };
}

function qualityEvidenceHash(product: ScrapedManufacturerProduct) {
  return productEvidenceHash({
    description: product.description,
    fdaApprovalNumber: product.fdaApprovalNumber,
    imageUrls: product.imageUrls,
    productTitle: product.productTitle,
    sourceUrl: product.sourceUrl,
    titleEn: product.titleEn,
    titleTh: product.titleTh,
    evidence: {
      extractedText: product.rawSnapshot.extractedText,
      labelImageUrls: product.rawSnapshot.labelImageUrls,
      modified: product.rawSnapshot.modified,
      renderedHtmlLength: product.rawSnapshot.renderedHtmlLength,
      supplementFactsUrl: product.rawSnapshot.supplementFactsUrl,
      wordpressProductId: product.rawSnapshot.wordpressProductId
    }
  });
}

function qualityEnrichment(product: ScrapedManufacturerProduct) {
  const enrichment = product.rawSnapshot.qualityEnrichment;

  return enrichment && typeof enrichment === "object"
    ? enrichment as Record<string, unknown>
    : null;
}

function hasCurrentQualityEnrichment(product: ScrapedManufacturerProduct) {
  const enrichment = qualityEnrichment(product);

  if (!enrichment?.enrichedAt) {
    return false;
  }

  if (enrichment.evidenceHash === qualityEvidenceHash(product)) {
    return true;
  }

  const factCount = typeof enrichment.factCount === "number"
    ? enrichment.factCount
    : null;

  return Boolean(
    enrichment.responseId &&
    factCount !== null &&
    factCount === product.parsedFacts.length
  );
}

function qualityProductAudience(product: ScrapedManufacturerProduct) {
  const enrichment = qualityEnrichment(product);
  const value = enrichment?.productAudience;

  return value === "both" || value === "female" || value === "male"
    ? value
    : productAudienceFromRawSnapshot(product.rawSnapshot);
}

function qualityLabelImageUrls(product: ScrapedManufacturerProduct) {
  const value = product.rawSnapshot.labelImageUrls;

  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string")
    : [];
}

async function enrichQualityProduct(
  product: ScrapedManufacturerProduct,
  index: number,
  total: number
): Promise<{ failed: boolean; product: ScrapedManufacturerProduct; reused: boolean; skipped: boolean }> {
  if (isSkippedProduct(product)) {
    console.log(`[quality] skipped ${index}/${total} ${product.productTitle}; ${importSkipReason(product)}`);
    return { failed: false, product, reused: false, skipped: true };
  }

  const evidenceHash = qualityEvidenceHash(product);

  if (hasCurrentQualityEnrichment(product)) {
    if (qualityDisplayBlockers(product).length === 0) {
      console.log(`[quality] reused ${index}/${total} ${product.productTitle}`);
      const enrichment = qualityEnrichment(product);

      return {
        product: enrichment?.evidenceHash === evidenceHash
          ? product
          : {
            ...product,
            rawSnapshot: {
              ...product.rawSnapshot,
              qualityEnrichment: {
                ...enrichment,
                evidenceHash
              }
            }
          },
        failed: false,
        reused: true,
        skipped: false
      };
    }

    console.log(`[quality] refresh copy ${index}/${total} ${product.productTitle}`);
  }

  console.log(`[quality] enrich ${index}/${total} ${product.productTitle}`);
  try {
    const enrichment = await enrichDraftProductCatalogueWithAi({
      brandName: product.brandName,
      currentFacts: product.parsedFacts,
      description: product.description,
      descriptionEn: product.descriptionEn,
      descriptionTh: product.descriptionTh,
      imageUrls: [...new Set([...qualityLabelImageUrls(product), ...product.imageUrls])],
      productTitle: product.productTitle,
      productTitleEn: product.titleEn,
      productTitleTh: product.titleTh,
      productUrl: product.sourceUrl,
      productAudience: productAudienceFromRawSnapshot(product.rawSnapshot),
      sourceSnapshot: product.rawSnapshot
    });

    return {
      failed: false,
      product: {
        ...product,
        descriptionEn: enrichment.descriptionEn ?? product.descriptionEn,
        descriptionTh: enrichment.descriptionTh ?? product.descriptionTh,
        parsedFacts: enrichment.facts,
        rawSnapshot: {
          ...product.rawSnapshot,
          qualityEnrichment: {
            evidenceHash,
            enrichedAt: new Date().toISOString(),
            factCount: enrichment.facts.length,
            notes: enrichment.notes,
            productAudience: enrichment.productAudience,
            responseId: enrichment.responseId ?? null,
            titleZhCn: enrichment.titleZhCn,
            descriptionZhCn: enrichment.descriptionZhCn,
            warnings: enrichment.warnings
          }
        },
        translations: {
          ...(product.translations ?? {}),
          ...(enrichment.titleZhCn || enrichment.descriptionZhCn
            ? {
                "zh-CN": {
                  description: enrichment.descriptionZhCn,
                  status:
                    enrichment.titleZhCn && enrichment.descriptionZhCn
                      ? "complete" as const
                      : "draft" as const,
                  title: enrichment.titleZhCn
                }
              }
            : {})
        },
        titleEn: enrichment.titleEn ?? product.titleEn,
        titleTh: enrichment.titleTh ?? product.titleTh
      },
      reused: false,
      skipped: false
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[quality] failed ${index}/${total} ${product.productTitle}: ${message}`);

    return {
      failed: true,
      product: {
        ...product,
        rawSnapshot: {
          ...product.rawSnapshot,
          qualityEnrichment: {
            error: message,
            evidenceHash,
            failedAt: new Date().toISOString()
          }
        }
      },
      reused: false,
      skipped: false
    };
  }
}

async function enrichProductsForQualityImport(input: Readonly<{
  batchSize: number;
  concurrency: number;
  outputPath: string | null;
  products: readonly ScrapedManufacturerProduct[];
}>) {
  const products = [...input.products];
  let enriched = 0;
  let failed = 0;
  let reused = 0;
  let skipped = 0;
  let pendingWrite = Promise.resolve();

  function queueSnapshotWrite() {
    pendingWrite = pendingWrite.then(async () => {
      await writeOutput(input.outputPath, products);
    });

    return pendingWrite;
  }

  const batchSize = Math.max(1, Math.min(input.batchSize, products.length || 1));
  const totalBatches = Math.max(1, Math.ceil(products.length / batchSize));

  for (let batchStart = 0; batchStart < products.length; batchStart += batchSize) {
    const batchProducts = products.slice(batchStart, batchStart + batchSize);
    const batchNumber = Math.floor(batchStart / batchSize) + 1;
    console.log(
      `[batch quality] ${batchNumber}/${totalBatches} products ${batchStart + 1}-${batchStart + batchProducts.length} of ${products.length}`
    );

    await concurrentMapOrdered(
      batchProducts,
      input.concurrency,
      async (product, batchIndex) => {
        const index = batchStart + batchIndex;
        const result = await enrichQualityProduct(product, index + 1, products.length);
        products[index] = result.product;

        if (result.skipped) {
          skipped += 1;
        } else if (result.failed) {
          failed += 1;
        } else if (result.reused) {
          reused += 1;
        } else {
          enriched += 1;
        }

        await queueSnapshotWrite();
        return result.product;
      }
    );

    await pendingWrite;
    console.log(
      `[batch quality] completed ${batchNumber}/${totalBatches}; enriched=${enriched} reused=${reused} failed=${failed} skipped=${skipped}`
    );
  }

  return { enriched, failed, products, reused, skipped };
}

async function validateProductsForQualityImport(
  products: readonly ScrapedManufacturerProduct[],
  outputPath: string | null
) {
  const validated: ScrapedManufacturerProduct[] = [];
  const blockers = new Map<string, number>();
  let autoApproved = 0;
  let pendingReview = 0;
  let skipped = 0;

  for (const product of products) {
    if (isSkippedProduct(product)) {
      skipped += 1;
      validated.push({
        ...product,
        rawSnapshot: {
          ...product.rawSnapshot,
          qualityValidation: {
            decision: "skipped",
            reasons: ["non_supplement"],
            status: "skipped",
            summary: `Skipped during import: ${importSkipReason(product)}`
          }
        }
      });
      continue;
    }

    const validation = await validateProductImportForApproval({
      facts: product.parsedFacts,
      imageUrl: product.imageUrls[0] ?? null,
      labelStatus: product.parsedFacts.length > 0 ? "parsed" : "missing",
      productUrl: product.sourceUrl,
      sourceUrl: product.sourceUrl,
      title: product.productTitle,
      titleEn: product.titleEn
    });
    const displayBlockers = qualityDisplayBlockers(product);
    const reasons = [...new Set([...validation.reasons, ...displayBlockers])];
    const approved = validation.status === "pass" && displayBlockers.length === 0;
    const summary = [
      validation.summary,
      displayBlockers.length > 0 ? "Missing bilingual title or description." : null
    ].filter(Boolean).join("; ");
    const validationStatus = approved
      ? "pass"
      : validation.status === "pass"
        ? "needs_review"
        : validation.status;

    if (approved) {
      autoApproved += 1;
    } else {
      pendingReview += 1;
    }

    for (const reason of reasons) {
      blockers.set(reason, (blockers.get(reason) ?? 0) + 1);
    }

    validated.push({
      ...product,
      rawSnapshot: {
        ...product.rawSnapshot,
        qualityValidation: {
          ...validation,
          reasons,
          status: validationStatus,
          summary,
          decision: approved ? "auto_approve" : "pending_review"
        }
      }
    });
  }

  await writeOutput(outputPath, validated);

  return {
    autoApproved,
    blockers: Object.fromEntries([...blockers.entries()].sort()),
    pendingReview,
    products: validated,
    skipped
  };
}

async function writeOutput(outputPath: string | null, products: readonly ScrapedManufacturerProduct[]) {
  if (!outputPath) {
    return false;
  }

  const absolutePath = path.resolve(outputPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(products, null, 2)}\n`);
  await rename(temporaryPath, absolutePath);

  return true;
}

async function readInput(inputPath: string | null) {
  if (!inputPath) {
    return null;
  }

  const absolutePath = path.resolve(inputPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("--input must point to a JSON array written by this scraper");
  }

  return parsed as ScrapedManufacturerProduct[];
}

async function readCachedOutput(outputPath: string | null) {
  if (!outputPath) {
    return [];
  }

  try {
    return await readInput(outputPath) ?? [];
  } catch (error) {
    const code = error && typeof error === "object"
      ? (error as { code?: string }).code
      : null;

    if (code !== "ENOENT") {
      console.warn(`[quality] ignoring unreadable cache ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return [];
  }
}

function applyQualityCache(
  products: readonly ScrapedManufacturerProduct[],
  cachedProducts: readonly ScrapedManufacturerProduct[]
) {
  if (cachedProducts.length === 0) {
    return [...products];
  }

  const cacheBySourceUrl = new Map(
    cachedProducts.map((product) => [product.sourceUrl, product])
  );

  return products.map((product) => {
    const cached = cacheBySourceUrl.get(product.sourceUrl);
    const cachedEnrichment = cached ? qualityEnrichment(cached) : null;

    if (!cached || !cachedEnrichment?.enrichedAt) {
      return product;
    }

    const evidenceHash = qualityEvidenceHash(product);

    if (cachedEnrichment.evidenceHash !== evidenceHash) {
      return product;
    }

    if (qualityDisplayBlockers(cached).length > 0) {
      return product;
    }

    return {
      ...product,
      descriptionEn: cached.descriptionEn ?? product.descriptionEn,
      descriptionTh: cached.descriptionTh ?? product.descriptionTh,
      parsedFacts: cached.parsedFacts,
      rawSnapshot: {
        ...product.rawSnapshot,
        qualityEnrichment: cachedEnrichment
      },
      translations: {
        ...(product.translations ?? {}),
        ...(typeof cachedEnrichment.titleZhCn === "string" ||
        typeof cachedEnrichment.descriptionZhCn === "string"
          ? {
              "zh-CN": {
                description:
                  typeof cachedEnrichment.descriptionZhCn === "string"
                    ? cachedEnrichment.descriptionZhCn
                    : null,
                status:
                  typeof cachedEnrichment.titleZhCn === "string" &&
                  typeof cachedEnrichment.descriptionZhCn === "string"
                    ? "complete" as const
                    : "draft" as const,
                title:
                  typeof cachedEnrichment.titleZhCn === "string"
                    ? cachedEnrichment.titleZhCn
                    : null
              }
            }
          : {})
      },
      titleEn: cached.titleEn ?? product.titleEn,
      titleTh: cached.titleTh ?? product.titleTh
    };
  });
}

function isRetryableApplyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|Connection terminated|Connection ended|fetch failed/i.test(message);
}

async function withApplyRetries<T>(label: string, run: () => Promise<T>) {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await run();
    } catch (error) {
      if (attempt >= 4 || !isRetryableApplyError(error)) {
        throw error;
      }

      const backoffMs = attempt * 2_000;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[apply] ${label} failed (${message}); retrying in ${backoffMs}ms`);
      await delay(backoffMs);
    }
  }
}

async function shouldRefreshPendingReviewProduct(productId: string | null | undefined) {
  if (!productId) {
    return false;
  }

  const sql = getSql();

  if (!sql) {
    return false;
  }

  const rows = await sql<Array<{ status: string }>>`
    select status
    from public.products
    where id = ${productId}::uuid
    limit 1
  `;

  return rows[0]?.status === "pending_review";
}

async function clearBrandCatalogue(brandName: string) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const normalizedBrandName = normalizeProductKey(brandName);
  const lowerBrandName = brandName.trim().toLowerCase();
  const productRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.products
    where normalized_brand_name = ${normalizedBrandName}
       or lower(coalesce(brand_name, '')) = ${lowerBrandName}
  `;
  const importRows = await sql<Array<{ id: string; review_task_id: string | null }>>`
    select id::text, review_task_id::text
    from public.product_imports
    where normalized_brand_name = ${normalizedBrandName}
       or lower(coalesce(brand_name, '')) = ${lowerBrandName}
  `;
  const taskRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where task_type = 'review_product_import'
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
      and (
        payload ->> 'brandName' = ${brandName}
        or lower(payload ->> 'brandName') = ${lowerBrandName}
      )
  `;
  const productIds = productRows.map((row) => row.id);
  const importIds = importRows.map((row) => row.id);
  const reviewTaskIds = importRows
    .map((row) => row.review_task_id)
    .filter((id): id is string => Boolean(id));
  const taskIds = [
    ...new Set([
      ...reviewTaskIds,
      ...taskRows.map((row) => row.id)
    ])
  ];
  let recommendationItemsRetained = 0;
  let productsMarkedIgnored = 0;
  let importsMarkedIgnored = 0;
  let importRunsArchived = 0;
  let reviewTasksCancelled = 0;

  if (productIds.length > 0) {
    const itemRows = await sql<Array<{ id: string }>>`
      select id::text
      from public.product_recommendation_items
      where product_id = any(${productIds}::uuid[])
    `;
    recommendationItemsRetained = itemRows.length;
  }

  if (importIds.length > 0) {
    const importRows = await sql<Array<{ id: string }>>`
      update public.product_imports
      set
        status = 'ignored',
        reviewer_note = concat_ws(
          E'\n',
          nullif(reviewer_note, ''),
          'Archived by manufacturer brand catalogue refresh.'
        ),
        updated_at = now()
      where id = any(${importIds}::uuid[])
      returning id::text
    `;
    importsMarkedIgnored = importRows.length;
  }

  if (taskIds.length > 0) {
    const taskCancelRows = await sql<Array<{ id: string }>>`
      update public.tasks
      set
        status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        result_payload = coalesce(result_payload, '{}'::jsonb) ||
          jsonb_build_object(
            'cancelledBy', 'manufacturer_brand_catalogue_clear',
            'brandName', ${brandName}::text
          ),
        updated_at = now()
      where id = any(${taskIds}::uuid[])
        and status not in ('completed', 'failed', 'cancelled', 'skipped')
      returning id::text
    `;
    reviewTasksCancelled = taskCancelRows.length;
  }

  if (productIds.length > 0) {
    const productRows = await sql<Array<{ id: string }>>`
      update public.products
      set
        status = 'ignored',
        availability_status = 'unavailable',
        admin_notes = concat_ws(
          E'\n',
          nullif(admin_notes, ''),
          'Ignored by manufacturer brand catalogue refresh.'
        ),
        updated_at = now()
      where id = any(${productIds}::uuid[])
      returning id::text
    `;
    productsMarkedIgnored = productRows.length;
  }

  const runRows = await sql<Array<{ id: string }>>`
    update public.product_import_runs
    set
      status = 'completed',
      notes = concat_ws(
        E'\n',
        nullif(notes, ''),
        'Archived by manufacturer brand catalogue refresh.'
      ),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where normalized_brand_name = ${normalizedBrandName}
       or lower(coalesce(brand_name, '')) = ${lowerBrandName}
    returning id::text
  `;
  importRunsArchived = runRows.length;

  await sql`
    insert into public.product_admin_audit (
      action,
      actor,
      after_payload
    )
    values (
      'manufacturer_brand_catalogue_cleared',
      'manufacturer_scraper',
      ${sql.json({
        brandName,
        importRunsArchived,
        importsMarkedIgnored,
        productsMarkedIgnored,
        recommendationItemsRetained,
        reviewTasksCancelled
      })}::jsonb
    )
  `;

  return {
    importRunsArchived,
    importsMarkedIgnored,
    productsMarkedIgnored,
    recommendationItemsRetained,
    reviewTasksCancelled
  };
}

function normalizedUrlForDb(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

async function loadExistingProductUrlSet(brandName: string) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{ normalized_url: string | null }>>`
    select normalized_url
    from public.products
    where normalized_brand_name = ${normalizeProductKey(brandName)}
      and normalized_url is not null
  `;

  return new Set(
    rows
      .map((row) => row.normalized_url?.trim().toLowerCase())
      .filter((url): url is string => Boolean(url))
  );
}

async function markMissingScopedProductsIgnored(input: Readonly<{
  brandName: string;
  importRunId: string | null;
  keepSourceUrls: readonly string[];
  scope: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const keepUrls = input.keepSourceUrls.map(normalizedUrlForDb);
  const rows = await sql<Array<{ id: string; title: string }>>`
    select id::text, title
    from public.products
    where normalized_brand_name = ${normalizeProductKey(input.brandName)}
      and status <> 'ignored'
      and source_snapshot ->> 'importScope' = ${input.scope}
      and not (coalesce(normalized_url, '') = any(${keepUrls}::text[]))
    order by updated_at asc
  `;
  let ignored = 0;

  for (const row of rows) {
    await updateAdminProduct({
      actor: "manufacturer_scraper_replay",
      adminNotes: "Product no longer appears in the latest manufacturer Health & Wellness import snapshot.",
      changeNote: "manufacturer_source_missing",
      id: row.id,
      sourceSnapshotPatch: {
        importRunId: input.importRunId,
        importScope: input.scope,
        manufacturerSourceMissingAt: new Date().toISOString(),
        manufacturerSourceMissingReason: "not_found_in_latest_replay"
      },
      status: "ignored"
    });
    ignored += 1;
  }

  return ignored;
}

async function main() {
  const brandName = argValue("brand") ?? "";
  const normalizedBrand = normalizeBrand(brandName);
  const apply = hasArg("apply");
  const autoApprove = hasArg("auto-approve");
  const cleanOnly = hasArg("clean-only");
  const quality = hasArg("quality");
  const delayMs = Math.min(5_000, positiveInt(argValue("delay-ms"), 750));
  const evidenceConcurrency = positiveInt(argValue("evidence-concurrency"), 6);
  const aiConcurrency = positiveInt(argValue("ai-concurrency"), 3);
  const requestedBatchSize = positiveInt(argValue("batch-size"), 0);
  const startAt = positiveInt(argValue("start-at"), 1);
  const inputPath = argValue("input");
  const outputPath = argValue("out");
  const aiCorrectionStrict = hasArg("ai-correction-strict");
  const aiCopyStrict = hasArg("ai-copy-strict");
  const aiFallbackFacts = hasArg("ai-fallback-facts") ||
    (apply && normalizedBrand === "mega we care");
  const clearBrandProducts = hasArg("clear-brand-products");
  const aiCorrectionDelayMs = Math.min(
    10_000,
    positiveInt(argValue("ai-correction-delay-ms"), Math.max(delayMs, 750))
  );
  const aiCopyDelayMs = Math.min(
    10_000,
    positiveInt(argValue("ai-copy-delay-ms"), Math.max(delayMs, 750))
  );
  const inputProducts = await readInput(inputPath);
  const inputHasAiCorrection = inputProducts
    ? inputProducts.every((product) => Boolean(product.rawSnapshot.aiFactCorrection))
    : false;
  const inputHasAiCopyTranslation = inputProducts
    ? inputProducts.every((product) => Boolean(product.rawSnapshot.aiCopyTranslation))
    : false;
  const aiCorrectFacts = !quality && (hasArg("ai-correct-facts") || (apply && !inputHasAiCorrection));
  const aiTranslateCopy = hasArg("ai-translate-copy") ||
    (!quality && apply && normalizedBrand === "mega we care" && !inputHasAiCopyTranslation);
  const aiStartAt = positiveInt(argValue("ai-start-at"), apply ? startAt : 1);
  const aiCopyStartAt = positiveInt(argValue("ai-copy-start-at"), apply ? startAt : 1);
  const urls = inputProducts ? [] : await productUrlsFromArgs(normalizedBrand);

  if (!INITIAL_BRANDS.has(normalizedBrand)) {
    throw new Error(
      `--brand must be one of: ${[...INITIAL_BRANDS].sort().join(", ")}`
    );
  }

  if (quality && !["mega we care", "swisse", "vistra", "dhc"].includes(normalizedBrand)) {
    throw new Error("--quality is currently implemented for --brand='mega we care', --brand=swisse, --brand=vistra, or --brand=dhc only");
  }

  if (apply && !inputProducts && !quality) {
    throw new Error("--apply is snapshot-first: pass --input=<snapshot.json> instead of scraping and writing DB in one run");
  }

  if (cleanOnly && !autoApprove) {
    throw new Error("--clean-only requires --auto-approve so skipped products do not create review tasks");
  }

  if (!apply && !outputPath) {
    throw new Error("--out=<snapshot.json> is required so scrape runs produce a repeatable import snapshot");
  }

  if (!inputProducts && urls.length < 1) {
    throw new Error("--product-urls is required for this brand; pass comma-separated manufacturer product URLs");
  }

  let products = inputProducts ? [...inputProducts] : [];
  let scraped = 0;

  if (!inputProducts) {
    if (quality) {
      const cachedProducts = await readCachedOutput(outputPath);
      const batchSize = requestedBatchSize > 0
        ? Math.min(requestedBatchSize, urls.length || requestedBatchSize)
        : urls.length || 1;
      const totalBatches = Math.max(1, Math.ceil(urls.length / batchSize));

      for (let batchStart = 0; batchStart < urls.length; batchStart += batchSize) {
        const batchUrls = urls.slice(batchStart, batchStart + batchSize);
        const batchNumber = Math.floor(batchStart / batchSize) + 1;
        console.log(
          `[batch scrape] ${batchNumber}/${totalBatches} urls ${batchStart + 1}-${batchStart + batchUrls.length} of ${urls.length}`
        );
        const batchProducts = await concurrentMapOrdered(
          batchUrls,
          evidenceConcurrency,
          async (url, batchIndex) => {
            const absoluteIndex = batchStart + batchIndex;
            console.log(`[scrape] ${absoluteIndex + 1}/${urls.length} ${url}`);
            const product = await scrapeProduct(url, brandName);
            await delay(delayMs);
            return product;
          }
        );
        products.push(...applyQualityCache(batchProducts, cachedProducts));
        await writeOutput(outputPath, products);
        console.log(
          `[batch scrape] completed ${batchNumber}/${totalBatches}; scraped=${batchProducts.length} total=${products.length}`
        );
      }
      scraped = products.length;
      await writeOutput(outputPath, products);
    } else {
      for (const url of urls) {
        scraped += 1;
        console.log(`[scrape] ${scraped}/${urls.length} ${url}`);
        products.push(await scrapeProduct(url, brandName));
        await delay(delayMs);
      }
    }
  } else {
    console.log(`[input] loaded ${products.length} products from ${inputPath}`);
  }

  let qualityEnrichment = { enriched: 0, failed: 0, reused: 0, skipped: 0 };
  let qualityValidation = {
    autoApproved: 0,
    blockers: {} as Record<string, number>,
    pendingReview: 0,
    skipped: 0
  };

  if (quality) {
    const enrichment = await enrichProductsForQualityImport({
      batchSize: requestedBatchSize > 0 ? requestedBatchSize : products.length || 1,
      concurrency: aiConcurrency,
      outputPath,
      products
    });
    products = [...enrichment.products];
    qualityEnrichment = {
      enriched: enrichment.enriched,
      failed: enrichment.failed,
      reused: enrichment.reused,
      skipped: enrichment.skipped
    };
    const validation = await validateProductsForQualityImport(products, outputPath);
    products = [...validation.products];
    qualityValidation = {
      autoApproved: validation.autoApproved,
      blockers: validation.blockers,
      pendingReview: validation.pendingReview,
      skipped: validation.skipped
    };
  }

  const aiCopyTranslation = !quality && aiTranslateCopy
    ? await translateProductsCopyWithAi({
      delayMs: aiCopyDelayMs,
      failOpen: !aiCopyStrict,
      products,
      startAt: aiCopyStartAt
    })
    : { failed: 0, products, translated: 0 };
  products = [...aiCopyTranslation.products];

  const aiCorrection = !quality && aiCorrectFacts
    ? await correctProductsWithAi({
      allowFallback: aiFallbackFacts,
      delayMs: aiCorrectionDelayMs,
      failOpen: !aiCorrectionStrict,
      products,
      startAt: aiStartAt
    })
    : { corrected: 0, failed: 0, products, recovered: 0 };
  products = [...aiCorrection.products];
  const wroteFile = await writeOutput(outputPath, products);

  let stagedImportCount = 0;
  let autoApprovedImportCount = 0;
  let pendingReviewImportCount = 0;
  let skippedInvalidImportCount = 0;
  let productOffersUpserted = 0;
  let importNewProductCount = 0;
  let importUpdatedProductCount = 0;
  let importMarkedIgnoredCount = 0;

  if (apply) {
    if (clearBrandProducts) {
      const cleared = await clearBrandCatalogue(brandName);
      console.log(`[clear] ${JSON.stringify(cleared)}`);
    }

    const existingProductUrlsBeforeApply = await loadExistingProductUrlSet(brandName);
    const appliedSourceUrls = new Set<string>();
    const recordAppliedProduct = (product: ScrapedManufacturerProduct) => {
      const normalizedSourceUrl = normalizedUrlForDb(product.sourceUrl);

      if (appliedSourceUrls.has(normalizedSourceUrl)) {
        return;
      }

      appliedSourceUrls.add(normalizedSourceUrl);

      if (existingProductUrlsBeforeApply.has(normalizedSourceUrl)) {
        importUpdatedProductCount += 1;
      } else {
        importNewProductCount += 1;
      }
    };
    let appliedCount = Math.max(0, startAt - 1);
    let autoApprovedCount = 0;
    let failedCount = 0;
    let offersUpserted = 0;
    let stagedCount = 0;
    let skippedInvalidCount = 0;
    const skippedProducts = products.filter(isSkippedProduct).length;
    const productsToApply = products
      .filter((product) => !isSkippedProduct(product))
      .slice(Math.max(0, startAt - 1));
    const importRunId = await startProductImportRun({
      autoApprove,
      brandName,
      source: "manufacturer_import_file",
      totalProducts: productsToApply.length
    });

    for (const product of productsToApply) {
      appliedCount += 1;
      console.log(`[apply] ${appliedCount}/${products.length} ${product.productTitle}`);
      const cleanAutoApproval = autoApprove
        ? await canAutoApproveProduct(product)
        : false;

      if (cleanOnly && !cleanAutoApproval) {
        skippedInvalidCount += 1;
        console.warn(
          `[apply] skipped ${product.productTitle}; not clean enough for auto-approval`
        );
        continue;
      }

      if (cleanOnly) {
        await withApplyRetries(product.productTitle, async () => {
          const result = await importCleanApprovedProduct(product);

          if (result.approved) {
            stagedCount += 1;
            recordAppliedProduct(product);
            autoApprovedCount += 1;
            autoApprovedImportCount = autoApprovedCount;
            offersUpserted += await upsertProductOffersForImport(product, result.productId);
            return;
          }

          skippedInvalidCount += 1;
          console.warn(
            `[apply] skipped ${product.productTitle}; ${result.reason}`
          );
        });
        continue;
      }

      await withApplyRetries(product.productTitle, async () => {
        const staged = await stageProductImport({
          actor: "manufacturer_scraper",
          brandName: product.brandName,
          description: product.description,
          descriptionEn: product.descriptionEn,
          descriptionTh: product.descriptionTh,
          fdaApprovalNumber: product.fdaApprovalNumber,
          imageUrls: product.imageUrls,
          importRunId,
          parsedFacts: product.parsedFacts,
          parseConfidence: product.parsedFacts.length > 0 ? "moderate" : "low",
          productTitle: product.productTitle,
          rawSnapshot: product.rawSnapshot,
          source: "manufacturer_scrape",
          sourceUrl: product.sourceUrl,
          titleEn: product.titleEn,
          titleTh: product.titleTh,
          translations: product.translations
        });
        stagedCount += 1;
        recordAppliedProduct(product);
        offersUpserted += await upsertProductOffersForImport(product, staged.productId);

        if (autoApprove && cleanAutoApproval) {
          try {
            await resolveProductImportReview({
              action: "approve",
              actor: "manufacturer_scraper_auto_approve",
              returnRow: false,
              reviewerNote: "Auto-approved for local product-matching catalogue testing.",
              taskId: staged.reviewTaskId
            });
            autoApprovedCount += 1;
            autoApprovedImportCount = autoApprovedCount;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (!/Product import review task not found/i.test(message)) {
              if (/Product still needs review/i.test(message)) {
                console.warn(
                  `[apply] kept pending review for ${product.productTitle}; ${message}`
                );

                if (await shouldRefreshPendingReviewProduct(staged.productId)) {
                  const reviewedRow = await updateAdminProduct({
                    actor: "manufacturer_scraper_auto_review",
                    adminNotes: message,
                    changeNote: "manufacturer_import_needs_review",
                    id: staged.productId,
                    status: "pending_review"
                  });

                  if (reviewedRow.validation.status === "pass") {
                    const approvedRow = await updateAdminProduct({
                      actor: "manufacturer_scraper_auto_approve",
                      changeNote: "manufacturer_import_clean_auto_approved_after_refresh",
                      id: staged.productId,
                      status: "approved"
                    });

                    if (approvedRow.status === "approved") {
                      autoApprovedCount += 1;
                      autoApprovedImportCount = autoApprovedCount;
                      return;
                    }
                  }
                }

                failedCount += 1;
                return;
              }

              throw error;
            }
          }
        } else if (autoApprove) {
          const qualityValidationSnapshot = product.rawSnapshot.qualityValidation &&
            typeof product.rawSnapshot.qualityValidation === "object"
            ? product.rawSnapshot.qualityValidation as Record<string, unknown>
            : null;
          const qualitySummary = typeof qualityValidationSnapshot?.summary === "string"
            ? qualityValidationSnapshot.summary
            : null;
          console.warn(
            `[apply] kept pending review for ${product.productTitle}; ${qualitySummary ?? (hasAiFactFallback(product) ? "AI fallback facts require review" : "AI cleanup failed or no usable facts were parsed")}`
          );

          if (await shouldRefreshPendingReviewProduct(staged.productId)) {
            await updateAdminProduct({
              actor: "manufacturer_scraper_auto_review",
              adminNotes: qualitySummary
                ? `Quality import validation kept this product pending review: ${qualitySummary}`
                : hasAiFactFallback(product)
                  ? "AI fallback proposed product facts from public/manufacturer context; kept for human review."
                  : hasFailedAiFactCorrection(product)
                    ? "AI fact cleanup failed during manufacturer import; kept for human review."
                    : "No usable facts were parsed during manufacturer import; kept for human review.",
              changeNote: "manufacturer_import_needs_review",
              id: staged.productId,
              labelStatus: product.parsedFacts.length > 0 ? "parsed" : "missing",
              status: "pending_review"
            });
          }

          failedCount += 1;
        }
      });
    }

    await finishProductImportRun({
      approvedCount: autoApprovedCount,
      failedCount,
      importRunId,
      notes: `Applied ${stagedCount} ${brandName} products from snapshot ${inputPath}; skipped ${skippedInvalidCount + skippedProducts} products that were not imported.`,
      stagedCount,
      status: "completed"
    });

    const replayScope =
      normalizedBrand === "vistra"
        ? "vistra_health_wellness"
        : normalizedBrand === "dhc"
          ? "dhc_japan_supplements"
          : null;

    if (replayScope && quality) {
      importMarkedIgnoredCount = await markMissingScopedProductsIgnored({
        brandName,
        importRunId,
        keepSourceUrls: products
          .filter((product) => !isSkippedProduct(product))
          .map((product) => product.sourceUrl),
        scope: replayScope
      });
    }

    stagedImportCount = stagedCount;
    autoApprovedImportCount = autoApprovedCount;
    pendingReviewImportCount = Math.max(0, stagedCount - autoApprovedCount);
    skippedInvalidImportCount = skippedInvalidCount;
    productOffersUpserted = offersUpserted;
    console.log(`[apply] staged=${stagedCount} autoApproved=${autoApprovedCount} pendingReview=${pendingReviewImportCount} skippedInvalid=${skippedInvalidCount} skippedNonSupplement=${skippedProducts} new=${importNewProductCount} updated=${importUpdatedProductCount} markedIgnored=${importMarkedIgnoredCount} offers=${offersUpserted}`);
  }

  console.log(JSON.stringify({
    applied: apply,
    autoApproved: apply && autoApprove,
    aiCopyTranslationFailures: aiCopyTranslation.failed,
    aiCopyTranslations: aiCopyTranslation.translated,
    aiTranslatedCopy: aiTranslateCopy,
    aiCorrected: aiCorrectFacts,
    aiCorrectionFailures: aiCorrection.failed,
    aiFallbackFacts,
    quality,
    batchSize: requestedBatchSize || null,
    qualityAutoApproved: qualityValidation.autoApproved,
    qualityBlockers: qualityValidation.blockers,
    qualityEnriched: qualityEnrichment.enriched,
    qualityEnrichmentFailures: qualityEnrichment.failed,
    qualityPendingReview: qualityValidation.pendingReview,
    qualityReused: qualityEnrichment.reused,
    qualitySkipped: qualityValidation.skipped,
    aiFactRecoveries: aiCorrection.recovered,
    aiCorrections: aiCorrection.corrected,
    brandName,
    discovered: urls.length,
    products: products.length,
    scraped,
    skipped: Math.max(0, urls.length - scraped) + qualityValidation.skipped,
    skippedInvalidImports: skippedInvalidImportCount,
    stagedImports: stagedImportCount,
    autoApprovedImports: autoApprovedImportCount,
    pendingReview: pendingReviewImportCount,
    newlyAdded: importNewProductCount,
    updated: importUpdatedProductCount,
    markedIgnored: importMarkedIgnoredCount,
    productOffersUpserted,
    wroteFile
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
