export const defaultProductCountryCode = "TH";

export const productCountryOptions = [
  { code: "TH", label: "Thailand" },
  { code: "SG", label: "Singapore" },
  { code: "MY", label: "Malaysia" },
  { code: "ID", label: "Indonesia" },
  { code: "PH", label: "Philippines" },
  { code: "VN", label: "Vietnam" },
  { code: "MM", label: "Myanmar" },
  { code: "US", label: "United States" },
  { code: "AU", label: "Australia" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
  { code: "CN", label: "China" }
] as const;

const productCountryCodes: ReadonlySet<string> =
  new Set(productCountryOptions.map((item) => item.code));

export type ProductCountryCode = (typeof productCountryOptions)[number]["code"];
export type ProductCountryPricingStatus = "missing" | "ready" | "review";

export type ProductCountryPricing = Readonly<{
  countryCode: ProductCountryCode;
  currency: string;
  priceUpdatedAt: string | null;
  pricingStatus: ProductCountryPricingStatus;
  rrpPriceAmount: number | null;
}>;

export function normalizeProductCountryCode(value: unknown): ProductCountryCode | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";

  return productCountryCodes.has(code) ? code as ProductCountryCode : null;
}

export function normalizeProductCountryCodes(
  value: unknown,
  fallback: readonly string[] = [defaultProductCountryCode]
): ProductCountryCode[] {
  const source = Array.isArray(value) ? value : [value];
  const codes = [
    ...new Set(source.map(normalizeProductCountryCode).filter(Boolean))
  ] as ProductCountryCode[];

  if (codes.length > 0) {
    return codes;
  }

  const fallbackCodes = [
    ...new Set(fallback.map(normalizeProductCountryCode).filter(Boolean))
  ] as ProductCountryCode[];

  return fallbackCodes.length > 0 ? fallbackCodes : [defaultProductCountryCode];
}

export function productCountryLabel(code: string) {
  return productCountryOptions.find((item) => item.code === code)?.label ?? code;
}

export function normalizeProductCountryPricingStatus(
  value: unknown,
  rrpPriceAmount: number | null = null
): ProductCountryPricingStatus {
  if (value === "ready" || value === "review" || value === "missing") {
    return value;
  }

  return rrpPriceAmount !== null ? "ready" : "missing";
}

export function normalizeCurrencyCode(value: unknown, fallback = "THB") {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  const fallbackCurrency = fallback.trim().toUpperCase();

  if (/^[A-Z]{3}$/.test(currency)) {
    return currency;
  }

  return /^[A-Z]{3}$/.test(fallbackCurrency) ? fallbackCurrency : "THB";
}
