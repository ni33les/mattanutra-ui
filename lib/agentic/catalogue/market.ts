import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";

export const ACTIVE_MARKET_COUNTRY = "TH";
export const ACTIVE_MARKET_CURRENCY = "THB";
export const ACTIVE_MARKET_NAME = "Thailand";
export const ACTIVE_RETAILER_ID = "retailer_th_delight";
export const ACTIVE_RETAILER_NAME = "Thailand retailer";

export type MarketBinding = Readonly<{
  countryCode: "TH";
  countryName: typeof ACTIVE_MARKET_NAME;
  currency: "THB";
  retailerAdapter: "mock_thailand" | "thailand_uat" | "thailand_live";
  retailerId: typeof ACTIVE_RETAILER_ID;
  retailerName: typeof ACTIVE_RETAILER_NAME;
}>;

export function resolveMarket(input: Readonly<{
  countryCode: string;
  currency: string;
  retailerAdapter: MarketBinding["retailerAdapter"];
}>): MarketBinding | AgenticErrorResult {
  if (input.countryCode !== ACTIVE_MARKET_COUNTRY) {
    return businessError({
      fieldPath: "request.destinationCountry",
      message: "This destination country is not supported yet.",
      reasonCode: "unsupported_country"
    });
  }

  if (input.currency !== ACTIVE_MARKET_CURRENCY) {
    return businessError({
      fieldPath: "request.currency",
      message: "Currency must match the destination market.",
      reasonCode: "unsupported_currency"
    });
  }

  return {
    countryCode: "TH",
    countryName: ACTIVE_MARKET_NAME,
    currency: "THB",
    retailerAdapter: input.retailerAdapter,
    retailerId: ACTIVE_RETAILER_ID,
    retailerName: ACTIVE_RETAILER_NAME
  };
}

export function stockStatusToOrderable(status: string) {
  return status === "in_stock" || status === "backorder" || status === "available_now";
}
