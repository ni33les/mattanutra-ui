import { isLocale } from "@/lib/i18n";

/** The explicit event payload boundary. Internal BPM payloads must never be spread into Meta events. */
export type MetaEnvironment = "dev" | "uat" | "prd";
export const META_EVENTS = ["PageView", "ViewContent", "QuizStart", "QuizProgress", "QuizSubmitted", "Lead", "EmailCapture", "Contact", "SelectOffer", "AddToCart", "InitiateCheckout", "OrderSubmitted", "Purchase", "McpProviderSelected", "McpUrlCopied", "McpProviderOpened", "McpPromptCopied", "McpConnectionVerified"] as const;
export type MetaEventName = typeof META_EVENTS[number];
export type MetaPublicConfig = { environment: MetaEnvironment; pixelId: string; enabled: boolean };
export const META_CONSENT_COOKIE = "mn_marketing";
export const META_CONTEXT_COOKIE = "mn_marketing_context";
export const META_CONSENT_VERSION = 1;
export type MetaPreferenceSource = "explicit" | "site_default";
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const metaOrigin = (env: MetaEnvironment) => env === "prd" ? "https://mattanutra.com" : `https://${env}.mattanutra.com`;

/** Public aliases are explicit; proxy-internal request URLs need not match the browser origin. */
export function metaRequestOriginAllowed(request: Request, env: MetaEnvironment) {
  const origin = request.headers.get("origin");
  return !!origin && (origin === new URL(request.url).origin || origin === metaOrigin(env)
    || env === "prd" && origin === "https://www.mattanutra.com");
}

export function metaEventName(name: MetaEventName, env: MetaEnvironment) {
  // Tags alone do not stop UAT purchases entering production conversion optimisation.
  return env === "prd" ? name : `${env.toUpperCase()}_${name}`;
}

export function sanitiseMetaUrl(value: unknown, env: MetaEnvironment): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value, metaOrigin(env));
    const expected = new URL(metaOrigin(env));
    const local = env === "dev" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.origin !== expected.origin && !(env === "prd" && url.hostname === "www.mattanutra.com" && url.protocol === "https:") && !local) return null;
    if (/\/(admin|api)(\/|$)/.test(url.pathname)) return null;
    const match = url.pathname.match(/^\/([^/]+)(?:\/(.*))?\/?$/);
    if (!match || !isLocale(match[1])) return null;
    const [, locale, tail = ""] = match;
    const exact = ["", "privacy", "terms", "assessment", "assessment/results", "nutrition/refine", "nutrition/quiz", "nutrition/healthscore", "nutrition/progress", "nutrition/reveal", "nutrition/payment/checkout", "nutrition/payment/return", "basket/checkout", "basket/return", "order/track", "library"];
    const path = /^connect(?:\/(?:claude|perplexity|chatgpt|grok))?\/?$/.test(tail) ? tail.replace(/\/$/, "")
      : exact.includes(tail.replace(/\/$/, "")) ? tail.replace(/\/$/, "")
      : tail.startsWith("library/") || tail.startsWith("blog/") ? "library"
      : tail.startsWith("mcp/checkout/") ? "basket/checkout"
      : tail.startsWith("order/track/") ? "order/track"
      : /^retail\/[^/]+$/.test(tail) || /^p\/[^/]+$/.test(tail) ? "nutrition/quiz"
      : /^retail\/[^/]+\/(landing|quiz|progress|reveal|plan)$/.test(tail) ? `nutrition/${tail.endsWith("quiz") ? "quiz" : tail.endsWith("landing") ? "quiz" : "reveal"}`
      : null;
    if (path === null) return null;
    const safe = new URL(`/${locale}${path ? `/${path}` : ""}`, metaOrigin(env));
    const plan = url.searchParams.get("planId");
    if (!path.startsWith("connect") && plan && uuidPattern.test(plan)) safe.searchParams.set("planId", plan);
    return safe.href;
  } catch { return null; }
}

