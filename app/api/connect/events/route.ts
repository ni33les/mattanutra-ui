import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { connectBrowserEvents, connectCampaign, isConnectProvider } from "@/lib/connect";
import { metaConfig } from "@/lib/meta-config";
import { metaRequestOriginAllowed, uuidPattern } from "@/lib/meta-event-policy";
import { enforceRateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const environment = metaConfig().environment;
  if (!metaRequestOriginAllowed(request, environment)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const limited = enforceRateLimit(request, { name: "connect-events", limit: 90, windowMs: 60000 });
  if (limited) return limited;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Too large" }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!connectBrowserEvents.includes(body.name) || !isLocale(body.locale) || !uuidPattern.test(body.id || "") || !uuidPattern.test(body.visitorId || "")
      || (body.provider != null && !isConnectProvider(body.provider)) || (!["page_viewed", "url_copied"].includes(body.name) && !body.provider))
      return NextResponse.json({ error: "Invalid browser milestone" }, { status: 400, headers });
    const sql = getSql(); if (!sql) throw new Error("Database unavailable");
    await sql`insert into public.connect_funnel_events(id,environment,event_name,provider,locale,visitor_id,campaign)
      values (${body.id}::uuid,${environment},${body.name},${body.provider ?? null},${body.locale},${body.visitorId}::uuid,
        ${sql.json(connectCampaign(typeof body.sourceUrl === "string" ? body.sourceUrl : "/"))}) on conflict(id) do nothing`;
    return NextResponse.json({ accepted: true }, { headers });
  } catch { return NextResponse.json({ error: "Event unavailable" }, { status: 503, headers }); }
}
