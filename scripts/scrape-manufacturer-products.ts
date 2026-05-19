import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveProductImportReview,
  stageProductImport,
  updateAdminProduct,
  type ProductImportFactInput
} from "@/lib/admin-products";
import { correctDraftProductFactsWithAi } from "@/lib/product-fact-correction";
import { validateProductQuality } from "@/lib/product-quality";
import {
  normalizeProductFactKey,
  normalizeProductFactName
} from "@/lib/product-recommendations";

const REQUEST_TIMEOUT_MS = 20_000;

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
  "mega we care": [
    "https://www.megawecare.co.th/product-category/supplement-product/"
  ],
  swisse: [
    "https://swisse.co.th/products/astaxanthin-gluta",
    "https://www.swissethailand.com/store/"
  ],
  vistra: [
    "https://vistra.co.th/product/vistra-imuforte-dietary/"
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
  titleEn: string | null;
  titleTh: string | null;
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
    "User-Agent": "MattaNutra product-import-review/1.0"
  };
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: manufacturerHeaders(),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
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

      return [url.toString().replace(/#.*$/, "")];
    } catch {
      return [];
    }
  });
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

function imagePriority(url: string) {
  if (/\/media\/product\/img-/i.test(url)) {
    return 0;
  }

  if (/\/media\/product\/social-thmb/i.test(url)) {
    return 1;
  }

  if (/\/media\/product\//i.test(url)) {
    return 2;
  }

  if (/\/tile-(?:new-)?/i.test(url)) {
    return 8;
  }

  if (/logo|ico-|icon|btn|share|bullet|banner/i.test(url)) {
    return 10;
  }

  return 5;
}

function imageUrlsFromHtml(html: string, sourceUrl: string) {
  const matches = [
    ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)
  ];
  const baseUrl = new URL(sourceUrl);
  const structuredProductImages = productVariantImageUrlsFromNextData(
    html,
    sourceUrl
  );
  const htmlImageUrls = matches.flatMap((match) => {
    try {
      return [new URL(decodeEntities(match[1]), baseUrl).toString()];
    } catch {
      return [];
    }
  });

  return [...new Set([...structuredProductImages, ...htmlImageUrls].filter((url) =>
    /\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url) &&
    imagePriority(url) < 10
  ))]
    .sort((first, second) => imagePriority(first) - imagePriority(second))
    .slice(0, 8);
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
  const html = await fetchHtml(url);
  const text = textFromHtml(html);
  const normalizedBrand = normalizeBrand(brandName);
  const parsedFacts = parsedFactsFromHtml(html, text, normalizedBrand);
  const title = titleFromHtml(html);
  const description = descriptionFromHtml(html, text);
  const locale = languageFromUrl(url) ?? languageFromHtml(html);

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
      extractedText: text.slice(0, 12_000),
      htmlLength: html.length,
      locale: locale ?? "unknown",
      parser:
        normalizedBrand === "blackmores"
          ? "blackmores_structured_ingredients_v2"
          : "generic_text_v1",
      structuredIngredients:
        normalizedBrand === "blackmores"
          ? blackmoresStructuredIngredientsFromHtml(html)
          : []
    },
    sourceUrl: url,
    titleEn: locale === "en" ? title : null,
    titleTh: locale === "th" ? title : null
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

function hasSuccessfulAiFactCorrection(product: ScrapedManufacturerProduct) {
  const correction = product.rawSnapshot.aiFactCorrection;

  return Boolean(
    correction &&
    typeof correction === "object" &&
    "correctedAt" in correction
  );
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

function canAutoApproveProduct(product: ScrapedManufacturerProduct) {
  const quality = validateProductQuality({
    facts: product.parsedFacts,
    imageUrl: product.imageUrls[0] ?? null,
    labelStatus: product.parsedFacts.length > 0 ? "parsed" : "missing",
    productUrl: product.sourceUrl,
    sourceUrl: product.sourceUrl
  });

  return quality.status === "pass" &&
    hasSuccessfulAiFactCorrection(product) &&
    !hasFailedAiFactCorrection(product);
}

async function correctProductWithAi(
  product: ScrapedManufacturerProduct,
  index: number,
  total: number,
  failOpen: boolean
): Promise<{ corrected: boolean; failed: boolean; product: ScrapedManufacturerProduct }> {
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

    if (!failOpen) {
      throw error;
    }

    return {
      corrected: false,
      failed: true,
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
  delayMs: number;
  failOpen: boolean;
  products: readonly ScrapedManufacturerProduct[];
  startAt: number;
}>) {
  let corrected = 0;
  let failed = 0;
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
      input.failOpen
    );
    products.push(result.product);

    if (result.corrected) {
      corrected += 1;
    }

    if (result.failed) {
      failed += 1;
    }

    await delay(input.delayMs);
  }

  return { corrected, failed, products };
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

