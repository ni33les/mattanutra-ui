"use client";
import { marketingGranted } from "@/lib/meta-client";
import { META_AUTHORITATIVE_EVENTS, browserPixelPageSafe, metaCustomData, metaEventName, uuidPattern, type MetaEventName, type MetaPublicConfig } from "@/lib/meta-event-policy";

const authoritativeNames = new Set<MetaEventName>(META_AUTHORITATIVE_EVENTS);
const memory = new Map<string, Record<string, number>>();
const retentionMs = 24 * 60 * 60_000;

function eligible(config: MetaPublicConfig, signal?: AbortSignal) {
  return !signal?.aborted && config.enabled && typeof window !== "undefined" && marketingGranted()
    && document.visibilityState !== "hidden" && browserPixelPageSafe(location.href, document.referrer, config.environment)
    // A blocked SDK leaves only the stub. Keep receipts retryable until it loads.
    && typeof window.fbq?.callMethod === "function";
}

function remembered(key: string) {
  let entries = memory.get(key) ?? {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) entries = { ...entries, ...saved };
  } catch { /* Storage may be unavailable in privacy modes. */ }
  return Object.fromEntries(Object.entries(entries)
    .filter(([id, time]) => uuidPattern.test(id) && typeof time === "number" && time > Date.now() - retentionMs)
    .sort((a, b) => b[1] - a[1]).slice(0, 200));
}

/** Deliver only verified server receipts, using their original CAPI event IDs. */
export async function deliverMetaReceipts(config: MetaPublicConfig, signal?: AbortSignal) {
  if (!eligible(config, signal)) return;
  try {
    const response = await fetch("/api/marketing/events", { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) return;
    const result = await response.json();
    if (result?.environment !== config.environment || result?.pixelId !== config.pixelId || !Array.isArray(result.events)) return;
    const key = `mn:meta:delivered:${config.environment}:${config.pixelId}`;
    const send = () => {
      const delivered = remembered(key);
      for (const receipt of result.events.slice(0, 50).reverse()) {
        if (!eligible(config, signal)) break;
        if (!receipt || !uuidPattern.test(receipt.eventId ?? "") || !authoritativeNames.has(receipt.name)
          || !Number.isFinite(Date.parse(receipt.occurredAt)) || delivered[receipt.eventId]) continue;
        const raw = receipt.data;
        const data = metaCustomData(receipt.name, { ...raw, planId: raw?.plan_id, stage: raw?.funnel_stage }, config.environment);
        if (receipt.name === "Purchase" && (data.value === undefined || !data.currency || !data.purchase_type)) continue;
        window.fbq!(config.environment === "prd" && ["Purchase", "Lead"].includes(receipt.name) ? "trackSingle" : "trackSingleCustom",
          config.pixelId, metaEventName(receipt.name, config.environment), data, { eventID: receipt.eventId });
        delivered[receipt.eventId] = Date.now();
        memory.set(key, delivered);
        try { localStorage.setItem(key, JSON.stringify(delivered)); } catch { /* Same IDs still allow Meta deduplication. */ }
      }
    };
    // Serialize tabs so one confirmed payment produces one browser send.
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(key, { mode: "exclusive", signal }, send);
    } else send();
  } catch { /* Receipt delivery must never interrupt checkout or confirmation. */ }
}

/** Poll while the customer can receive a browser copy; resume after returning from payment. */
export function startMetaReceiptDelivery(config: MetaPublicConfig) {
  let stopped = false, running = false;
  let controller: AbortController | undefined;
  const poll = async () => {
    if (stopped || running || !eligible(config)) return;
    running = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try { await deliverMetaReceipts(config, controller.signal); }
    finally { clearTimeout(timeout); running = false; }
  };
  void poll();
  const initial = setTimeout(() => { void poll(); }, 1000);
  const interval = setInterval(() => { void poll(); }, 5000);
  const visible = () => { if (document.visibilityState !== "hidden") void poll(); else controller?.abort(); };
  document.addEventListener("visibilitychange", visible);
  return () => { stopped = true; controller?.abort(); clearTimeout(initial); clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
}
