import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { closeSqlPool, getSql } from "@/lib/db";
import {
  imageUrlHost,
  isFirstPartyImageUrl,
  normalizeRuntimeImageUrl
} from "@/lib/first-party-image-rules";

export type ProductImageHealthEnvironment = "dev" | "uat" | "prd";

export type ProductImageHealthState =
  | "healthy"
  | "missing_image_url"
  | "invalid_image_url"
  | "local_asset"
  | "broken_image_url"
  | "non_image_response";

export type ProductImageHealthProduct = Readonly<{
  activeRetailerNames: readonly string[];
  activeRetailerSlugs: readonly string[];
  brandName: string | null;
  externalProductId: string | null;
  id: string;
  imageUrl: string | null;
  status: string;
  title: string;
}>;

export type ProductImageHealthRow = ProductImageHealthProduct & Readonly<{
  contentType: string | null;
  detail: string | null;
  firstParty: boolean;
  host: string | null;
  httpStatus: number | null;
  normalizedImageUrl: string | null;
  state: ProductImageHealthState;
}>;

export type ProductImageHealthRetailerCounts = {
  activeProducts: number;
  brokenImageUrl: number;
  externalUrl: number;
  invalidImageUrl: number;
  missingImageUrl: number;
  nonImageResponse: number;
};

export type ProductImageHealthStatusCounts = {
  brokenImageUrl: number;
  externalUrl: number;
  firstPartyUrl: number;
  healthy: number;
  invalidImageUrl: number;
  localAsset: number;
  missingImageUrl: number;
  nonImageResponse: number;
  products: number;
};

export type ProductImageHealthReport = Readonly<{
  byRetailer: Record<string, ProductImageHealthRetailerCounts>;
  byStatus: Record<string, ProductImageHealthStatusCounts>;
  counts: {
    activeRetailBrokenProducts: number;
    activeRetailExternalUrlProducts: number;
    activeRetailInvalidProducts: number;
    activeRetailMissingOrBrokenProducts: number;
    activeRetailMissingProducts: number;
    activeRetailNonImageProducts: number;
    activeRetailProducts: number;
    brokenImageUrls: number;
    externalImageUrls: number;
    firstPartyImageUrls: number;
    healthyImageUrls: number;
    invalidImageUrls: number;
    localAssetUrls: number;
    missingImageUrls: number;
    nonImageResponses: number;
    totalProducts: number;
  };
  environment: ProductImageHealthEnvironment;
  generatedAt: string;
  rows: ProductImageHealthRow[];
  targetRetailOrgSlugs: string[];
}>;

export type RunProductImageHealthAuditInput = Readonly<{
  concurrency?: number;
  csvOutputPath?: string | null;
  environment: ProductImageHealthEnvironment;
  fetcher?: typeof fetch;
  outputPath?: string | null;
  targetRetailOrgSlugs?: readonly string[];
  timeoutMs?: number;
}>;

const DEFAULT_TARGET_RETAIL_ORG_SLUGS = [
  "delight-pharmacy",
  "enchanted-pharmacy"
] as const;

const IMAGE_ACCEPT_HEADER =
  "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1";
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|jpe?g|png|webp)(?:\?|#|$)/i;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).replace(/\s+/g, " ").trim();

  return text ? text.slice(0, max) : null;
}

function uniqueTextValues(values: readonly unknown[]) {
  return [...new Set(values.flatMap((value) => {
    const text = cleanText(value, 500);

    return text ? [text] : [];
  }))];
}

function emptyStatusCounts(): ProductImageHealthStatusCounts {
  return {
    brokenImageUrl: 0,
    externalUrl: 0,
    firstPartyUrl: 0,
    healthy: 0,
    invalidImageUrl: 0,
    localAsset: 0,
    missingImageUrl: 0,
    nonImageResponse: 0,
    products: 0
  };
}

