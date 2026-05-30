import {
  argValue,
  fetchHtml,
  fetchJson,
  isRecord,
  positiveInt,
  productUrlsFromListingHtml
} from "./manufacturer-scrape-core.ts";
import { extractDhcProductId } from "@/lib/dhc-import";

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function megaWeCareProductRecordsFromApi() {
  const endpoint = "https://www.megawecare.co.th/wp-json/wp/v2/product?product_cat=177&per_page=100&_embed=1";
  const payload = await fetchJson(endpoint);

  return Array.isArray(payload)
    ? payload.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

export async function megaWeCareProductUrlsFromApi() {
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

export async function swisseProductUrlsFromCollections() {
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

export function canonicalSwisseProductUrl(value: string) {
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

export function canonicalVistraProductUrl(value: string) {
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

export function canonicalDhcProductUrl(
  value: string,
  base = "https://www.dhc.co.jp"
) {
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

export function dhcProductUrlsFromHtml(html: string, listingUrl: string) {
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

export async function dhcProductUrlsFromHealthSupplements() {
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

export async function vistraProductUrlsFromHealthWellness() {
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
