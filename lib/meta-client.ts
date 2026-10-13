"use client";
import { journeyChannelForPath } from "@/lib/journey-channel";
import type { MetaBootstrapPageView } from "@/lib/meta-pixel-bootstrap";
import { META_CONSENT_COOKIE, browserPixelPageSafe, metaCustomData, metaEventForBpm, metaEventName, type MetaEventName, type MetaPreferenceSource, type MetaPublicConfig, uuidPattern } from "@/lib/meta-event-policy";
let config: MetaPublicConfig | null = null;
const sent = new Set<string>();
const pending = new Map<string, Promise<void>>();
export const marketingGranted = () => typeof document !== "undefined" && document.cookie.split(";").some(c => c.trim() === `${META_CONSENT_COOKIE}=granted`);
export const marketingPreferenceSaved = () => typeof document !== "undefined" && document.cookie.split(";").some(c => /^mn_marketing=(granted|denied)$/.test(c.trim()));
export const META_PREFERENCE_CHANGED = "mn:marketing-preference-changed";

export async function saveMarketingPreference(granted: boolean, source: MetaPreferenceSource = "explicit") {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("/api/marketing/consent", { method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "content-type": "application/json" }, body: JSON.stringify({ granted, source, sourceUrl: location.href }) });
    if (!response.ok) throw new Error("Could not save advertising preference");
    const saved = await response.json();
    if (typeof saved.granted !== "boolean") throw new Error("Invalid advertising preference response");
    if (saved.granted && !marketingGranted()) throw new Error("Advertising preference cookie was not saved");
    if (saved.granted && !document.cookie.split(";").some(c => c.trim().startsWith("_fbp="))) {
      document.cookie = `_fbp=fb.1.${Date.now()}.${crypto.getRandomValues(new Uint32Array(1))[0]}; Max-Age=${90 * 86400}; Path=/; SameSite=Lax; Secure`;
    }
    if (!saved.granted) {
      window.fbq?.("consent", "revoke");
      for (const name of ["_fbp", "_fbc"]) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
    window.dispatchEvent(new Event(META_PREFERENCE_CHANGED));
    return saved.granted as boolean;
  } finally { clearTimeout(timer); }
}
const waiting: Array<() => void> = [];
export function configureMetaClient(value: MetaPublicConfig) { config = value; for (const send of waiting.splice(0)) send(); }
function sessionId() {
  const key = "mn:marketing:session";
  try { const existing = sessionStorage.getItem(key); if (existing) return existing;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, id); return id;
  } catch { return fallbackSession ??= crypto.randomUUID(); }
}
let fallbackSession: string | undefined;

async function captureEvent(body: string) {
  const delays = [500, 1500];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (!marketingGranted()) return null;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/marketing/events", { method: "POST", credentials: "same-origin", keepalive: true,
        signal: controller.signal, headers: { "content-type": "application/json" }, body });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) return null;
    } catch { /* A lost response can be retried with the same event ID. */ }
    finally { clearTimeout(timer); }
    if (attempt < delays.length) await new Promise(resolve => setTimeout(resolve, delays[attempt]));
  }
  return null;
}

export function trackMetaEvent(name: MetaEventName, input: Record<string, unknown> = {}, occurrence?: string,
  sourceUrl = typeof window === "undefined" ? "" : location.href, bootstrap?: MetaBootstrapPageView) {
  if (!config && typeof window !== "undefined" && (!marketingPreferenceSaved() || marketingGranted()) && waiting.length < 20) {
    return new Promise<void>(resolve => { waiting.push(() => { void trackMetaEvent(name, input, occurrence, sourceUrl, bootstrap).then(resolve); }); });
  }
  if (!config?.enabled || !marketingGranted() || typeof window === "undefined" || /\/(admin|api)(\/|$)/.test(location.pathname)) return Promise.resolve();
  const { environment: env, pixelId } = config;
  const id = typeof input.assessmentAttemptId === "string" && uuidPattern.test(input.assessmentAttemptId) ? input.assessmentAttemptId : sessionId();
  const data = metaCustomData(name, { channel: journeyChannelForPath(new URL(sourceUrl).pathname), ...input }, env);
  const dimension = String(data.funnel_stage).startsWith("connect") ? `${data.provider || ""}:${data.locale || ""}:` : "";
  const key = occurrence || (name === "InitiateCheckout" && input.attemptId ? `checkout:${input.attemptId}`
    : `${id}:${name}:${data.plan_id || "visit"}:${dimension}${data.progress ?? data.offer ?? data.funnel_stage ?? ""}`);
  if (sent.has(key)) return Promise.resolve();
  if (pending.has(key)) return pending.get(key)!;
  // The parser already sent the first PageView. Reuse its ID for CAPI and never
  // replay its native copy after hydration, including capture retries.
  const headerPageView = name === "PageView" && bootstrap?.sourceUrl === sourceUrl
    && bootstrap.environment === env && bootstrap.pixelId === pixelId && uuidPattern.test(bootstrap.eventId);
  const eventId = headerPageView ? bootstrap.eventId : crypto.randomUUID();
  const work = (async () => {
    try {
      const receipt = await captureEvent(JSON.stringify({ name, eventId, sessionId: id, attemptId: input.attemptId, sourceUrl,
        data: { ...data, planId: data.plan_id, stage: data.funnel_stage } }));
      if (receipt?.accepted !== true || typeof receipt.eventId !== "string" || !uuidPattern.test(receipt.eventId)) return;
      sent.add(key);
      if (!headerPageView && marketingGranted() && location.href === sourceUrl && browserPixelPageSafe(location.href, document.referrer, env) && window.fbq) {
        const nativeData = receipt.data && typeof receipt.data === "object"
          ? metaCustomData(name, { ...receipt.data, planId: receipt.data.plan_id, stage: receipt.data.funnel_stage }, env) : data;
        window.fbq(env === "prd" && ["PageView", "ViewContent", "Contact", "AddToCart", "InitiateCheckout"].includes(name) ? "trackSingle" : "trackSingleCustom",
          pixelId, metaEventName(name, env), nativeData, { eventID: receipt.eventId });
      }
    } catch { /* Tracking never blocks the customer journey. */ }
    finally { pending.delete(key); }
  })();
  pending.set(key, work);
  return work;
}

export function trackMetaBpm(name: string, input: { locale?: string; planId?: string | null; properties?: Record<string, unknown>; valueAmount?: number; valueCurrency?: string }) {
  const event = metaEventForBpm(name); if (!event) return;
  const p = input.properties ?? {};
  void trackMetaEvent(event, { locale: input.locale, planId: input.planId, value: input.valueAmount, currency: input.valueCurrency,
    progress: p.progress, offer: p.offer, attemptId: p.attemptId, assessmentAttemptId: p.sessionId, stage: name.includes("checkout") ? "checkout" : name.includes("viewed") ? "results" : "assessment",
    channel: p.journeyChannel ?? p.channel ?? journeyChannelForPath(location.pathname) });
}
