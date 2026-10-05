import { metaOrigin, sanitiseMetaUrl, type MetaEnvironment } from "@/lib/meta-event-policy";

export const metaCampaignKeys = ["campaign_id", "adset_id", "ad_id", "creative_id"] as const;
export const metaAdUrlParameters = "campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}";
const numericId = /^\d{1,25}$/;

function eligibleUrl(value: unknown, environment: MetaEnvironment) {
  if (!sanitiseMetaUrl(value, environment)) return null;
  try { return new URL(String(value), metaOrigin(environment)); } catch { return null; }
}

export function metaClickId(value: unknown, environment: MetaEnvironment) {
  const click = eligibleUrl(value, environment)?.searchParams.get("fbclid");
  return click && /^[\w-]{1,500}$/.test(click) ? click : null;
}

/** One ad's identifiers form a group; never mix a new campaign with an old ad. */
export function metaCampaignAttribution(value: unknown, environment: MetaEnvironment,
  previous: Record<string, unknown> = {}, newClick = false) {
  const url = eligibleUrl(value, environment), incoming: Record<string, string> = {};
  for (const key of metaCampaignKeys) {
    const id = url?.searchParams.get(key);
    if (id && numericId.test(id)) incoming[key] = id;
  }
  if (Object.keys(incoming).length || newClick) return incoming;
  return Object.fromEntries(metaCampaignKeys.filter(key => typeof previous[key] === "string" && numericId.test(previous[key] as string))
    .map(key => [key, previous[key] as string]));
}

/** Reuse the original click timestamp on refresh, recovery and repeated events. */
export function metaFbc(click: string | null, cookie: string | null, previous: unknown, now = Date.now()) {
  const valid = (value: unknown): value is string => typeof value === "string" && /^fb\.\d\.\d{10,13}\.[\w-]{1,500}$/.test(value);
  const candidates = [previous, cookie].filter(valid);
  if (!click) return candidates[0];
  return candidates.find(value => value.slice(value.lastIndexOf(".") + 1) === click) ?? `fb.1.${now}.${click}`;
}
