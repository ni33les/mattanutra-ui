import type postgres from "postgres";
import type { BpmEventInput } from "@/lib/bpm";
import { isInternalTestMetadata } from "@/lib/payment-internal-test";

type Attribution = NonNullable<BpmEventInput["attribution"]>;
const keys = ["adId", "affiliateClickId", "affiliateId", "affiliateRef", "affiliateSubId", "campaignId", "campaignName", "clickId", "countryCode", "deviceType", "landingPage", "path", "promoCode", "referrer", "route", "sourceChannel", "sourceDetail", "sourceUrl", "trafficSource", "utmCampaign", "utmContent", "utmMedium", "utmSource", "utmTerm"] as const;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Internal acquisition context only. Never send UTM labels or page URLs to Meta. */
export function normalizeJourneyAttribution(value: unknown): { attribution: Attribution; ray: string | null } | null {
  const context = record(value);
  const source = record(context.attribution);
  const attribution: Attribution = Object.fromEntries(keys.flatMap(key => {
    const item = source[key];
    return typeof item === "string" && item.trim() ? [[key, item.trim().slice(0, 2048)]] : [];
  }));
  const ray = typeof context.ray === "string" && /^[0-9a-f-]{36}$/i.test(context.ray) ? context.ray : null;
  return ray || Object.keys(attribution).length ? { attribution, ray } : null;
}

export async function assessmentCheckoutAttribution(sql: postgres.Sql | postgres.TransactionSql, planId: string) {
  const [assessment] = await sql`select journey_version, acquisition_attribution from public.assessments where plan_id=${planId}::uuid`;
  let acquisitionAttribution = normalizeJourneyAttribution(assessment?.acquisition_attribution);
  if (!acquisitionAttribution) {
    const [event] = await sql`select ray, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      campaign_id, campaign_name, ad_id, click_id, traffic_source, source_channel, landing_page, referrer
      from public.bpm where plan_id=${planId}::uuid and event_name in ('assessment_captured','assessment_recaptured')
      order by created_at asc limit 1`;
    if (event) acquisitionAttribution = normalizeJourneyAttribution({ ray: event.ray, attribution: {
      utmSource: event.utm_source, utmMedium: event.utm_medium, utmCampaign: event.utm_campaign,
      utmContent: event.utm_content, utmTerm: event.utm_term, campaignId: event.campaign_id,
      campaignName: event.campaign_name, adId: event.ad_id, clickId: event.click_id,
      trafficSource: event.traffic_source, sourceChannel: event.source_channel,
      landingPage: event.landing_page, referrer: event.referrer
    } });
  }
  return { acquisitionAttribution, journeyVersion: assessment?.journey_version ?? null };
}

export function commerceBpmContext(metadata: unknown, stripeMode?: string) {
  const stored = record(metadata);
  const acquisition = normalizeJourneyAttribution(stored.acquisitionAttribution);
  return {
    attribution: acquisition?.attribution,
    ray: acquisition?.ray ?? null,
    properties: {
      journeyVersion: stored.journeyVersion ?? null,
      channel: stored.channel ?? "web",
      stripeMode: stripeMode ?? stored.stripeMode ?? null,
      internal_test: isInternalTestMetadata(stored)
    }
  };
}
