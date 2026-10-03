import { randomUUID } from "node:crypto";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { metaConfig } from "@/lib/meta-config";
import { META_EVENTS, metaCustomData, metaEventName, sanitiseMetaUrl, uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import { metaExternalId } from "@/lib/meta-tracking";

export async function sendMetaEvent(eventId: string, fetchImpl: typeof fetch = fetch) {
  if (!uuidPattern.test(eventId)) throw new Error("Invalid marketing event");
  const sql = getSql(); if (!sql) throw new Error("Database is not configured");
  const config = metaConfig();
  const lease = randomUUID();
  const claimed = await withDatabaseTransaction(sql, async tx => {
    const [event] = await tx`select e.*,c.consent_granted,c.expires_at,c.matching from public.meta_conversion_events e
      join public.meta_tracking_contexts c on c.id=e.context_id where e.id=${eventId}::uuid for update of e`;
    if (!event || ["accepted", "rejected", "suppressed"].includes(event.status)) return { status: event?.status ?? "missing" };
    if (!config.enabled) throw new Error("Campaign delivery is disabled or unconfigured");
    if (!event.consent_granted || new Date(event.expires_at).getTime() <= Date.now() || event.environment !== config.environment || event.pixel_id !== config.pixelId || Date.now() - new Date(event.occurred_at).getTime() > 6 * 86400000) {
      await tx`update public.meta_conversion_events set status='suppressed',response_message='consent_expired_or_destination_changed',updated_at=now() where id=${eventId}::uuid`;
      return { status: "suppressed" };
    }
    if (!META_EVENTS.includes(event.event_name as MetaEventName)) throw new Error("Unrecognised campaign event");
    if (event.lease_until && new Date(event.lease_until).getTime() > Date.now()) throw new Error("Campaign delivery is already running");
    if (event.attempts >= 9) {
      await tx`update public.meta_conversion_events set status='rejected',response_message='retry_limit',updated_at=now() where id=${eventId}::uuid`;
      return { status: "rejected" };
    }
    await tx`update public.meta_conversion_events set status='sending',attempts=attempts+1,lease_id=${lease}::uuid,
      lease_until=now()+interval '30 seconds',updated_at=now() where id=${eventId}::uuid`;
    return { event, status: "sending" };
  });
  if (!("event" in claimed) || !claimed.event) return { status: claimed.status };
  const { event } = claimed;
  // The short claim transaction has committed. Provider I/O never holds database locks.

    const matching: Record<string, string | string[]> = {};
    for (const key of ["em", "ph"] as const) {
      const values = event.matching?.[key];
      if (Array.isArray(values) && values.length && values.every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))) matching[key] = values;
    }
    for (const key of ["fbp", "fbc", "client_ip_address", "client_user_agent"] as const) {
      if (typeof event.matching?.[key] === "string") matching[key] = event.matching[key];
    }
    const raw = event.custom_data;
    const customData = metaCustomData(event.event_name as MetaEventName, {
      ...raw, planId: raw.plan_id, stage: raw.funnel_stage
    }, config.environment);
    if (customData.plan_id) matching.external_id = [metaExternalId(String(customData.plan_id))];
    const payload = { data: [{ event_name: metaEventName(event.event_name as MetaEventName, config.environment),
      event_id: event.id, event_time: Math.floor(new Date(event.occurred_at).getTime() / 1000), action_source: "website",
      event_source_url: sanitiseMetaUrl(event.source_url, config.environment), user_data: matching, custom_data: customData }],
      ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) };
    let status: "accepted" | "retrying" | "rejected" = "retrying", responseCode = 0, message = "network_error";
    try {
      const response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.pixelId}/events`, {
        method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
      });
      responseCode = response.status;
      const result = await response.json().catch(() => null) as { events_received?: number; error?: { code?: number; is_transient?: boolean } } | null;
      status = response.ok && result?.events_received === 1 ? "accepted"
        : response.status === 429 || response.status >= 500 || result?.error?.is_transient ? "retrying" : "rejected";
      message = status === "accepted" ? "events_received:1" : `meta_error:${result?.error?.code ?? response.status}`;
    } catch { /* Never log tokens, matching data or provider response bodies. */ }
    if (status === "retrying" && event.attempts >= 8) { status = "rejected"; message = "retry_limit"; }
    const [receipt] = await sql`update public.meta_conversion_events set status=${status},response_code=${responseCode},response_message=${message},
      lease_id=null,lease_until=null,
      accepted_at=case when ${status === "accepted"} then now() else accepted_at end,updated_at=now() where id=${eventId}::uuid and lease_id=${lease}::uuid and status='sending' returning status`;
    if (!receipt) return { status: "suppressed" };
    if (status === "retrying") throw new Error("Meta temporarily unavailable; retry the same event");
    return { status, responseCode };
}