async function main() {
  const brandName = argValue("brand") ?? "";
  const normalizedBrand = normalizeBrand(brandName);
  const apply = hasArg("apply");
  const autoApprove = hasArg("auto-approve");
  const delayMs = Math.min(5_000, positiveInt(argValue("delay-ms"), 750));
  const startAt = positiveInt(argValue("start-at"), 1);
  const inputPath = argValue("input");
  const outputPath = argValue("out");
  const aiCorrectFacts = hasArg("ai-correct-facts");
  const aiCorrectionStrict = hasArg("ai-correction-strict");
  const aiCorrectionDelayMs = Math.min(
    10_000,
    positiveInt(argValue("ai-correction-delay-ms"), Math.max(delayMs, 750))
  );
  const aiStartAt = positiveInt(argValue("ai-start-at"), apply ? startAt : 1);
  const inputProducts = await readInput(inputPath);
  const urls = inputProducts ? [] : await productUrlsFromArgs(normalizedBrand);

  if (!INITIAL_BRANDS.has(normalizedBrand)) {
    throw new Error(
      `--brand must be one of: ${[...INITIAL_BRANDS].sort().join(", ")}`
    );
  }

  if (!inputProducts && urls.length < 1) {
    throw new Error("--product-urls is required for this brand; pass comma-separated manufacturer product URLs");
  }

  let products = inputProducts ? [...inputProducts] : [];
  let scraped = 0;

  if (!inputProducts) {
    for (const url of urls) {
      scraped += 1;
      console.log(`[scrape] ${scraped}/${urls.length} ${url}`);
      products.push(await scrapeProduct(url, brandName));
      await delay(delayMs);
    }
  } else {
    console.log(`[input] loaded ${products.length} products from ${inputPath}`);
  }

  const aiCorrection = aiCorrectFacts
    ? await correctProductsWithAi({
      delayMs: aiCorrectionDelayMs,
      failOpen: !aiCorrectionStrict,
      products,
      startAt: aiStartAt
    })
    : { corrected: 0, failed: 0, products };
  products = [...aiCorrection.products];

  if (apply) {
    let appliedCount = Math.max(0, startAt - 1);
    let autoApprovedCount = 0;

    for (const product of products.slice(Math.max(0, startAt - 1))) {
      appliedCount += 1;
      console.log(`[apply] ${appliedCount}/${products.length} ${product.productTitle}`);
      await withApplyRetries(product.productTitle, async () => {
        const staged = await stageProductImport({
          actor: "manufacturer_scraper",
          brandName: product.brandName,
          description: product.description,
          descriptionEn: product.descriptionEn,
          descriptionTh: product.descriptionTh,
          fdaApprovalNumber: product.fdaApprovalNumber,
          imageUrls: product.imageUrls,
          parsedFacts: product.parsedFacts,
          parseConfidence: product.parsedFacts.length > 0 ? "moderate" : "low",
          productTitle: product.productTitle,
          rawSnapshot: product.rawSnapshot,
          source: "manufacturer_scrape",
          sourceUrl: product.sourceUrl,
          titleEn: product.titleEn,
          titleTh: product.titleTh
        });

        if (autoApprove && canAutoApproveProduct(product)) {
          try {
            await resolveProductImportReview({
              action: "approve",
              actor: "manufacturer_scraper_auto_approve",
              returnRow: false,
              reviewerNote: "Auto-approved for local product-matching catalogue testing.",
              taskId: staged.reviewTaskId
            });
            autoApprovedCount += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (!/Product import review task not found/i.test(message)) {
              if (/Product still needs review/i.test(message)) {
                console.warn(
                  `[apply] kept review required for ${product.productTitle}; ${message}`
                );

                if (staged.productId) {
                  await updateAdminProduct({
                    actor: "manufacturer_scraper_auto_review",
                    adminNotes: message,
                    changeNote: "manufacturer_import_needs_review",
                    id: staged.productId,
                    listStatus: "review_required"
                  });
                }

                return;
              }

              throw error;
            }
          }
        } else if (autoApprove) {
          console.warn(
            `[apply] kept review required for ${product.productTitle}; AI cleanup failed or no usable facts were parsed`
          );

          if (staged.productId) {
            await updateAdminProduct({
              actor: "manufacturer_scraper_auto_review",
              adminNotes: hasFailedAiFactCorrection(product)
                ? "AI fact cleanup failed during manufacturer import; kept for human review."
                : "No usable facts were parsed during manufacturer import; kept for human review.",
              changeNote: "manufacturer_import_needs_review",
              id: staged.productId,
              labelStatus: product.parsedFacts.length > 0 ? "failed" : "missing",
              listStatus: "review_required"
            });
          }
        }
      });
    }

    console.log(`[apply] staged=${appliedCount} autoApproved=${autoApprovedCount}`);
  }

  const wroteFile = await writeOutput(outputPath, products);

  console.log(JSON.stringify({
    applied: apply,
    autoApproved: apply && autoApprove,
    aiCorrected: aiCorrectFacts,
    aiCorrectionFailures: aiCorrection.failed,
    aiCorrections: aiCorrection.corrected,
    brandName,
    products: products.length,
    stagedImports: apply ? products.length : 0,
    wroteFile
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
