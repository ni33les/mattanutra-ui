import { createHmac, createHash } from "node:crypto";
import type { ProductPlatform } from "@/lib/product-recommendations";

export type MarketplaceRegion = "TH";

export type ProductSnapshot = Readonly<{
  availabilityStatus: "in_stock" | "out_of_stock" | "unavailable" | "unknown";
  brandName?: string | null;
  currency: "THB";
  imageUrl?: string | null;
  externalProductId?: string | null;
  platform: ProductPlatform;
  priceAmount?: number | null;
  productUrl: string;
  region: MarketplaceRegion;
  title: string;
}>;

export type MarketplaceSearchDiagnostic = Readonly<{
  configured: boolean;
  error?: string;
  platform: ProductPlatform;
  query: string;
  resultCount: number;
  source: "affiliate_api" | "official_api" | "scrape_fallback" | "unconfigured";
}>;

export type MarketplaceProductSearchInput = Readonly<{
  limit?: number;
  query: string;
  region?: MarketplaceRegion;
}>;

export type MarketplaceProductRefreshInput = Readonly<{
  externalProductId?: string | null;
  productUrl: string;
  region?: MarketplaceRegion;
}>;

export interface MarketplaceAdapter {
  readonly platform: ProductPlatform;
  readonly source: MarketplaceSearchDiagnostic["source"];
  isConfigured(): boolean;
  refreshProduct(
    input: MarketplaceProductRefreshInput
  ): Promise<ProductSnapshot | null>;
  searchProducts(
    input: MarketplaceProductSearchInput
  ): Promise<ProductSnapshot[]>;
}

class UnconfiguredOfficialAdapter implements MarketplaceAdapter {
  readonly source = "unconfigured" as const;
  readonly platform: ProductPlatform;

  constructor(platform: ProductPlatform) {
    this.platform = platform;
  }

  isConfigured() {
    return false;
  }

  async refreshProduct() {
    return null;
  }

  async searchProducts() {
    return [];
  }
}

function configured(name: string) {
  return process.env[name]?.trim() || "";
}

function textFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const parsed = Number(record[key]);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstNestedArray(value: unknown): Record<string, unknown>[] {
  const root = nestedRecord(value);
  const queue: unknown[] = [root];

  while (queue.length > 0) {
    const current = queue.shift();

    if (Array.isArray(current)) {
      const rows = recordArray(current);

      if (rows.length > 0) {
        return rows;
      }
    }

    if (current && typeof current === "object") {
      queue.push(...Object.values(current));
    }
  }

  return [];
}

function normalizeUrl(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value.replace(/^\/+/, "")}`;
}

function shopeeEndpoint(region: MarketplaceRegion) {
  return (
    configured("SHOPEE_AFFILIATE_ENDPOINT") ||
    (region === "TH"
      ? "https://open-api.affiliate.shopee.co.th/graphql"
      : "https://open-api.affiliate.shopee.co.th/graphql")
  );
}

class ShopeeAffiliateAdapter implements MarketplaceAdapter {
  readonly platform = "shopee" as const;
  readonly source = "affiliate_api" as const;

  isConfigured() {
    return Boolean(
      configured("SHOPEE_AFFILIATE_APP_ID") &&
        configured("SHOPEE_AFFILIATE_APP_SECRET")
    );
  }

  async refreshProduct(input: MarketplaceProductRefreshInput) {
    return {
      availabilityStatus: "unknown",
      currency: "THB",
      externalProductId: input.externalProductId ?? null,
      platform: this.platform,
      productUrl: input.productUrl,
      region: input.region ?? "TH",
      title: input.productUrl
    } satisfies ProductSnapshot;
  }

  async searchProducts(input: MarketplaceProductSearchInput) {
    const appId = configured("SHOPEE_AFFILIATE_APP_ID");
    const secret = configured("SHOPEE_AFFILIATE_APP_SECRET");
    const region = input.region ?? "TH";

    if (!appId || !secret) {
      return [];
    }

    const query = `
      query MattaNutraProductOffers($keyword: String, $limit: Int) {
        productOfferV2(keyword: $keyword, limit: $limit) {
          nodes {
            itemId
            shopId
            productName
            productLink
            offerLink
            imageUrl
            price
            minPrice
            maxPrice
          }
        }
      }
    `;
    const body = JSON.stringify({
      query,
      variables: {
        keyword: input.query,
        limit: Math.max(1, Math.min(50, input.limit ?? 20))
      }
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHash("sha256")
      .update(`${appId}${timestamp}${body}${secret}`)
      .digest("hex");
    const response = await fetch(shopeeEndpoint(region), {
      body,
      headers: {
        Authorization: `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Shopee affiliate search failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = firstNestedArray(payload);

    return rows.slice(0, input.limit ?? 20).flatMap((row) => {
      const title = textFromRecord(row, [
        "productName",
        "product_name",
        "name",
        "title"
      ]);
      const productUrl = normalizeUrl(
        textFromRecord(row, ["offerLink", "offer_link", "productLink", "product_link"]),
        "https://shopee.co.th"
      );

      if (!title || !productUrl) {
        return [];
      }

      const itemId = textFromRecord(row, ["itemId", "item_id", "id"]);
      const shopId = textFromRecord(row, ["shopId", "shop_id"]);
      const price = numberFromRecord(row, ["price", "minPrice", "min_price"]);

      return [{
        availabilityStatus: "unknown",
        currency: "THB",
        imageUrl: textFromRecord(row, ["imageUrl", "image_url", "image"]),
        externalProductId: shopId && itemId ? `${shopId}:${itemId}` : itemId,
        platform: this.platform,
        priceAmount: price,
        productUrl,
        region,
        title
      } satisfies ProductSnapshot];
    });
  }
}

