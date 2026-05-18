import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";
import { normalizeProductKey } from "@/lib/product-recommendations";

type ScrapedFact = Readonly<{
  amount: number | null;
  confidence: "low" | "moderate";
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

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";

    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
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
  return stripTags(value)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\(?\s*provid(?:ing|es)?\b[\s\S]*$/i, " ")
    .replace(/\([^)]+%\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
}

function matchingFactName(value: string) {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[®™]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providedFacts(ingredientText: string) {
  const text = stripTags(ingredientText);
  const facts: ScrapedFact[] = [];
  const pattern =
    /provid(?:ing|es)?\s+([0-9]+(?:[,.][0-9]+)?)\s*(mcg|µg|ug|mg|g|iu)\s+([^,\]\);.]+)/gi;

  for (const match of text.matchAll(pattern)) {
    const name = cleanText(
      match[3]
        .replace(/\s*\[[\s\S]*$/g, " ")
        .replace(/\s*\([\s\S]*$/g, " "),
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

async function supplementIdMap(
  sql: NonNullable<ReturnType<typeof getSql>>,
  facts: readonly ScrapedFact[]
) {
  const names = [...new Set(
    facts.map((fact) => normalizeProductKey(matchingFactName(fact.name)))
  )];

  if (names.length < 1) {
    return new Map<string, string>();
  }

  const rows = await sql<Array<{ id: string; normalized_alias: string }>>`
    select supplements.id::text, supplement_aliases.normalized_alias
    from public.supplement_aliases
    join public.supplements
      on supplements.id = supplement_aliases.supplement_id
    where supplement_aliases.normalized_alias = any(${names}::text[])
  `;

  return new Map(rows.map((row) => [row.normalized_alias, row.id]));
}

async function upsertBrand(sql: NonNullable<ReturnType<typeof getSql>>) {
  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_brands (
      name,
      normalized_name,
      list_status,
      created_at,
      updated_at
    )
    values (
      ${BRAND_NAME},
      ${normalizeProductKey(BRAND_NAME)},
      'unknown',
      now(),
      now()
    )
    on conflict (normalized_name) do update set
      name = excluded.name,
      updated_at = now()
    returning id::text
  `;

  return rows[0]?.id ?? null;
}

async function upsertProduct(
  sql: NonNullable<ReturnType<typeof getSql>>,
  product: ScrapedProduct,
  brandId: string | null
) {
  const normalized = normalizedUrl(product.canonicalUrl);
  const rows = await sql<Array<{ id: string; inserted: boolean }>>`
    insert into public.marketplace_products (
      platform,
      region,
      marketplace_product_id,
      title,
      normalized_title,
      brand_id,
      brand_name,
      normalized_brand_name,
      image_url,
      product_url,
      normalized_url,
      description,
      category,
      list_status,
      label_status,
      availability_status,
      affiliate_status,
      price_amount,
      currency,
      price_cached_at,
      availability_cached_at,
      product_data_expires_at,
      source,
      admin_notes,
      created_at,
      updated_at
    )
    values (
      'manual',
      'TH',
      ${product.productId},
      ${product.title},
      ${normalizeProductKey(product.title)},
      ${brandId}::uuid,
      ${BRAND_NAME},
      ${normalizeProductKey(BRAND_NAME)},
      ${product.imageUrl},
      ${product.canonicalUrl},
      ${normalized},
      ${product.description},
      ${product.categories.join(", ") || null},
      'unknown',
      ${product.facts.length > 0 ? "parsed" : "missing"},
      ${product.availabilityStatus},
      'none',
      ${product.priceAmount},
      'USD',
      now(),
      now(),
      now() + interval '24 hours',
      ${SOURCE},
      ${[
        "Imported from LE Vitamins Asia public product pages.",
        product.sku ? `SKU: ${product.sku}.` : null,
        product.rawServingSize ? `Serving size: ${product.rawServingSize}.` : null,
        product.dosage ? `Dosage: ${product.dosage}` : null,
        product.caution ? `Caution: ${product.caution}` : null,
        product.otherIngredients ? product.otherIngredients : null
      ].filter(Boolean).join("\n")},
      now(),
      now()
    )
    on conflict (normalized_url) do update set
      marketplace_product_id = excluded.marketplace_product_id,
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      image_url = coalesce(excluded.image_url, marketplace_products.image_url),
      description = coalesce(excluded.description, marketplace_products.description),
      category = coalesce(excluded.category, marketplace_products.category),
      label_status = excluded.label_status,
      availability_status = excluded.availability_status,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      price_cached_at = excluded.price_cached_at,
      availability_cached_at = excluded.availability_cached_at,
      product_data_expires_at = excluded.product_data_expires_at,
      source = case
        when marketplace_products.source = 'admin' then marketplace_products.source
        else excluded.source
      end,
      admin_notes = excluded.admin_notes,
      updated_at = now()
    returning id::text, (xmax = 0) as inserted
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Unable to upsert product ${product.title}`);
  }

  return row;
}

async function replaceFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  facts: readonly ScrapedFact[]
) {
  const supplementIds = await supplementIdMap(sql, facts);

  await sql`
    delete from public.product_facts
    where product_id = ${productId}::uuid
      and source = ${SOURCE}
  `;

  for (const fact of facts) {
    const normalizedName = normalizeProductKey(matchingFactName(fact.name));

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
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        'supplement',
        ${supplementIds.get(normalizedName) ?? null}::uuid,
        ${fact.name},
        ${normalizedName},
        ${fact.amount},
        ${fact.unit},
        ${fact.rawAmount},
        ${fact.confidence},
        ${SOURCE},
        now(),
        now()
      )
    `;
  }
}

async function applyProducts(products: readonly ScrapedProduct[]) {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is required when --apply is used");
  }

  const brandId = await upsertBrand(sql);
  let importedOrUpdated = 0;

  for (const product of products) {
    const row = await upsertProduct(sql, product, brandId);
    await replaceFacts(sql, row.id, product.facts);
    await sql`
      insert into public.product_admin_audit (
        product_id,
        actor,
        action,
        after_payload
      )
      values (
        ${row.id}::uuid,
        ${SOURCE},
        ${row.inserted ? "le_vitamins_asia_product_imported" : "le_vitamins_asia_product_refreshed"},
        ${sql.json({
          canonicalUrl: product.canonicalUrl,
          categories: product.categories,
          factCount: product.facts.length,
          priceAmount: product.priceAmount,
          sku: product.sku,
          title: product.title
        })}::jsonb
      )
    `;
    importedOrUpdated += 1;
  }

  await sql.end({ timeout: 5 });

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
  const manualLinks = await productLinksFromArgs();
  const sitemapXml = manualLinks ? "" : await fetchText(SITEMAP_URL);
  const categoryUrls = manualLinks
    ? []
    : sitemapCategoryUrls(sitemapXml).slice(0, categoryLimit);
  const links = manualLinks ?? await discoverProducts(categoryUrls, limit, delayMs);
  const products = await scrapeProducts(links.slice(0, limit), delayMs);
  const wroteFile = await writeOutput(outputPath, products);
  const importedOrUpdated = apply ? await applyProducts(products) : 0;
  const summary: ImportSummary = {
    applied: apply,
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
