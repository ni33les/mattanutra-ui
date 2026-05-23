import type { ProductAudience } from "@/lib/product-recommendations";
import { defaultProductCountryCode, normalizeProductCountryCode, normalizeProductCountryCodes, type ProductCountryCode } from "@/lib/product-countries";
import { productFactAliasKeys, normalizeProductFactKey, normalizeProductFactName, productFactLooksLikeConcentration } from "@/lib/product-recommendations";
import { normalizeDoseUnit, comparableDoseAmount } from "@/lib/dose-conversion";
import { isProductAudience } from "./admin-product-types.ts";

// Small pure helpers extracted from admin-products.ts as part of Sprint 2 refactor.

export function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function arrayPayload(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function productCountryCodesFromDb(
  value: unknown,
  fallback: readonly string[] = [defaultProductCountryCode]
): ProductCountryCode[] {
  return normalizeProductCountryCodes(Array.isArray(value) ? value : [], fallback);
}

export function normalizeSubmittedProductCountryCodes(
  countryCodes: readonly string[],
  label: string
): ProductCountryCode[] {
  if (countryCodes.length < 1) {
    throw new Error(`${label} requires at least one country`);
  }

  const codes = [
    ...new Set(
      countryCodes
        .map((countryCode) => normalizeProductCountryCode(countryCode))
        .filter((countryCode): countryCode is ProductCountryCode => Boolean(countryCode))
    )
  ];

  if (codes.length < 1) {
    throw new Error(`${label} requires at least one valid country`);
  }

  return codes;
}

export function sameProductCountryCodes(
  left: readonly ProductCountryCode[],
  right: readonly ProductCountryCode[]
): boolean {
  const normalizedLeft = normalizeProductCountryCodes(left).sort();
  const normalizedRight = normalizeProductCountryCodes(right).sort();

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((countryCode, index) => countryCode === normalizedRight[index])
  );
}

export function assertProductCountriesAllowedByBrand(
  productCountryCodes: readonly string[],
  brandCountryCodes: readonly string[],
  brandName?: string | null
) {
  const brandCountries = new Set(brandCountryCodes);
  const disallowed = productCountryCodes.filter((code) => !brandCountries.has(code));

  if (disallowed.length > 0) {
    throw new Error(
      `Product countries must be enabled on manufacturer${brandName ? ` ${brandName}` : ""}: ${disallowed.join(", ")}`
    );
  }
}

// Re-export or re-define small audience helpers that were local
export function productAudienceFromUnknown(value: unknown): ProductAudience | null {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";

  return isProductAudience(normalized) ? normalized : null;
}

export function productAudienceFromText(...values: readonly unknown[]): ProductAudience | null {
  const text = values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (!text) {
    return null;
  }

  const malePattern =
    /\b(men|mens|men's|male|prostate|testosterone)\b|conceive\s+well\s+men/;
  const femalePattern =
    /\b(women|womens|women's|female|pregnancy|pregnant|breast[ -]?feeding|breastfeeding|prenatal|postnatal|menopause)\b|conceive\s+well(?!\s+men)/;

  if (malePattern.test(text)) {
    return "male";
  }

  if (femalePattern.test(text)) {
    return "female";
  }

  return null;
}

export function productAudienceFromSnapshot(value: unknown): ProductAudience {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);
  const qualityEnrichment = recordFromUnknown(snapshot.qualityEnrichment);

  return productAudienceFromUnknown(correction.productAudience) ??
    productAudienceFromUnknown(qualityEnrichment.productAudience) ??
    "both";
}

export function aiCorrectionNotesFromSnapshot(value: unknown): string | null {
  const snapshot = recordFromUnknown(value);
  const correction = recordFromUnknown(snapshot.aiFactCorrection);
  const note = correction?.notes ?? correction?.note ?? null;
  return typeof note === "string" ? note : null;
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function cleanNullableText(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

export function productTitleLooksEnglish(value: string): boolean {
  const text = value.trim();

  if (!text) {
    return false;
  }

  if (/[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u.test(text)) {
    return false;
  }

  return /[A-Za-z]/.test(text);
}

export function preferredProductTitle(input: Readonly<{
  title: string;
  titleEn?: string | null;
}>) {
  const title = input.title.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);

  if (titleEn && !productTitleLooksEnglish(title)) {
    return titleEn;
  }

  return title;
}

export function isUuidValue(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}
