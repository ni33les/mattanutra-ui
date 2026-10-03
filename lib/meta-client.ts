"use client";
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

export function trackMetaEvent(name: MetaEventName, input: Record<string, unknown> = {}, occurrence?: string) {
  if (!config && typeof window !== "undefined" && (!marketingPreferenceSaved() || marketingGranted()) && waiting.length < 20) {
    return new Promise<void>(resolve => { waiting.push(() => { void trackMetaEvent(name, input, occurrence).then(resolve); }); });
  }
  if (!config?.enabled || !marketingGranted() || typeof window === "undefined" || /\/(admin|api)(\/|$)/.test(location.pathname)) return Promise.resolve();
  const env = config.environment, id = typeof input.assessmentAttemptId === "string" && uuidPattern.test(input.assessmentAttemptId) ? input.assessmentAttemptId : sessionId();
  const data = metaCustomData(name, input, env);
  const dimension = String(data.funnel_stage).startsWith("connect") ? `${data.provider || ""}:${data.locale || ""}:` : "";
  const key = occurrence || `${id}:${name}:${data.plan_id || "visit"}:${dimension}${data.progress ?? data.offer ?? data.funnel_stage ?? ""}`;
  if (sent.has(key)) return Promise.resolve();
  if (pending.has(key)) return pending.get(key)!;
  const eventId = crypto.randomUUID();
  const work = (async () => {
    try {
      const response = await fetch("/api/marketing/events", { method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ name, eventId, sessionId: id, attemptId: input.attemptId, sourceUrl: location.href,
          data: { ...data, planId: data.plan_id, stage: data.funnel_stage } }) });
      if (!response.ok) return;
      const receipt = await response.json();
      sent.add(key);
      if (receipt.accepted && marketingGranted() && browserPixelPageSafe(location.href, document.referrer, env) && window.fbq) {
        window.fbq(env === "prd" && ["PageView", "ViewContent", "Contact", "AddToCart", "InitiateCheckout"].includes(name) ? "trackSingle" : "trackSingleCustom",
          config!.pixelId, metaEventName(name, env), data, { eventID: receipt.eventId });
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
    progress: p.progress, offer: p.offer, attemptId: p.attemptId, assessmentAttemptId: p.sessionId, stage: name.includes("checkout") ? "checkout" : name.includes("viewed") ? "results" : "assessment", channel: p.channel });
}
