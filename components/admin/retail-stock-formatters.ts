import type { Locale } from "@/lib/i18n";

function priceFormatter(locale: Locale, currency: string) {
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    style: "currency"
  });
}

export function formatPrice(
  locale: Locale,
  currency: string,
  value: number | null
) {
  return value === null ? null : priceFormatter(locale, currency).format(value);
}

export function formatAmount(locale: Locale, value: number | null) {
  return value === null
    ? null
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2
      }).format(value);
}

export function formatWholeAmount(locale: Locale, value: number | null) {
  return value === null
    ? null
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0
      }).format(value);
}
