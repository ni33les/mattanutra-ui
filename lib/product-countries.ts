import type { ProductRegulatoryApproval } from "@/lib/product-regulatory-approvals";

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

function countryLookupKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

const productCountryLabelCodes: ReadonlyMap<string, ProductCountryCode> =
  new Map(
    productCountryOptions.flatMap((item) => [
      [item.label.trim().toUpperCase(), item.code],
      [countryLookupKey(item.label), item.code]
    ])
  );

const productCountryAliases: ReadonlyMap<string, ProductCountryCode> = new Map([
  ["USA", "US"],
  ["UNITEDSTATESOFAMERICA", "US"],
  ["UK", "GB"],
  ["GREATBRITAIN", "GB"],
  ["BRITAIN", "GB"],
  ["BURMA", "MM"]
]);

export type ProductCountryPricing = Readonly<{
  countryCode: ProductCountryCode;
  currency: string;
  effectiveRegulatoryApprovals?: ProductRegulatoryApproval[];
  priceUpdatedAt: string | null;
  rrpPriceAmount: number | null;
}>;

export function normalizeProductCountryCode(value: unknown): ProductCountryCode | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (productCountryCodes.has(code)) {
    return code as ProductCountryCode;
  }

  const lookupKey = countryLookupKey(code);

  if (productCountryCodes.has(lookupKey)) {
    return lookupKey as ProductCountryCode;
  }

  return (
    productCountryLabelCodes.get(code) ??
    productCountryLabelCodes.get(lookupKey) ??
    productCountryAliases.get(code) ??
    productCountryAliases.get(lookupKey) ??
    null
  );
}

export function parseShippingCountryCode(value: unknown): string | null {
  const aliased = normalizeProductCountryCode(value);

  if (aliased) {
    return aliased;
  }

  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function displayCountryName(countryCode: string, locale = "en"): string {
  const code = countryCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return countryCode.trim() || "that country";
  }

  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? productCountryLabel(code);
  } catch {
    return productCountryLabel(code);
  }
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

export function normalizeCurrencyCode(value: unknown, fallback = "THB") {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  const fallbackCurrency = fallback.trim().toUpperCase();

  if (/^[A-Z]{3}$/.test(currency)) {
    return currency;
  }

  return /^[A-Z]{3}$/.test(fallbackCurrency) ? fallbackCurrency : "THB";
}
