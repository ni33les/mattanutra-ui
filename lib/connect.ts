import type { Locale } from "@/lib/i18n";

export const connectProviders = ["claude", "perplexity", "chatgpt", "grok"] as const;
export type ConnectProvider = typeof connectProviders[number];
export const isConnectProvider = (value: unknown): value is ConnectProvider => connectProviders.includes(value as ConnectProvider);
export const providerNames: Record<ConnectProvider, string> = { claude: "Claude", perplexity: "Perplexity", chatgpt: "ChatGPT", grok: "Grok" };
export const connectBrowserEvents = ["page_viewed", "provider_selected", "url_copied", "provider_opened", "prompt_copied"] as const;
export type ConnectBrowserEvent = typeof connectBrowserEvents[number];
export type ConnectAttempt = { id: string; expiresAt: string; connectionUrl: string; status: "pending" | "verified" | "expired" };
export const connectCampaignKeys = ["campaign_id", "adset_id", "ad_id", "creative_id"] as const;

/** Carry campaign identifiers, never arbitrary query strings, prompts or setup tokens. */
export function connectCampaign(value: string | URLSearchParams) {
  const params = typeof value === "string" ? new URL(value, "https://mattanutra.com").searchParams : value;
  const result: Record<string, string> = {};
  for (const key of connectCampaignKeys) {
    const item = params.get(key);
    if (item && /^\d{1,25}$/.test(item)) result[key] = item;
  }
  return result;
}

export function connectHref(locale: Locale, provider?: ConnectProvider, search = "") {
  const params = new URLSearchParams(connectCampaign(new URLSearchParams(search)));
  // Preserve Meta's opaque click identifier within the funnel; it is never custom event data.
  const click = new URLSearchParams(search).get("fbclid");
  if (click && /^[\w-]{1,500}$/.test(click)) params.set("fbclid", click);
  return `/${locale}/connect${provider ? `/${provider}` : ""}${params.size ? `?${params}` : ""}`;
}
