export const supportedOrganisationCurrencies = [
  "THB",
  "USD",
  "EUR",
  "GBP",
  "SGD"
] as const;

export type SupportedOrganisationCurrency =
  (typeof supportedOrganisationCurrencies)[number];

