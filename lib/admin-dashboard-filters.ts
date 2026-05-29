import type postgres from "postgres";
import { normalizeLocaleCode, publicLocales } from "@/lib/i18n";

export type AdminDashboardFilters = Readonly<{
  affiliate: string;
  campaign: string;
  campaignId: string;
  device: string;
  emailHash: string;
  locale: string;
  medium: string;
  planId: string;
  promoCode: string;
  ray: string;
  selectedPlan: string;
  source: string;
}>;

type SearchParamValue = string | string[] | undefined;

const filterKeys = [
  "affiliate",
  "campaign",
  "campaignId",
  "device",
  "emailHash",
  "locale",
  "medium",
  "planId",
  "promoCode",
  "ray",
  "selectedPlan",
  "source"
] as const satisfies ReadonlyArray<keyof AdminDashboardFilters>;

export const emptyAdminDashboardFilters: AdminDashboardFilters = {
  affiliate: "",
  campaign: "",
  campaignId: "",
  device: "",
  emailHash: "",
  locale: "",
  medium: "",
  planId: "",
  promoCode: "",
  ray: "",
  selectedPlan: "",
  source: ""
};

function firstParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanParam(value: SearchParamValue) {
  return (firstParam(value) ?? "").trim().slice(0, 200);
}

function cleanFirstParam(...values: SearchParamValue[]) {
  for (const value of values) {
    const cleaned = cleanParam(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function cleanLocaleFilter(value: SearchParamValue) {
  const locale = cleanParam(value);

  if (locale.toLowerCase() === "none") {
    return "none";
  }

  const locales = locale
    .split(",")
    .map((item) => normalizeLocaleCode(item))
    .filter((item): item is (typeof publicLocales)[number] =>
      Boolean(item && publicLocales.some((locale) => locale === item))
    );

  if (locales.length === 0 || locales.length === publicLocales.length) {
    return "";
  }

  return [...new Set(locales)].join(",");
}

function cleanDeviceFilter(...values: SearchParamValue[]) {
  const allowedDevices = new Set(["desktop", "mobile", "tablet"]);
  const value = cleanFirstParam(...values).toLowerCase();

  if (value === "none") {
    return "none";
  }

  const devices = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowedDevices.has(item));

  if (devices.length === 0 || devices.length === allowedDevices.size) {
    return "";
  }

  return [...new Set(devices)].sort().join(",");
}

export function normalizeAdminDashboardFilters(
  params: Partial<
    Record<keyof AdminDashboardFilters, SearchParamValue> &
      Record<string, SearchParamValue>
  >
): AdminDashboardFilters {
  return {
    affiliate: cleanFirstParam(
      params.affiliate,
      params.affiliate_id,
      params.affiliate_ref,
      params.affiliate_sub_id
    ),
    campaign: cleanFirstParam(
      params.campaign,
      params.utm_campaign,
      params.campaign_name
    ),
    campaignId: cleanFirstParam(params.campaignId, params.campaign_id),
    device: cleanDeviceFilter(params.device, params.device_type),
    emailHash: cleanFirstParam(params.emailHash, params.email_hash),
    locale: cleanLocaleFilter(params.locale),
    medium: cleanFirstParam(params.medium, params.utm_medium),
    planId: cleanFirstParam(params.planId, params.plan_id, params.plan),
    promoCode: cleanFirstParam(params.promoCode, params.promo_code),
    ray: cleanParam(params.ray),
    selectedPlan: cleanFirstParam(params.selectedPlan, params.selected_plan),
    source: cleanFirstParam(
      params.source,
      params.utm_source,
      params.traffic_source,
      params.source_channel
    )
  };
}

export function adminDashboardFilterEntries(filters: AdminDashboardFilters) {
  return filterKeys
    .map((key) => [key, filters[key]] as const)
    .filter(([, value]) => value.length > 0);
}

export function hasAdminDashboardFilters(filters: AdminDashboardFilters) {
  return adminDashboardFilterEntries(filters).length > 0;
}

export function adminDashboardFilterSql(
  sql: postgres.Sql,
  filters: AdminDashboardFilters
) {
  const affiliate = filters.affiliate || null;
  const campaign = filters.campaign || null;
  const campaignId = filters.campaignId || null;
  const device = filters.device || null;
  const emailHash = filters.emailHash || null;
  const locale = filters.locale || null;
  const medium = filters.medium || null;
  const planId = filters.planId || null;
  const promoCode = filters.promoCode || null;
  const ray = filters.ray || null;
  const selectedPlan = filters.selectedPlan || null;
  const source = filters.source || null;

  return sql`
    (${locale}::text is null or locale = any(string_to_array(${locale}, ',')))
    and (
      ${device}::text is null
      or lower(coalesce(device_type, '')) = any(string_to_array(${device}, ','))
    )
    and (${selectedPlan}::text is null or selected_plan::text = ${selectedPlan})
    and (${planId}::text is null or plan_id::text = ${planId})
    and (${ray}::text is null or ray::text = ${ray})
    and (${emailHash}::text is null or email_hash = ${emailHash})
    and (
      ${source}::text is null
      or lower(coalesce(utm_source, '')) = lower(${source})
      or lower(coalesce(traffic_source, '')) = lower(${source})
      or lower(coalesce(source_channel, '')) = lower(${source})
    )
    and (${medium}::text is null or lower(utm_medium) = lower(${medium}))
    and (
      ${campaign}::text is null
      or lower(coalesce(utm_campaign, '')) = lower(${campaign})
      or lower(coalesce(campaign_name, '')) = lower(${campaign})
    )
    and (${campaignId}::text is null or lower(campaign_id) = lower(${campaignId}))
    and (
      ${affiliate}::text is null
      or lower(coalesce(affiliate_id, '')) = lower(${affiliate})
      or lower(coalesce(affiliate_ref, '')) = lower(${affiliate})
      or lower(coalesce(affiliate_sub_id, '')) = lower(${affiliate})
    )
    and (${promoCode}::text is null or lower(promo_code) = lower(${promoCode}))
  `;
}
