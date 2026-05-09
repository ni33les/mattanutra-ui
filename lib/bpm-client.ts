import type { Locale } from "@/lib/i18n";

type BpmAttribution = Readonly<{
  adId?: string;
  affiliateClickId?: string;
  affiliateId?: string;
  affiliateRef?: string;
  affiliateSubId?: string;
  browser?: string;
  campaignId?: string;
  campaignName?: string;
  clickId?: string;
  deviceType?: string;
  landingPage?: string;
  os?: string;
  path?: string;
  promoCode?: string;
  referrer?: string;
  route?: string;
  sourceChannel?: string;
  sourceDetail?: string;
  sourceUrl?: string;
  trafficSource?: string;
  userAgent?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
}>;

type TrackBpmEventInput = Readonly<{
  email?: string;
  eventStatus?: string;
  eventType?: string;
  exampleRequestId?: string;
  healthScore?: number;
  locale?: Locale;
  lowestDomain?: string;
  metrics?: Record<string, unknown>;
  planId?: string;
  properties?: Record<string, unknown>;
  scoreBand?: string;
  selectedPlan?: string;
  severity?: string;
  valueAmount?: number;
  valueCurrency?: string;
}>;

const RAY_KEY = "mattanutra:bpm:ray";
const ATTRIBUTION_KEY = "mattanutra:bpm:attribution";

let memoryRay = "";

function browserReady() {
  return typeof window !== "undefined";
}

function randomRay() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const value = Number(char);

    return (value ^ (Math.floor(Math.random() * 16) >> (value / 4))).toString(
      16
    );
  });
}

function storageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage can be blocked in private contexts. A memory ray is fine.
  }
}

export function getBpmRay() {
  if (!browserReady()) {
    return "";
  }

  const existing = storageGet(RAY_KEY);

  if (existing) {
    return existing;
  }

  memoryRay ||= randomRay();
  storageSet(RAY_KEY, memoryRay);

  return memoryRay;
}

function searchParam(params: URLSearchParams, names: readonly string[]) {
  for (const name of names) {
    const value = params.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function hasAttributionParams(params: URLSearchParams) {
  return [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "campaign_id",
    "campaign",
    "promo_code",
    "promo",
    "affiliate_id",
    "affiliate",
    "affiliate_ref",
    "aff",
    "gclid",
    "fbclid",
    "ttclid",
    "msclkid"
  ].some((name) => Boolean(params.get(name)));
}

function sourceChannelFromReferrer(referrer: string) {
  if (!referrer) {
    return "";
  }

  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");

    if (host.includes("google")) return "google";
    if (host.includes("facebook")) return "facebook";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("line.me")) return "line";
    if (host.includes("youtube")) return "youtube";

    return host;
  } catch {
    return "";
  }
}

function inferTrafficSource({
  affiliateId,
  affiliateRef,
  referrer,
  utmMedium,
  utmSource
}: Readonly<{
  affiliateId: string;
  affiliateRef: string;
  referrer: string;
  utmMedium: string;
  utmSource: string;
}>) {
  const medium = utmMedium.toLowerCase();
  const source = utmSource.toLowerCase();

  if (affiliateId || affiliateRef) return "affiliate";
  if (medium.includes("email") || source.includes("newsletter")) return "email";
  if (
    medium.includes("cpc") ||
    medium.includes("paid") ||
    medium.includes("ppc") ||
    medium.includes("ad")
  ) {
    return "paid";
  }
  if (
    ["facebook", "instagram", "tiktok", "line", "youtube"].some((channel) =>
      source.includes(channel)
    )
  ) {
    return "social";
  }
  if (referrer) {
    const channel = sourceChannelFromReferrer(referrer);

    if (["google", "bing", "yahoo"].includes(channel)) {
      return "organic";
    }

    return "referral";
  }

  return "direct";
}

function deviceType() {
  const width = window.innerWidth;

  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";

  return "desktop";
}

