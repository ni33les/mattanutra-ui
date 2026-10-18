import { NextResponse } from "next/server";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { metaConfig } from "@/lib/meta-config";
import { META_EVENTS, META_AUTHORITATIVE_EVENTS, metaCustomData, metaEventEnabled, metaRequestOriginAllowed, sanitiseMetaUrl, uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import { enqueueMetaEvent, metaMatchingFromRequest, recordMetaCheckout, requestMetaContext } from "@/lib/meta-tracking";
import { metaCampaignAttribution } from "@/lib/meta-attribution";
import { AMOUNT_MICROS_PER_UNIT } from "@/lib/stripe-payment-config";
export const runtime = "nodejs";
const authoritativeNames = META_AUTHORITATIVE_EVENTS;
const receiptWindowMs = 10 * 60_000;

/** Browser copies read confirmed server milestones; they cannot author those milestones. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, { name: "meta-event-receipts", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const config = metaConfig();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const empty = { environment: config.environment, pixelId: config.pixelId, events: [] };
  if (request.headers.get("sec-fetch-site") === "cross-site"
    || request.headers.has("origin") && !metaRequestOriginAllowed(request, config.environment)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  }
  if (!config.enabled) return NextResponse.json(empty, { headers });
  const now = Date.now();
  const after = new URL(request.url).searchParams.get("after");
  const requestedSince = after === null ? now - receiptWindowMs : Date.parse(after);
  if (after !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(after)
    || !Number.isFinite(requestedSince) || requestedSince > now)) {
    return NextResponse.json({ error: "Invalid receipt window" }, { status: 400, headers });
  }
  try {
    const sql = getSql(); if (!sql) throw new Error("Database unavailable");
    const context = await requestMetaContext(request, sql);
    if (!context) return NextResponse.json(empty, { headers });
    // Recheck stored consent in the query; never expose another visitor/environment's records.
    // A rejected CAPI delivery is still a real milestone eligible for browser fallback.
    const events = await sql`select e.id,e.event_name,e.occurred_at,e.custom_data
      from public.meta_conversion_events e join public.meta_tracking_contexts c on c.id=e.context_id
      where e.context_id=${context.id}::uuid and e.environment=${config.environment} and e.pixel_id=${config.pixelId}
        and c.environment=${config.environment} and c.consent_granted and c.expires_at>now()
        and e.event_name=any(${[...authoritativeNames]}) and e.status<>'suppressed'
        and e.occurred_at>=${new Date(Math.max(requestedSince, now - receiptWindowMs))} and e.occurred_at<=${new Date(now)}
      order by e.occurred_at desc,e.id desc limit 50`;
    return NextResponse.json({ ...empty, events: events.map(event => {
      const raw = event.custom_data && typeof event.custom_data === "object" && !Array.isArray(event.custom_data) ? event.custom_data : {};
      return { eventId: event.id, name: event.event_name, occurredAt: new Date(event.occurred_at).toISOString(),
        data: metaCustomData(event.event_name as MetaEventName, { ...raw, planId: raw.plan_id, stage: raw.funnel_stage }, config.environment) };
    }) }, { headers });
  } catch { return NextResponse.json({ error: "Could not load campaign receipts" }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.bpmPost); if (limited) return limited;
  const config = metaConfig();
  if (!metaRequestOriginAllowed(request, config.environment)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!config.enabled) return NextResponse.json({ accepted: false, reason: "disabled" });
  if (Number(request.headers.get("content-length")) > 8192) return NextResponse.json({ error: "Event too large" }, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 8192) return NextResponse.json({ error: "Event too large" }, { status: 413 });
    const body = JSON.parse(raw);
    if (!META_EVENTS.includes(body.name) || !metaEventEnabled(body.name) || authoritativeNames.includes(body.name) || !uuidPattern.test(body.eventId || "") || !uuidPattern.test(body.sessionId || "")) {
      return NextResponse.json({ error: "Invalid browser milestone" }, { status: 400 });
    }
    const sourceUrl = sanitiseMetaUrl(body.sourceUrl, config.environment);
    if (!sourceUrl) return NextResponse.json({ error: "Ineligible source page" }, { status: 400 });
    const sql = getSql(); if (!sql) throw new Error("Database unavailable");
    const context = await requestMetaContext(request, sql);
    if (!context) return NextResponse.json({ accepted: false, reason: "consent_required" });
    const name = body.name as MetaEventName;
    const data = metaCustomData(name, body.data, config.environment);
    const attemptId = typeof body.attemptId === "string" && uuidPattern.test(body.attemptId) ? body.attemptId : null;
    if (name === "InitiateCheckout" && !attemptId) return NextResponse.json({ error: "Checkout attempt required" }, { status: 400 });
    const dimension = String(data.funnel_stage).startsWith("connect") ? `${data.provider || ""}:${data.locale || ""}:` : "";
    const key = name === "InitiateCheckout" ? `checkout:${attemptId}` : name === "PageView" || name === "AddToCart" ? body.eventId
      : `${body.sessionId}:${data.plan_id || "visit"}:${name}:${dimension}${data.progress ?? data.offer ?? data.funnel_stage ?? ""}`;
    const receipt = await withDatabaseTransaction(sql, async tx => {
      // Serialize capture against other tabs before taking the event's attribution snapshot.
      const [current] = await tx`select matching,attribution,consent_granted,expires_at from public.meta_tracking_contexts where id=${context.id}::uuid for update`;
      if (!current?.consent_granted || new Date(current.expires_at).getTime() <= Date.now()) return null;
      // A browser attempt ID is only a lookup key. A usable provider session and
      // its binding must already exist before it can recover a checkout receipt.
      const checkout = name === "InitiateCheckout" ? (await tx<Array<{
        type: "payment" | "retail"; id: string; plan_id: string | null; amount: number | string;
        currency: string; locale: string; selected_plan: string | null; status: string;
      }>>`select 'payment' as type,p.id,p.plan_id,p.amount,p.currency,p.locale,p.selected_plan::text,p.status
        from public.payments p join public.meta_tracking_bindings b on b.resource_type='payment' and b.resource_id=p.id::text
        where p.id=${attemptId}::uuid and b.context_id=${context.id}::uuid
          and nullif(trim(p.stripe_checkout_session_id),'') is not null and p.status<>'created'
          and p.amount>0 and p.amount_unit='micros' and p.currency ~ '^[A-Z]{3}$'
        union all
        select 'retail' as type,p.id,p.plan_id,p.amount,p.currency,p.locale,null::text as selected_plan,p.status
        from public.retail_checkout_payments p join public.meta_tracking_bindings b on b.resource_type='retail' and b.resource_id=p.id::text
        where p.id=${attemptId}::uuid and b.context_id=${context.id}::uuid
          and nullif(trim(p.stripe_checkout_session_id),'') is not null and p.status<>'created'
          and p.amount>0 and p.amount_unit='micros' and p.currency ~ '^[A-Z]{3}$'`)[0] : null;
      if (name === "InitiateCheckout" && !checkout) return null;
      const matching = metaMatchingFromRequest(request, body.sourceUrl, current?.matching);
      const campaign = metaCampaignAttribution(body.sourceUrl, config.environment, current?.attribution,
        !!matching.fbc && matching.fbc !== current?.matching?.fbc);
      await tx`update public.meta_tracking_contexts set matching=matching || ${tx.json(matching)},attribution=${tx.json(campaign)},updated_at=now()
        where id=${context.id}::uuid and consent_granted`;
      // Recover a lost response without losing native delivery or changing verified checkout values.
      const [existing] = await tx`select id,custom_data,status from public.meta_conversion_events
        where environment=${config.environment} and pixel_id=${config.pixelId} and event_name=${name}
          and source_key=${`browser:${key}`} and context_id=${context.id}::uuid`;
      if (existing) return checkout && existing.status === "suppressed" ? null : { eventId: existing.id as string, data: existing.custom_data };
      if (checkout) {
        if (!["checkout_session_created", "checkout_opened", "processing"].includes(checkout.status)) return null;
        await recordMetaCheckout(tx, { type: checkout.type, id: checkout.id, planId: checkout.plan_id,
          amount: Number(checkout.amount) / AMOUNT_MICROS_PER_UNIT, currency: checkout.currency,
          locale: checkout.locale, selectedPlan: checkout.selected_plan });
        // A concurrent server capture may have won the unique source key. Read
        // its receipt too, so both copies always use the same server event ID.
        const [captured] = await tx`select id,custom_data from public.meta_conversion_events
          where environment=${config.environment} and pixel_id=${config.pixelId} and event_name=${name}
            and source_key=${`browser:${key}`} and context_id=${context.id}::uuid and status<>'suppressed'`;
        return captured ? { eventId: captured.id as string, data: captured.custom_data } : null;
      }
      const eventId = await enqueueMetaEvent(tx, { context: { ...context, attribution: campaign, matching: { ...current.matching, ...matching } }, name,
        sourceKey: `browser:${key}`, eventId: body.eventId, sourceUrl, data: { ...data, planId: data.plan_id, stage: data.funnel_stage } });
      if (!eventId) return null;
      const [captured] = await tx`select custom_data from public.meta_conversion_events where id=${eventId}::uuid`;
      return { eventId, data: captured.custom_data };
    });
    return NextResponse.json({ accepted: !!receipt, eventId: receipt?.eventId ?? null, ...(receipt ? { data: receipt.data } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not record campaign event" }, { status: 503 }); }
}
