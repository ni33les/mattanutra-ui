export const supportedOrganisationCurrencies = [
  "THB",
  "USD",
  "EUR",
  "GBP",
  "SGD"
] as const;

export type SupportedOrganisationCurrency =
  (typeof supportedOrganisationCurrencies)[number];

export function formatCurrencyAmount(
  locale: string,
  amount: number,
  currency: string | null | undefined,
  options: Readonly<{
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  }> = {}
) {
  return new Intl.NumberFormat(locale, {
    currency: currency || "THB",
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    minimumFractionDigits: options.minimumFractionDigits,
    style: "currency"
  }).format(amount);
}
