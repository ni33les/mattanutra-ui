import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";
import {
  stageProductImport,
  type ProductImportFactInput
} from "@/lib/admin-products";
import { correctDraftProductFactsWithAi } from "@/lib/product-fact-correction";
import {
  normalizeProductFactName,
  normalizeProductKey
} from "@/lib/product-recommendations";

type ScrapedFact = Readonly<{
  amount: number | null;
  confidence: "high" | "low" | "moderate";
  name: string;
  rawAmount: string | null;
  unit: string | null;
}>;

type ScrapedProduct = Readonly<{
  availabilityStatus: "in_stock" | "unknown";
  benefits: string | null;
  canonicalUrl: string;
  categories: string[];
  caution: string | null;
  description: string | null;
  dosage: string | null;
  facts: ScrapedFact[];
  imageUrl: string | null;
  otherIngredients: string | null;
  priceAmount: number | null;
  productId: string;
  productUrl: string;
  rawServingSize: string | null;
  sku: string | null;
  title: string;
}>;

type ProductLink = {
  categories: Set<string>;
  url: string;
};

type ImportSummary = {
  applied: boolean;
  aiCorrectionFailures: number;
  aiCorrections: number;
  aiCorrected: boolean;
  categoryUrls: number;
  discoveredProducts: number;
  importedOrUpdated: number;
  parsedProducts: number;
  sample: ScrapedProduct[];
  wroteFile: string | null;
};

const BASE_URL = "https://levitaminsasia.com";
const SITEMAP_URL = `${BASE_URL}/LEVitaminsAsia-com-sitemap.xml`;
const SOURCE = "le_vitamins_asia";
const BRAND_NAME = "Life Extension";
const DEFAULT_DELAY_MS = 500;
const DEFAULT_LIMIT = 50;

const NON_CATEGORY_PATHS = new Set([
  "/about-us",
  "/blog",
  "/cancel-order",
  "/cart",
  "/checkout",
  "/contact",
  "/custom",
  "/finalize-order",
  "/forgot-password",
  "/health-basics",
  "/home",
  "/login",
  "/register-login",
  "/save-cart",
  "/science-research",
  "/thank-you",
  "/top-products",
  "/wholesale",
  "/wholesale-profile"
]);

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent":
        "MattaNutraBot/1.0 (+https://mattanutra.com; product catalogue importer)"
    }
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
}

function decodeHtml(value: string) {
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

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|li|td|tr|div|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).replace(/\s+/g, " ").trim();

  return text ? decodeHtml(text).slice(0, max) : null;
}

function absoluteUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return null;
  }
}

function firstMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1] ?? null;
}

