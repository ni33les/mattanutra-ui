import { NextResponse } from "next/server";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { metaConfig } from "@/lib/meta-config";
import { META_EVENTS, metaCustomData, metaRequestOriginAllowed, sanitiseMetaUrl, uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import { enqueueMetaEvent, metaMatchingFromRequest, requestMetaContext } from "@/lib/meta-tracking";
import { metaCampaignAttribution } from "@/lib/meta-attribution";
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
    const attemptId = typeof body.attemptId === "string" && uuidPattern.test(body.attemptId) ? body.attemptId : null;
    if (name === "InitiateCheckout" && !attemptId) return NextResponse.json({ error: "Checkout attempt required" }, { status: 400 });
    const dimension = String(data.funnel_stage).startsWith("connect") ? `${data.provider || ""}:${data.locale || ""}:` : "";
    const key = name === "InitiateCheckout" ? `checkout:${attemptId}` : name === "PageView" || name === "AddToCart" ? body.eventId
      : `${body.sessionId}:${data.plan_id || "visit"}:${name}:${dimension}${data.progress ?? data.offer ?? data.funnel_stage ?? ""}`;
    const eventId = await withDatabaseTransaction(sql, async tx => {
      // Serialize capture against other tabs before taking the event's attribution snapshot.
      const [current] = await tx`select matching,attribution,consent_granted,expires_at from public.meta_tracking_contexts where id=${context.id}::uuid for update`;
      if (!current?.consent_granted || new Date(current.expires_at).getTime() <= Date.now()) return null;
      const matching = metaMatchingFromRequest(request, body.sourceUrl, current?.matching);
      const campaign = metaCampaignAttribution(body.sourceUrl, config.environment, current?.attribution,
        !!matching.fbc && matching.fbc !== current?.matching?.fbc);
      await tx`update public.meta_tracking_contexts set matching=matching || ${tx.json(matching)},attribution=${tx.json(campaign)},updated_at=now()
        where id=${context.id}::uuid and consent_granted`;
      return enqueueMetaEvent(tx, { context: { ...context, attribution: campaign, matching: { ...current.matching, ...matching } }, name,
        sourceKey: `browser:${key}`, eventId: body.eventId, sourceUrl, data: { ...data, planId: data.plan_id, stage: data.funnel_stage } });
    });
    return NextResponse.json({ accepted: !!eventId, eventId }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not record campaign event" }, { status: 503 }); }
}
