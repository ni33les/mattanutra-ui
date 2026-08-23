import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { displayCountryName } from "@/lib/product-countries";

export { displayCountryName };

export const ACTIVE_MARKET_COUNTRY = "TH";
export const ACTIVE_MARKET_CURRENCY = "THB";
export const ACTIVE_MARKET_NAME = "Thailand";
export const ACTIVE_RETAILER_ID = "retailer_th_delight";
export const ACTIVE_RETAILER_NAME = "Thailand retailer";

export type DeliverableMarket = Readonly<{
  countryCode: string;
  countryName: string;
  currency: string;
}>;

export type MarketBinding = Readonly<{
  countryCode: string;
  countryName: string;
  currency: string;
  retailerAdapter: "mock_thailand" | "thailand_uat" | "thailand_live";
  retailerId: string;
  retailerName: string;
}>;

const FALLBACK_MARKETS: readonly DeliverableMarket[] = [
  {
    countryCode: ACTIVE_MARKET_COUNTRY,
    countryName: ACTIVE_MARKET_NAME,
    currency: ACTIVE_MARKET_CURRENCY
  }
];

const MARKETS_TTL_MS = 60_000;
let marketsCache: { at: number; markets: DeliverableMarket[] } | null = null;
let marketsInflight: Promise<DeliverableMarket[]> | null = null;

export function cannotDeliverMessage(
  countryCode: string,
  markets: readonly DeliverableMarket[],
  locale = "en"
) {
  const negotiated = negotiateLocale(locale);
  const destination = displayCountryName(countryCode, negotiated);
  const served = markets
    .map((item) => displayCountryName(item.countryCode, negotiated))
    .join(", ");
  return agenticMessage(negotiated, "mcp.cannot_deliver", { destination, served });
}

async function loadDeliverableMarkets(): Promise<DeliverableMarket[]> {
  try {
    const { getSql, getWorkerSql } = await import("@/lib/db");
    const sql = getWorkerSql() ?? getSql();

    if (!sql) {
      return [...FALLBACK_MARKETS];
    }

    const rows = await sql<Array<{ country_code: string; currency: string }>>`
      select distinct
        upper(organisations.country_code) as country_code,
        upper(coalesce(nullif(organisations.currency, ''), ${ACTIVE_MARKET_CURRENCY})) as currency
      from public.organisations
      where organisations.organisation_type = 'tenant'
        and organisations.status = 'active'
        and organisations.country_code ~ '^[A-Z]{2}$'
      order by 1
    `;

    if (rows.length < 1) {
      return [...FALLBACK_MARKETS];
    }

    return rows.map((row) => ({
      countryCode: row.country_code,
      countryName: displayCountryName(row.country_code),
      currency: row.currency
    }));
  } catch {
    return [...FALLBACK_MARKETS];
  }
}

export async function listDeliverableMarkets(): Promise<DeliverableMarket[]> {
  if (marketsCache && Date.now() - marketsCache.at < MARKETS_TTL_MS) {
    return marketsCache.markets;
  }

  if (!marketsInflight) {
    marketsInflight = loadDeliverableMarkets()
      .then((markets) => {
        marketsCache = { at: Date.now(), markets };
        return markets;
      })
      .finally(() => {
        marketsInflight = null;
      });
  }

  if (marketsCache) {
    return marketsCache.markets;
  }

  return marketsInflight;
}

export function cachedDeliverableMarkets(): DeliverableMarket[] {
  void listDeliverableMarkets();
  return marketsCache?.markets ?? [...FALLBACK_MARKETS];
}

export async function resolveMarket(input: Readonly<{
  countryCode: string;
  currency?: string;
  locale?: string;
  retailerAdapter: MarketBinding["retailerAdapter"];
}>): Promise<MarketBinding | AgenticErrorResult> {
  const countryCode = input.countryCode.trim().toUpperCase();
  const markets = await listDeliverableMarkets();
  const market = markets.find((item) => item.countryCode === countryCode);

  if (!market) {
    return businessError({
      fieldPath: "request.destinationCountry",
      message: cannotDeliverMessage(countryCode, markets, input.locale),
      reasonCode: "unsupported_country"
    });
  }

  const currency = input.currency?.trim().toUpperCase();

  if (currency && currency !== market.currency) {
    const negotiated = negotiateLocale(input.locale);
    return businessError({
      fieldPath: "request.currency",
      message: agenticMessage(negotiated, "mcp.unsupported_currency_detail", {
        currency: market.currency,
        market: displayCountryName(market.countryCode, negotiated)
      }),
      reasonCode: "unsupported_currency"
    });
  }

  return {
    countryCode: market.countryCode,
    countryName: market.countryName,
    currency: market.currency,
    retailerAdapter: input.retailerAdapter,
    retailerId: ACTIVE_RETAILER_ID,
    retailerName: market.countryName
  };
}

export function stockStatusToOrderable(status: string) {
  return status === "in_stock" || status === "backorder" || status === "available_now";
}