function lazadaSellerEndpoint(region: MarketplaceRegion) {
  return (
    configured("LAZADA_SELLER_CENTER_ENDPOINT") ||
    (region === "TH"
      ? "https://api.sellercenter.lazada.co.th"
      : "https://api.sellercenter.lazada.co.th")
  );
}

function lazadaSellerSignature(params: URLSearchParams, apiKey: string) {
  const signed = [...params.entries()]
    .filter(([key]) => key !== "Signature")
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}${value}`)
    .join("");

  return createHmac("sha256", apiKey).update(signed).digest("hex").toUpperCase();
}

class LazadaSellerCenterAdapter implements MarketplaceAdapter {
  readonly platform = "lazada" as const;
  readonly source = "official_api" as const;

  isConfigured() {
    return Boolean(
      configured("LAZADA_SELLER_USER_ID") &&
        configured("LAZADA_SELLER_API_KEY")
    );
  }

  async refreshProduct(input: MarketplaceProductRefreshInput) {
    return {
      availabilityStatus: "unknown",
      currency: "THB",
      externalProductId: input.externalProductId ?? null,
      platform: this.platform,
      productUrl: input.productUrl,
      region: input.region ?? "TH",
      title: input.productUrl
    } satisfies ProductSnapshot;
  }

  async searchProducts(input: MarketplaceProductSearchInput) {
    const userId = configured("LAZADA_SELLER_USER_ID");
    const apiKey = configured("LAZADA_SELLER_API_KEY");
    const region = input.region ?? "TH";

    if (!userId || !apiKey) {
      return [];
    }

    const params = new URLSearchParams({
      Action: "GetProducts",
      Format: "JSON",
      Limit: String(Math.max(1, Math.min(50, input.limit ?? 20))),
      Search: input.query,
      Timestamp: new Date().toISOString(),
      UserID: userId,
      Version: "1.0"
    });
    params.set("Signature", lazadaSellerSignature(params, apiKey));
    const response = await fetch(`${lazadaSellerEndpoint(region)}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Lazada Seller Center search failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = firstNestedArray(payload);

    return rows.slice(0, input.limit ?? 20).flatMap((row) => {
      const title = textFromRecord(row, ["Name", "name", "ProductName", "title"]);
      const sellerSku = textFromRecord(row, ["SellerSku", "seller_sku", "Sku", "sku"]);
      const url = textFromRecord(row, ["Url", "url", "ProductUrl", "product_url"]);

      if (!title) {
        return [];
      }

      return [{
        availabilityStatus: "unknown",
        brandName: textFromRecord(row, ["Brand", "brand"]),
        currency: "THB",
        imageUrl: textFromRecord(row, ["MainImage", "main_image", "image"]),
        externalProductId: sellerSku,
        platform: this.platform,
        priceAmount: numberFromRecord(row, ["Price", "price", "SalePrice"]),
        productUrl: normalizeUrl(url, `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(title)}`),
        region,
        title
      } satisfies ProductSnapshot];
    });
  }
}

class ShopeeSearchScrapeAdapter implements MarketplaceAdapter {
  readonly platform = "shopee" as const;
  readonly source = "scrape_fallback" as const;