function allMatches(html: string, pattern: RegExp) {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function productTitle(html: string) {
  return cleanText(
    stripTags(
      firstMatch(
        html,
        /<h5[^>]*class=["'][^"']*productTitle[^"']*["'][^>]*>([\s\S]*?)<\/h5>/i
      ) ??
      firstMatch(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ??
      firstMatch(html, /<title>([\s\S]*?)<\/title>/i) ??
      ""
    ),
    500
  );
}

function pageCanonicalUrl(html: string, fallback: string) {
  return absoluteUrl(
    firstMatch(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
  ) ?? fallback;
}

function pageImageUrl(html: string) {
  const mainImage =
    firstMatch(
      html,
      /<a[^>]*class=["'][^"']*mainImg[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i
    ) ??
    firstMatch(html, /background-image:\s*url\(([^)]+)\)/i) ??
    firstMatch(html, /background:\s*url\(([^)]+)\)/i) ??
    firstMatch(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

  return absoluteUrl(mainImage?.replace(/^["']|["']$/g, "") ?? null);
}

function pagePrice(html: string) {
  const hiddenPrice = firstMatch(
    html,
    /<input[^>]+id=["']productPrice["'][^>]+value=["']([^"']+)["']/i
  );
  const textPrice = firstMatch(
    html,
    /<span[^>]*class=["'][^"']*productPrice[^"']*["'][^>]*>\s*\$?\s*([0-9.,]+)/i
  );
  const parsed = Number(String(hiddenPrice ?? textPrice ?? "").replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function pageSku(html: string) {
  const block = firstMatch(
    html,
    /<div[^>]*class=["'][^"']*proDet_sku[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  if (!block) {
    return null;
  }

  return cleanText(stripTags(block).replace(/^SKU:\s*/i, ""), 120);
}

function tabText(html: string, tabId: number) {
  const block = firstMatch(
    html,
    new RegExp(
      `<div[^>]*id=["']tabs-${tabId}["'][^>]*>([\\s\\S]*?)<\\/div>\\s*(?:<div[^>]*class=["'][^"']*tab-pane|<\\/div>\\s*<div[^>]*class=["'][^"']*border)`,
      "i"
    )
  );

  return block ? cleanText(stripTags(block), 4000) : null;
}

function labelTableSection(html: string, title: string) {
  const block = firstMatch(
    html,
    new RegExp(
      `<td[^>]*class=["'][^"']*wwwProdLDTitleSections[^"']*["'][^>]*>\\s*${title}\\s*<\\/td>\\s*<\\/tr>\\s*<tr>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
      "i"
    )
  );

  return block ? cleanText(stripTags(block), 2000) : null;
}

function supplementFactsTable(html: string) {
  return firstMatch(
    html,
    /<table[^>]*class=["'][^"']*wwwProdLDTableIngredients[^"']*["'][^>]*>([\s\S]*?)<\/table>/i
  );
}

function parseAmount(value: string | null) {
  if (!value) {
    return {
      amount: null,
      rawAmount: null,
      unit: null
    };
  }

  const match = value.match(/([0-9]+(?:[,.][0-9]+)?)\s*(mcg|µg|ug|mg|g|iu)\b/i);

  if (!match) {
    return {
      amount: null,
      rawAmount: cleanText(value, 120),
      unit: null
    };
  }

  return {
    amount: Number(match[1].replace(/,/g, "")),
    rawAmount: cleanText(match[0], 120),
    unit: match[2].toLowerCase().replace("µg", "mcg").replace("ug", "mcg")
  };
}

function cleanIngredientName(value: string) {
  const stripped = stripTags(value)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\(?\s*provid(?:ing|es)?\b[\s\S]*$/i, " ")
    .replace(/\([^)]+%\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");

  return normalizeProductFactName(stripped) || stripped;
}

function providedFacts(ingredientText: string) {
  const text = stripTags(ingredientText);
  const facts: ScrapedFact[] = [];
  const pattern =
    /provid(?:ing|es)?\s+([0-9]+(?:[,.][0-9]+)?)\s*(mcg|µg|ug|mg|g|iu)\s+([^,\]\);.]+)/gi;

  for (const match of text.matchAll(pattern)) {
    const name = cleanText(
      normalizeProductFactName(
        match[3]
          .replace(/\s*\[[\s\S]*$/g, " ")
          .replace(/\s*\([\s\S]*$/g, " ")
      ),
      200
    );
    const amount = Number(match[1].replace(/,/g, ""));

    if (!name || !Number.isFinite(amount)) {
      continue;
    }

    facts.push({
      amount,
      confidence: "moderate",
      name,
      rawAmount: `${match[1]} ${match[2]}`,
      unit: match[2].toLowerCase().replace("µg", "mcg").replace("ug", "mcg")
    });
  }

  return facts;
}

function parseFacts(html: string) {
  const table = supplementFactsTable(html);

  if (!table) {
    return {
      facts: [],
      otherIngredients: null,
      servingSize: null
    };
  }

  const servingSize = cleanText(
    firstMatch(table, /Serving Size\s*([^<]+)/i),
    300
  );
  const otherIngredients = cleanText(
    stripTags(
      firstMatch(
        table,
        /<td[^>]*class=["'][^"']*wwwProdLDCellOtherIngredients[^"']*["'][^>]*>([\s\S]*?)<\/td>/i
      ) ?? ""
    ),
    1000
  );
  const facts: ScrapedFact[] = [];

  for (const match of table.matchAll(
    /<tr>\s*<td[^>]*class=["'][^"']*wwwProdLDCellIngredientA[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["'][^"']*wwwProdLDCellIngredientA[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi
  )) {
    const name = cleanIngredientName(match[1]);
    const amount = parseAmount(stripTags(match[2]));

    if (name) {
      facts.push({
        amount: amount.amount,
        confidence: amount.amount ? "moderate" : "low",
        name,
        rawAmount: amount.rawAmount,
        unit: amount.unit
      });
    }

    facts.push(...providedFacts(match[1]));
  }

  return {
    facts: dedupeFacts(facts),
    otherIngredients,
    servingSize
  };
}

function dedupeFacts(facts: readonly ScrapedFact[]) {
  const byKey = new Map<string, ScrapedFact>();

  for (const fact of facts) {
    const key = `${normalizeProductKey(fact.name)}:${fact.amount ?? ""}:${fact.unit ?? ""}`;

    if (!byKey.has(key)) {
      byKey.set(key, fact);
    }
  }

  return [...byKey.values()];
}

function pageProductId(html: string, url: string) {
  return (
    firstMatch(html, /<input[^>]+name=["']pid["'][^>]+value=["']([^"']+)["']/i) ??
    url.match(/\/products\/(\d+)\//)?.[1] ??
    crypto.randomUUID()
  );
}

function parseProductPage(
  html: string,
  url: string,
  categories: readonly string[]
): ScrapedProduct | null {
  const title = productTitle(html);

  if (!title) {
    return null;
  }

  const facts = parseFacts(html);
  const availabilityStatus = /Add to Cart/i.test(html) ? "in_stock" : "unknown";

  return {
    availabilityStatus,
    benefits: tabText(html, 4),
    canonicalUrl: pageCanonicalUrl(html, url),
    categories: [...new Set(categories)].sort(),
    caution: tabText(html, 5) ?? labelTableSection(html, "Caution"),
    description: tabText(html, 1),
    dosage: tabText(html, 3) ?? labelTableSection(html, "Dosage and Use"),
    facts: facts.facts,
    imageUrl: pageImageUrl(html),
    otherIngredients: facts.otherIngredients,
    priceAmount: pagePrice(html),
    productId: pageProductId(html, url),
    productUrl: url,
    rawServingSize: facts.servingSize,
    sku: pageSku(html),
    title
  };
}

function categoryNameFromUrl(url: string) {
  const pathname = new URL(url).pathname.replace(/^\/|\/$/g, "");

  return pathname.replace(/-/g, " ");
}

function sitemapCategoryUrls(xml: string) {
  return allMatches(xml, /<loc>([^<]+)<\/loc>/gi)
    .map((url) => absoluteUrl(url))
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase().replace(/\/$/g, "");

      return (
        parsed.hostname.replace(/^www\./, "") === "levitaminsasia.com" &&
        !pathname.startsWith("/blog/") &&
        !pathname.startsWith("/products/") &&
        !NON_CATEGORY_PATHS.has(pathname)
      );
    });
}

function productLinksFromCategory(html: string, categoryUrl: string) {
  const category = categoryNameFromUrl(categoryUrl);
  const links = allMatches(html, /href=["']([^"']*\/products\/\d+\/[^"']+)["']/gi)
    .map((url) => absoluteUrl(url))
    .filter((url): url is string => Boolean(url));

  return [...new Set(links)].map((url) => ({ category, url }));
}

async function discoverProducts(
  categoryUrls: readonly string[],
  productLimit: number,
  delayMs: number
) {
  const products = new Map<string, ProductLink>();

  for (const categoryUrl of categoryUrls) {
    const html = await fetchText(categoryUrl);

    for (const link of productLinksFromCategory(html, categoryUrl)) {
      const existing = products.get(link.url);

      if (existing) {
        existing.categories.add(link.category);
      } else {
        products.set(link.url, {
          categories: new Set([link.category]),
          url: link.url
        });
      }

      if (products.size >= productLimit) {
        return [...products.values()];
      }
    }

    await sleep(delayMs);
  }

  return [...products.values()];
}

async function scrapeProducts(
  links: readonly ProductLink[],
  delayMs: number
) {
  const products: ScrapedProduct[] = [];

  for (const link of links) {
    const html = await fetchText(link.url);
    const product = parseProductPage(html, link.url, [...link.categories]);

    if (product) {
      products.push(product);
    }

    await sleep(delayMs);
  }

  return products;
}

function productFactsForAi(product: ScrapedProduct): ProductImportFactInput[] {
  return product.facts.map((fact) => ({
    amount: fact.amount,
    confidence: fact.confidence,
    itemType: "supplement",
    name: fact.name,
    unit: fact.unit
  }));
}

function aiCorrectedFactsForProduct(
  facts: readonly ProductImportFactInput[]
): ScrapedFact[] {
  return facts.map((fact) => ({
    amount: fact.amount ?? null,
    confidence: fact.confidence ?? "moderate",
    name: fact.name,
    rawAmount:
      fact.amount !== null && fact.amount !== undefined && fact.unit
        ? `${fact.amount} ${fact.unit}`
        : null,
    unit: fact.unit ?? null
  }));
}

async function correctProductWithAi(
  product: ScrapedProduct,
  index: number,
  total: number,
  failOpen: boolean
): Promise<{ corrected: boolean; failed: boolean; product: ScrapedProduct }> {
  console.log(`[ai] ${index}/${total} ${product.title}`);

  try {
    const correction = await correctDraftProductFactsWithAi({
      brandName: BRAND_NAME,
      currentFacts: productFactsForAi(product),
      description: product.description,
      descriptionEn: product.description,
      descriptionTh: null,
      productTitle: product.title,
      productTitleEn: product.title,
      productTitleTh: null,
      productUrl: product.canonicalUrl,
      sourceSnapshot: {
        benefits: product.benefits,
        categories: product.categories,
        caution: product.caution,
        description: product.description,
        dosage: product.dosage,
        language: "en",
        otherIngredients: product.otherIngredients,
        rawServingSize: product.rawServingSize,
        sku: product.sku
      }
    });

    return {
      corrected: true,
      failed: false,
      product: {
        ...product,
        facts: aiCorrectedFactsForProduct(correction.facts)
      }
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[ai] ${product.title} failed: ${message}`);

    if (!failOpen) {
      throw error;
    }

    return {
      corrected: false,
      failed: true,
      product
    };
  }
}

async function correctProductsWithAi(input: Readonly<{
  delayMs: number;
  failOpen: boolean;
  products: readonly ScrapedProduct[];
  startAt: number;
}>) {
  let corrected = 0;
  let failed = 0;
  const products: ScrapedProduct[] = [];

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

    await sleep(input.delayMs);
  }

  return { corrected, failed, products };
}

async function writeOutput(
  outputPath: string | null,
  products: readonly ScrapedProduct[]
) {
  if (!outputPath) {
    return null;
  }

  const absolute = path.resolve(process.cwd(), outputPath);
  const temporary = `${absolute}.tmp`;

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await rename(temporary, absolute);

  return absolute;
}

async function applyProducts(products: readonly ScrapedProduct[]) {
  let importedOrUpdated = 0;

  for (const product of products) {
    await stageProductImport({
      actor: SOURCE,
      brandName: BRAND_NAME,
      fdaApprovalNumber: null,
      imageUrls: product.imageUrl ? [product.imageUrl] : [],
      parsedFacts: productFactsForAi(product),
      parseConfidence: product.facts.length > 0 ? "moderate" : "low",
      productTitle: product.title,
      rawSnapshot: {
        availabilityStatus: product.availabilityStatus,
        benefits: product.benefits,
        categories: product.categories,
        caution: product.caution,
        description: product.description,
        dosage: product.dosage,
        otherIngredients: product.otherIngredients,
        priceAmount: product.priceAmount,
        rawServingSize: product.rawServingSize,
        sku: product.sku
      },
      source: SOURCE,
      sourceUrl: product.canonicalUrl
    });
    importedOrUpdated += 1;
  }

  const sql = getSql();

  await sql?.end({ timeout: 5 });

  return importedOrUpdated;
}

async function productLinksFromArgs() {
  const urls = argValue("product-urls");

  if (!urls) {
    return null;
  }

  return urls
    .split(",")
    .map((url) => absoluteUrl(url.trim()))
    .filter((url): url is string => Boolean(url))
    .map((url) => ({
      categories: new Set(["manual"]),
      url
    }));
}

async function main() {
  const apply = hasArg("apply");
  const delayMs = positiveInt(argValue("delay-ms"), DEFAULT_DELAY_MS);
  const limit = positiveInt(argValue("limit"), DEFAULT_LIMIT);
  const categoryLimit = positiveInt(argValue("category-limit"), 999);
  const outputPath = argValue("out");
  const aiCorrectFacts = hasArg("ai-correct-facts");
  const aiCorrectionStrict = hasArg("ai-correction-strict");
  const aiCorrectionDelayMs = positiveInt(
    argValue("ai-correction-delay-ms"),
    Math.max(delayMs, 750)
  );
  const aiStartAt = positiveInt(argValue("ai-start-at"), 1);
  const manualLinks = await productLinksFromArgs();
  const sitemapXml = manualLinks ? "" : await fetchText(SITEMAP_URL);
  const categoryUrls = manualLinks
    ? []
    : sitemapCategoryUrls(sitemapXml).slice(0, categoryLimit);
  const links = manualLinks ?? await discoverProducts(categoryUrls, limit, delayMs);
  const scrapedProducts = await scrapeProducts(links.slice(0, limit), delayMs);
  const aiCorrection = aiCorrectFacts
    ? await correctProductsWithAi({
      delayMs: aiCorrectionDelayMs,
      failOpen: !aiCorrectionStrict,
      products: scrapedProducts,
      startAt: aiStartAt
    })
    : { corrected: 0, failed: 0, products: scrapedProducts };
  const products = aiCorrection.products;
  const wroteFile = await writeOutput(outputPath, products);
  const importedOrUpdated = apply ? await applyProducts(products) : 0;
  const summary: ImportSummary = {
    applied: apply,
    aiCorrectionFailures: aiCorrection.failed,
    aiCorrections: aiCorrection.corrected,
    aiCorrected: aiCorrectFacts,
    categoryUrls: categoryUrls.length,
    discoveredProducts: links.length,
    importedOrUpdated,
    parsedProducts: products.length,
    sample: products.slice(0, 5),
    wroteFile
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