function emptyRetailerCounts(): ProductImageHealthRetailerCounts {
  return {
    activeProducts: 0,
    brokenImageUrl: 0,
    externalUrl: 0,
    invalidImageUrl: 0,
    missingImageUrl: 0,
    nonImageResponse: 0
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function rowHasMissingOrBrokenActiveRetailImage(row: ProductImageHealthRow) {
  return (
    row.activeRetailerSlugs.length > 0 &&
    (
      row.state === "missing_image_url" ||
      row.state === "invalid_image_url" ||
      row.state === "broken_image_url" ||
      row.state === "non_image_response"
    )
  );
}

async function probeImageUrl(input: Readonly<{
  fetcher: typeof fetch;
  imageUrl: string | null;
  timeoutMs: number;
}>) {
  const raw = cleanText(input.imageUrl, 3000);

  if (!raw) {
    return {
      contentType: null,
      detail: null,
      firstParty: false,
      host: null,
      httpStatus: null,
      normalizedImageUrl: null,
      state: "missing_image_url" as const
    };
  }

  const normalized = normalizeRuntimeImageUrl(raw);

  if (!normalized) {
    return {
      contentType: null,
      detail: "URL is not HTTPS, HTTP, or a local runtime path.",
      firstParty: false,
      host: null,
      httpStatus: null,
      normalizedImageUrl: null,
      state: "invalid_image_url" as const
    };
  }

  const firstParty = isFirstPartyImageUrl(normalized);
  const host = imageUrlHost(normalized);

  if (normalized.startsWith("/")) {
    return {
      contentType: null,
      detail: "Local runtime asset path was not probed.",
      firstParty,
      host,
      httpStatus: null,
      normalizedImageUrl: normalized,
      state: "local_asset" as const
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetcher(normalized, {
      headers: {
        Accept: IMAGE_ACCEPT_HEADER,
        Range: "bytes=0-0",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      method: "GET",
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";

    await response.body?.cancel().catch(() => undefined);

    if (!response.ok) {
      return {
        contentType,
        detail: response.statusText || "HTTP request failed.",
        firstParty,
        host,
        httpStatus: response.status,
        normalizedImageUrl: normalized,
        state: "broken_image_url" as const
      };
    }

    if (contentType.toLowerCase().startsWith("image/") || IMAGE_EXTENSION_PATTERN.test(normalized)) {
      return {
        contentType,
        detail: null,
        firstParty,
        host,
        httpStatus: response.status,
        normalizedImageUrl: normalized,
        state: "healthy" as const
      };
    }

    return {
      contentType,
      detail: "URL responded successfully but did not return image content.",
      firstParty,
      host,
      httpStatus: response.status,
      normalizedImageUrl: normalized,
      state: "non_image_response" as const
    };
  } catch (error) {
    return {
      contentType: null,
      detail: error instanceof Error ? error.message : String(error),
      firstParty,
      host,
      httpStatus: null,
      normalizedImageUrl: normalized,
      state: "broken_image_url" as const
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;

      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(values.length || 1, concurrency)) },
      () => worker()
    )
  );

  return results;
}

export async function buildProductImageHealthReport(input: Readonly<{
  environment: ProductImageHealthEnvironment;
  fetcher?: typeof fetch;
  generatedAt?: string;
  products: readonly ProductImageHealthProduct[];
  targetRetailOrgSlugs: readonly string[];
  timeoutMs?: number;
  concurrency?: number;
}>): Promise<ProductImageHealthReport> {
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = Math.max(1000, Math.round(input.timeoutMs ?? 8000));
  const rows = await mapConcurrent(
    input.products,
    Math.max(1, Math.round(input.concurrency ?? 24)),
    async (product) => ({
      ...product,
      ...(await probeImageUrl({
        fetcher,
        imageUrl: product.imageUrl,
        timeoutMs
      }))
    })
  );
  const byStatus: Record<string, ProductImageHealthStatusCounts> = {};
  const byRetailer: Record<string, ProductImageHealthRetailerCounts> =
    Object.fromEntries(
      input.targetRetailOrgSlugs.map((slug) => [slug, emptyRetailerCounts()])
    );
  const activeRetailProductIds = new Set<string>();
  const activeRetailMissingIds = new Set<string>();
  const activeRetailInvalidIds = new Set<string>();
  const activeRetailBrokenIds = new Set<string>();
  const activeRetailNonImageIds = new Set<string>();
  const activeRetailExternalIds = new Set<string>();

  const counts: ProductImageHealthReport["counts"] = {
    activeRetailBrokenProducts: 0,
    activeRetailExternalUrlProducts: 0,
    activeRetailInvalidProducts: 0,
    activeRetailMissingOrBrokenProducts: 0,
    activeRetailMissingProducts: 0,
    activeRetailNonImageProducts: 0,
    activeRetailProducts: 0,
    brokenImageUrls: 0,
    externalImageUrls: 0,
    firstPartyImageUrls: 0,
    healthyImageUrls: 0,
    invalidImageUrls: 0,
    localAssetUrls: 0,
    missingImageUrls: 0,
    nonImageResponses: 0,
    totalProducts: rows.length
  };

  for (const row of rows) {
    const statusCounts = byStatus[row.status] ?? emptyStatusCounts();

    byStatus[row.status] = statusCounts;
    statusCounts.products += 1;

    if (row.activeRetailerSlugs.length > 0) {
      activeRetailProductIds.add(row.id);
    }

    if (row.firstParty && row.normalizedImageUrl) {
      counts.firstPartyImageUrls += 1;
      statusCounts.firstPartyUrl += 1;
    } else if (row.normalizedImageUrl?.startsWith("http")) {
      counts.externalImageUrls += 1;
      statusCounts.externalUrl += 1;

      if (row.activeRetailerSlugs.length > 0) {
        activeRetailExternalIds.add(row.id);
      }
    }

    if (row.state === "healthy") {
      counts.healthyImageUrls += 1;
      statusCounts.healthy += 1;
    } else if (row.state === "missing_image_url") {
      counts.missingImageUrls += 1;
      statusCounts.missingImageUrl += 1;

      if (row.activeRetailerSlugs.length > 0) {
        activeRetailMissingIds.add(row.id);
      }
    } else if (row.state === "invalid_image_url") {
      counts.invalidImageUrls += 1;
      statusCounts.invalidImageUrl += 1;

      if (row.activeRetailerSlugs.length > 0) {
        activeRetailInvalidIds.add(row.id);
      }
    } else if (row.state === "local_asset") {
      counts.localAssetUrls += 1;
      statusCounts.localAsset += 1;
    } else if (row.state === "broken_image_url") {
      counts.brokenImageUrls += 1;
      statusCounts.brokenImageUrl += 1;

      if (row.activeRetailerSlugs.length > 0) {
        activeRetailBrokenIds.add(row.id);
      }
    } else if (row.state === "non_image_response") {
      counts.nonImageResponses += 1;
      statusCounts.nonImageResponse += 1;

      if (row.activeRetailerSlugs.length > 0) {
        activeRetailNonImageIds.add(row.id);
      }
    }

    for (const slug of row.activeRetailerSlugs) {
      const retailerCounts = byRetailer[slug] ?? emptyRetailerCounts();

      byRetailer[slug] = retailerCounts;
      retailerCounts.activeProducts += 1;

      if (!row.firstParty && row.normalizedImageUrl?.startsWith("http")) {
        retailerCounts.externalUrl += 1;
      }

      if (row.state === "missing_image_url") {
        retailerCounts.missingImageUrl += 1;
      } else if (row.state === "invalid_image_url") {
        retailerCounts.invalidImageUrl += 1;
      } else if (row.state === "broken_image_url") {
        retailerCounts.brokenImageUrl += 1;
      } else if (row.state === "non_image_response") {
        retailerCounts.nonImageResponse += 1;
      }
    }
  }

  const activeRetailMissingOrBrokenIds = new Set([
    ...activeRetailMissingIds,
    ...activeRetailInvalidIds,
    ...activeRetailBrokenIds,
    ...activeRetailNonImageIds
  ]);

  counts.activeRetailProducts = activeRetailProductIds.size;
  counts.activeRetailMissingProducts = activeRetailMissingIds.size;
  counts.activeRetailInvalidProducts = activeRetailInvalidIds.size;
  counts.activeRetailBrokenProducts = activeRetailBrokenIds.size;
  counts.activeRetailNonImageProducts = activeRetailNonImageIds.size;
  counts.activeRetailMissingOrBrokenProducts = activeRetailMissingOrBrokenIds.size;
  counts.activeRetailExternalUrlProducts = activeRetailExternalIds.size;

  return {
    byRetailer,
    byStatus,
    counts,
    environment: input.environment,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rows,
    targetRetailOrgSlugs: [...input.targetRetailOrgSlugs]
  };
}

export function productImageHealthReportCsv(report: ProductImageHealthReport) {
  const header = [
    "state",
    "id",
    "external_product_id",
    "title",
    "product_status",
    "brand_name",
    "image_url",
    "normalized_image_url",
    "first_party",
    "host",
    "http_status",
    "content_type",
    "active_retailer_slugs",
    "active_retailer_names",
    "detail"
  ];
  const rows = report.rows.map((row) => [
    row.state,
    row.id,
    row.externalProductId ?? "",
    row.title,
    row.status,
    row.brandName ?? "",
    row.imageUrl ?? "",
    row.normalizedImageUrl ?? "",
    row.firstParty,
    row.host ?? "",
    row.httpStatus ?? "",
    row.contentType ?? "",
    row.activeRetailerSlugs.join("|"),
    row.activeRetailerNames.join("|"),
    row.detail ?? ""
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n") + "\n";
}

async function writeReports(
  report: ProductImageHealthReport,
  input: Pick<RunProductImageHealthAuditInput, "csvOutputPath" | "outputPath">
) {
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
    await writeFile(temporary, productImageHealthReportCsv(report), "utf8");
    await rename(temporary, absolute);
  }
}

async function loadProductImageHealthProducts(
  targetRetailOrgSlugs: readonly string[]
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{
    active_retailer_names: string[] | null;
    active_retailer_slugs: string[] | null;
    brand_name: string | null;
    external_product_id: string | null;
    id: string;
    image_url: string | null;
    status: string;
    title: string;
  }>>`
    select
      products.id::text,
      products.external_product_id,
      products.title,
      products.brand_name,
      products.status,
      products.image_url,
      coalesce(retail.active_retailer_slugs, array[]::text[]) as active_retailer_slugs,
      coalesce(retail.active_retailer_names, array[]::text[]) as active_retailer_names
    from public.products products
    left join lateral (
      select
        array_agg(distinct organisations.slug order by organisations.slug) as active_retailer_slugs,
        array_agg(distinct organisations.name order by organisations.name) as active_retailer_names
      from public.retail_sellable_products sellable
      join public.organisations organisations
        on organisations.id = sellable.organisation_id
      where sellable.product_id = products.id
        and sellable.status = 'active'
        and organisations.slug = any(${targetRetailOrgSlugs}::text[])
    ) retail on true
    order by
      cardinality(coalesce(retail.active_retailer_slugs, array[]::text[])) desc,
      products.status asc,
      products.brand_name asc nulls last,
      products.title asc
  `;

  return rows.map((row): ProductImageHealthProduct => ({
    activeRetailerNames: uniqueTextValues(row.active_retailer_names ?? []),
    activeRetailerSlugs: uniqueTextValues(row.active_retailer_slugs ?? []),
    brandName: cleanText(row.brand_name, 300),
    externalProductId: cleanText(row.external_product_id, 300),
    id: row.id,
    imageUrl: cleanText(row.image_url, 3000),
    status: row.status,
    title: row.title
  }));
}

export async function runProductImageHealthAudit(input: RunProductImageHealthAuditInput) {
  const targetRetailOrgSlugs =
    uniqueTextValues(input.targetRetailOrgSlugs ?? DEFAULT_TARGET_RETAIL_ORG_SLUGS);
  const products = await loadProductImageHealthProducts(targetRetailOrgSlugs);
  const report = await buildProductImageHealthReport({
    concurrency: input.concurrency,
    environment: input.environment,
    fetcher: input.fetcher,
    products,
    targetRetailOrgSlugs,
    timeoutMs: input.timeoutMs
  });

  await writeReports(report, input);
  await closeSqlPool();

  return report;
}

export function defaultProductImageHealthReportPaths(
  environment: ProductImageHealthEnvironment
) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stem = path.join("reports", `product-image-health-${environment}-${stamp}`);

  return {
    csvOutputPath: `${stem}.csv`,
    outputPath: `${stem}.json`
  };
}

export function productImageHealthAuditShouldFail(report: ProductImageHealthReport) {
  return (
    report.counts.activeRetailMissingOrBrokenProducts > 0 ||
    report.counts.activeRetailExternalUrlProducts > 0
  );
}

export function productImageHealthIssueRows(report: ProductImageHealthReport) {
  return report.rows.filter((row) => (
    rowHasMissingOrBrokenActiveRetailImage(row) ||
    (row.activeRetailerSlugs.length > 0 &&
      !row.firstParty &&
      row.normalizedImageUrl?.startsWith("http"))
  ));
}
