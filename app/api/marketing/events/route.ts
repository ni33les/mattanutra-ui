import { NextResponse } from "next/server";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { metaConfig } from "@/lib/meta-config";
import { META_EVENTS, metaCustomData, metaRequestOriginAllowed, sanitiseMetaUrl, uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import { enqueueMetaEvent, metaMatchingFromRequest, requestMetaContext } from "@/lib/meta-tracking";
export const runtime = "nodejs";
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
    if (!META_EVENTS.includes(body.name) || ["Purchase", "Lead", "QuizSubmitted", "EmailCapture", "McpConnectionVerified"].includes(body.name) || !uuidPattern.test(body.eventId || "") || !uuidPattern.test(body.sessionId || "")) {
      return NextResponse.json({ error: "Invalid browser milestone" }, { status: 400 });
    }
    const sourceUrl = sanitiseMetaUrl(body.sourceUrl, config.environment);
    if (!sourceUrl) return NextResponse.json({ error: "Ineligible source page" }, { status: 400 });
    const sql = getSql(); if (!sql) throw new Error("Database unavailable");
    const context = await requestMetaContext(request, sql);
    if (!context) return NextResponse.json({ accepted: false, reason: "consent_required" });
    const name = body.name as MetaEventName;
    const data = metaCustomData(name, body.data, config.environment);
    const matching = metaMatchingFromRequest(request, body.sourceUrl);
    const campaign: Record<string, string> = {};
    try { const url = new URL(body.sourceUrl); for (const key of ["campaign_id", "adset_id", "ad_id", "creative_id"]) {
      const value = url.searchParams.get(key); if (value && /^\d{1,25}$/.test(value)) campaign[key] = value;
    } } catch { /* URL already validated for export. */ }
    const attemptId = typeof body.attemptId === "string" && uuidPattern.test(body.attemptId) ? body.attemptId : null;
    if (name === "InitiateCheckout" && !attemptId) return NextResponse.json({ error: "Checkout attempt required" }, { status: 400 });
    const key = name === "InitiateCheckout" ? `checkout:${attemptId}` : name === "PageView" || name === "AddToCart" ? body.eventId
      : `${body.sessionId}:${data.plan_id || "visit"}:${name}:${data.provider || ""}:${data.locale || ""}:${data.progress ?? data.offer ?? data.funnel_stage ?? ""}`;
    const eventId = await withDatabaseTransaction(sql, async tx => {
      await tx`update public.meta_tracking_contexts set matching=matching || ${tx.json(matching)},attribution=attribution || ${tx.json(campaign)},updated_at=now()
        where id=${context.id}::uuid and consent_granted`;
      return enqueueMetaEvent(tx, { context: { ...context, attribution: { ...context.attribution, ...campaign } }, name,
        sourceKey: `browser:${key}`, eventId: body.eventId, sourceUrl, data: { ...data, planId: data.plan_id, stage: data.funnel_stage } });
    });
    return NextResponse.json({ accepted: !!eventId, eventId }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not record campaign event" }, { status: 503 }); }
}
