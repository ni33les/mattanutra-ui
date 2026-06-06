import {
  normalizeProductCountryCode,
  type ProductCountryCode
} from "@/lib/product-countries";

export type ProductRegulatoryAgencyPreset = Readonly<{
  agencyCode: string;
  agencyName: string;
}>;

export const productRegulatoryAgenciesByCountry: Partial<
  Record<ProductCountryCode, readonly ProductRegulatoryAgencyPreset[]>
> = {
  AU: [{ agencyCode: "AU_TGA", agencyName: "Australia TGA" }],
  CA: [{ agencyCode: "CA_HEALTH_CANADA", agencyName: "Health Canada" }],
  CN: [{ agencyCode: "CN_NMPA", agencyName: "China NMPA" }],
  DE: [{ agencyCode: "EU_EFSA", agencyName: "European Food Safety Authority" }],
  FR: [{ agencyCode: "EU_EFSA", agencyName: "European Food Safety Authority" }],
  GB: [{ agencyCode: "GB_MHRA", agencyName: "UK MHRA" }],
  ID: [{ agencyCode: "ID_BPOM", agencyName: "Indonesia BPOM" }],
  IN: [{ agencyCode: "IN_FSSAI", agencyName: "India FSSAI" }],
  JP: [{ agencyCode: "JP_PMDA", agencyName: "Japan PMDA" }],
  KR: [{ agencyCode: "KR_MFDS", agencyName: "Korea MFDS" }],
  MM: [{ agencyCode: "MM_FDA", agencyName: "Myanmar FDA" }],
  MY: [{ agencyCode: "MY_NPRA", agencyName: "Malaysia NPRA" }],
  PH: [{ agencyCode: "PH_FDA", agencyName: "Philippines FDA" }],
  SG: [{ agencyCode: "SG_HSA", agencyName: "Singapore HSA" }],
  TH: [{ agencyCode: "TH_FDA", agencyName: "Thai FDA" }],
  US: [{ agencyCode: "US_FDA", agencyName: "US FDA" }],
  VN: [{ agencyCode: "VN_DAV", agencyName: "Vietnam DAV" }]
};

export const defaultProductRegulatoryAgency: ProductRegulatoryAgencyPreset = {
  agencyCode: "TH_FDA",
  agencyName: "Thai FDA"
};

export function regulatoryAgencyOptionsForCountry(countryCode: string) {
  const normalized = normalizeProductCountryCode(countryCode);

  return normalized
    ? productRegulatoryAgenciesByCountry[normalized] ?? [defaultProductRegulatoryAgency]
    : [defaultProductRegulatoryAgency];
}

export function defaultRegulatoryAgencyForCountry(countryCode: string) {
  return regulatoryAgencyOptionsForCountry(countryCode)[0] ??
    defaultProductRegulatoryAgency;
}

export function regulatoryAgencyByCode(
  countryCode: string,
  agencyCode: string | null | undefined
) {
  const options = regulatoryAgencyOptionsForCountry(countryCode);

  return options.find((agency) => agency.agencyCode === agencyCode) ??
    defaultRegulatoryAgencyForCountry(countryCode);
}