  isConfigured() {
    return configured("MARKETPLACE_SCRAPE_FALLBACK") === "enabled";
  }

  async refreshProduct(input: MarketplaceProductRefreshInput) {
    return {
      availabilityStatus: "unknown",
      currency: "THB",
      externalProductId: input.externalProductId ?? null,
      platform: this.platform,
      productUrl: input.productUrl,
      region: input.region ?? "TH",
      title: input.productUrl
    } satisfies ProductSnapshot;
  }

  async searchProducts(input: MarketplaceProductSearchInput) {
    if (!this.isConfigured()) {
      return [];
    }

    const region = input.region ?? "TH";
    const url = new URL("https://shopee.co.th/api/v4/search/search_items");
    url.searchParams.set("by", "relevancy");
    url.searchParams.set("keyword", input.query);
    url.searchParams.set("limit", String(Math.max(1, Math.min(50, input.limit ?? 20))));
    url.searchParams.set("newest", "0");
    url.searchParams.set("order", "desc");
    url.searchParams.set("page_type", "search");
    url.searchParams.set("scenario", "PAGE_GLOBAL_SEARCH");
    url.searchParams.set("version", "2");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: `https://shopee.co.th/search?keyword=${encodeURIComponent(input.query)}`,
        "User-Agent": "MattaNutra product discovery/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Shopee scrape fallback failed with ${response.status}`);
    }

    const payload = await response.json();
    const items = recordArray(nestedRecord(payload).items);

    return items.flatMap((item) => {
      const basic = nestedRecord(item.item_basic ?? item);
      const title = textFromRecord(basic, ["name", "title"]);
      const itemId = textFromRecord(basic, ["itemid", "item_id"]);
      const shopId = textFromRecord(basic, ["shopid", "shop_id"]);

      if (!title || !itemId || !shopId) {
        return [];
      }

      const price = numberFromRecord(basic, ["price", "price_min"]);
      const normalizedPrice = price ? price / 100_000 : null;

      return [{
        availabilityStatus: "unknown",
        brandName: textFromRecord(basic, ["brand"]),
        currency: "THB",
        imageUrl: textFromRecord(basic, ["image"])
          ? `https://cf.shopee.co.th/file/${textFromRecord(basic, ["image"])}`
          : null,
        externalProductId: `${shopId}:${itemId}`,
        platform: this.platform,
        priceAmount: normalizedPrice,
        productUrl: `https://shopee.co.th/product/${shopId}/${itemId}`,
        region,
        title
      } satisfies ProductSnapshot];
    });
  }
}

export async function searchMarketplaceProducts(input: MarketplaceProductSearchInput) {
  const adapters = [
    marketplaceAdapters.shopee,
    marketplaceAdapters.lazada,
    ...(configured("MARKETPLACE_SCRAPE_FALLBACK") === "enabled"
      ? [new ShopeeSearchScrapeAdapter()]
      : [])
  ];
  const diagnostics: MarketplaceSearchDiagnostic[] = [];
  const products: ProductSnapshot[] = [];

  for (const adapter of adapters) {
    const configuredAdapter = adapter.isConfigured();

    if (!configuredAdapter) {
      diagnostics.push({
        configured: false,
        platform: adapter.platform,
        query: input.query,
        resultCount: 0,
        source: adapter.source
      });
      continue;
    }

    try {
      const results = await adapter.searchProducts(input);
      products.push(...results);
      diagnostics.push({
        configured: true,
        platform: adapter.platform,
        query: input.query,
        resultCount: results.length,
        source: adapter.source
      });
    } catch (error) {
      diagnostics.push({
        configured: true,
        error: error instanceof Error ? error.message : "Unknown marketplace error",
        platform: adapter.platform,
        query: input.query,
        resultCount: 0,
        source: adapter.source
      });
    }
  }

  return { diagnostics, products };
}

export const marketplaceAdapters: Record<"lazada" | "shopee", MarketplaceAdapter> = {
  lazada: configured("LAZADA_SELLER_USER_ID") && configured("LAZADA_SELLER_API_KEY")
    ? new LazadaSellerCenterAdapter()
    : new UnconfiguredOfficialAdapter("lazada"),
  shopee: configured("SHOPEE_AFFILIATE_APP_ID") && configured("SHOPEE_AFFILIATE_APP_SECRET")
    ? new ShopeeAffiliateAdapter()
    : new UnconfiguredOfficialAdapter("shopee")
};