/** Native Pixel covers customer pages and reads their actual URLs/referrers. */
export function browserPixelPageSafe(value: string, _referrer: string, env: MetaEnvironment) {
  try {
    const url = new URL(value);
    const local = env === "dev" && ["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
    if (url.origin !== metaOrigin(env) && !(env === "prd" && url.origin === "https://www.mattanutra.com") && !local) return false;
    return isLocale(url.pathname.split("/")[1]) && !/\/(admin|api)(\/|$)/.test(url.pathname);
  } catch { return false; }
}

export function metaPageStage(pathname: string) {
  const path = pathname.split("/").slice(2).join("/");
  if (/^connect(?:\/|$)/.test(path)) return path === "connect" ? "connect" : "connect_guide";
  if (/(?:^|\/)(?:return|track)(?:\/|$)/.test(path)) return "confirmation";
  if (/(?:^|\/)checkout(?:\/|$)/.test(path)) return "checkout";
  if (/(?:^|\/)(?:healthscore|results|reveal|plan)(?:\/|$)/.test(path)) return "results";
  if (/(?:^|\/)(?:assessment|quiz|refine|progress)(?:\/|$)/.test(path)) return "assessment";
  if (/^basket(?:\/|$)/.test(path)) return "basket";
  if (/^(?:library|blog|privacy|terms)(?:\/|$)/.test(path)) return "content";
  return "landing";
}

export function metaCustomData(name: MetaEventName, value: unknown, environment: MetaEnvironment) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const data: Record<string, string | number> = { mn_env: environment, event_schema: "1" };
  const connection = name.startsWith("Mcp") || String(input.stage).startsWith("connect");
  if (!connection && typeof input.planId === "string" && uuidPattern.test(input.planId)) data.plan_id = input.planId;
  if (typeof input.locale === "string" && isLocale(input.locale)) data.locale = input.locale;
  if (["web", "retail", "mcp", "pharmacy", "mcp_web"].includes(String(input.channel))) {
    data.channel = input.channel === "pharmacy" ? "retail" : input.channel === "mcp_web" ? "mcp" : String(input.channel);
  }
  if (["landing", "assessment", "results", "offer", "basket", "checkout", "confirmation", "content", "connect", "connect_guide", "connect_verified"].includes(String(input.stage))) data.funnel_stage = String(input.stage);
  if (connection && ["claude", "perplexity", "chatgpt", "grok"].includes(String(input.provider))) data.provider = String(input.provider);
  if (!connection && ["precision", "pro"].includes(String(input.offer))) data.offer = String(input.offer);
  if (["Purchase", "OrderSubmitted", "InitiateCheckout", "SelectOffer", "AddToCart"].includes(name)
    && ["plan", "products"].includes(String(input.purchase_type))) data.purchase_type = String(input.purchase_type);
  if (name === "QuizProgress" && [25, 50, 75].includes(Number(input.progress))) data.progress = Number(input.progress);
  if (["Purchase", "OrderSubmitted", "InitiateCheckout", "SelectOffer", "AddToCart"].includes(name)) {
    if (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0 && input.value <= 1e9) data.value = Math.round(input.value * 100) / 100;
    if (typeof input.currency === "string" && /^[A-Z]{3}$/.test(input.currency)) data.currency = input.currency;
  }
  // Opaque campaign IDs only; campaign names/search terms can disclose sensitive interests.
  for (const key of ["campaign_id", "adset_id", "ad_id", "creative_id"] as const) {
    if (typeof input[key] === "string" && /^\d{1,25}$/.test(input[key])) data[key] = input[key];
  }
  return data;
}

export function metaEventForBpm(name: string): MetaEventName | null {
  const map: Record<string, MetaEventName> = {
    assessment_started: "QuizStart", chat_start: "QuizStart", quiz_progress: "QuizProgress",
    healthscore_viewed: "ViewContent", formulation_page_viewed: "ViewContent",
    line_connected: "Contact", customer_line_connected: "Contact",
    marketing_offer_selected: "SelectOffer", marketing_basket_added: "AddToCart",
    marketing_checkout_ready: "InitiateCheckout"
  };
  return map[name] ?? null;
}