function osName() {
  const agent = navigator.userAgent.toLowerCase();

  if (agent.includes("iphone") || agent.includes("ipad")) return "ios";
  if (agent.includes("android")) return "android";
  if (agent.includes("mac os")) return "macos";
  if (agent.includes("windows")) return "windows";

  return "";
}

function browserName() {
  const agent = navigator.userAgent.toLowerCase();

  if (agent.includes("edg/")) return "edge";
  if (agent.includes("opr/") || agent.includes("opera")) return "opera";
  if (agent.includes("chrome/") || agent.includes("crios/")) return "chrome";
  if (agent.includes("safari/") && !agent.includes("chrome/")) return "safari";
  if (agent.includes("firefox/") || agent.includes("fxios/")) return "firefox";

  return "";
}

function currentAttribution(): BpmAttribution {
  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || "";
  const utmSource = searchParam(params, ["utm_source"]);
  const utmMedium = searchParam(params, ["utm_medium"]);
  const affiliateId = searchParam(params, ["affiliate_id", "affiliate"]);
  const affiliateRef = searchParam(params, ["affiliate_ref", "aff"]);
  const clickId = searchParam(params, [
    "click_id",
    "gclid",
    "fbclid",
    "ttclid",
    "msclkid"
  ]);

  return {
    adId: searchParam(params, ["ad_id"]),
    affiliateClickId: searchParam(params, ["affiliate_click_id", "click_id"]),
    affiliateId,
    affiliateRef,
    affiliateSubId: searchParam(params, ["affiliate_sub_id", "sub_id"]),
    browser: browserName(),
    campaignId: searchParam(params, ["campaign_id"]),
    campaignName: searchParam(params, ["campaign_name", "campaign"]),
    clickId,
    deviceType: deviceType(),
    landingPage: `${window.location.pathname}${window.location.search}`,
    os: osName(),
    path: window.location.pathname,
    promoCode: searchParam(params, ["promo_code", "promo"]),
    referrer,
    route: window.location.pathname,
    sourceChannel:
      utmSource || sourceChannelFromReferrer(referrer) || affiliateRef,
    sourceDetail: searchParam(params, ["source_detail", "placement"]),
    sourceUrl: window.location.href,
    trafficSource: inferTrafficSource({
      affiliateId,
      affiliateRef,
      referrer,
      utmMedium,
      utmSource
    }),
    userAgent: navigator.userAgent,
    utmCampaign: searchParam(params, ["utm_campaign"]),
    utmContent: searchParam(params, ["utm_content"]),
    utmMedium,
    utmSource,
    utmTerm: searchParam(params, ["utm_term"])
  };
}

export function getBpmAttribution() {
  if (!browserReady()) {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const stored = storageGet(ATTRIBUTION_KEY);

  if (stored && !hasAttributionParams(params)) {
    try {
      return {
        ...JSON.parse(stored),
        deviceType: deviceType(),
        browser: browserName(),
        os: osName(),
        path: window.location.pathname,
        route: window.location.pathname,
        sourceUrl: window.location.href,
        userAgent: navigator.userAgent
      } satisfies BpmAttribution;
    } catch {
      // Fall through and rebuild attribution.
    }
  }

  const attribution = currentAttribution();
  storageSet(ATTRIBUTION_KEY, JSON.stringify(attribution));

  return attribution;
}

export function getBpmPayload() {
  return {
    attribution: getBpmAttribution(),
    ray: getBpmRay()
  };
}

function currentPlanId() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan") || params.get("planId");

  return plan || undefined;
}

export function trackBpmEvent(eventName: string, input: TrackBpmEventInput = {}) {
  if (!browserReady() || !eventName) {
    return;
  }

  const payload = {
    ...input,
    attribution: getBpmAttribution(),
    eventName,
    planId: input.planId ?? currentPlanId(),
    ray: getBpmRay()
  };

  void fetch("/api/bpm", {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      "content-type": "application/json"
    },
    keepalive: true,
    method: "POST"
  }).catch(() => {
    // Tracking must never affect the user journey.
  });
}
