import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const REQUEST_TIMEOUT_MS = 20_000;

const execFileAsync = promisify(execFile);

export const INITIAL_BRANDS = new Set([
  "blackmores",
  "centrum",
  "dhc",
  "mega we care",
  "nature made",
  "swisse",
  "vistra"
]);

export const BRAND_PRODUCT_PRESETS: Record<string, string[]> = {
  blackmores: [
    "https://www.blackmores.co.th/en/products/supplement/2099-blackmores-multivitamin-active",
    "https://www.blackmores.co.th/en/products/supplement/2096-blackmores-multivitamin-nutri-50-dietary-suppleme",
    "https://www.blackmores.co.th/en/products/supplement/2115-blackmores-koala-multivitamin-mineral",
    "https://www.blackmores.co.th/en/products/supplement/2118-blackmores-bio-zinc-a-chelate",
    "https://www.blackmores.co.th/en/products/supplement/2122-blackmores-bio-calciumd3"
  ]
};

export const BRAND_DISCOVERY_PAGES: Record<string, string[]> = {
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

export function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

export function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

export function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export async function delay(ms: number) {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function concurrentMapOrdered<T, R>(
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

export function isRetryableNetworkError(error: unknown) {
  const message = error instanceof Error
    ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}`
    : String(error);

  return /fetch failed|CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|aborted/i.test(message);
}

export function normalizeBrand(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function languageFromUrl(url: string) {
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

export function languageFromHtml(html: string) {
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

export function manufacturerHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9,th;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
}

export async function fetchWithCurl(url: string, accept: string) {
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

export async function fetchHtml(url: string) {
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

export async function fetchJson(url: string) {
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

export function productUrlsFromListingHtml(html: string, listingUrl: string) {
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

export function normalizedUrlWithoutHash(input: string, baseUrl: URL) {
  const url = new URL(input, baseUrl);
  url.hash = "";

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function parseNextData(html: string) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function findHitArrays(value: unknown, output: unknown[][] = []) {
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

export function productUrlsFromBlackmoresAuNextData(html: string, listingUrl: string) {
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

export function findProductRecordWithVariants(
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
