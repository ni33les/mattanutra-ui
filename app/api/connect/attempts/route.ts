import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isLocale } from "@/lib/i18n";
import { isConnectProvider } from "@/lib/connect";
import { connectCookieName, connectIsLocalRequest, connectServerUrl, createConnectAttempt } from "@/lib/connect-verification";
import { metaConfig } from "@/lib/meta-config";
import { metaRequestOriginAllowed, uuidPattern } from "@/lib/meta-event-policy";
import { enforceRateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  const environment = metaConfig().environment;
  if (!metaRequestOriginAllowed(request, environment)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const limited = enforceRateLimit(request, { name: "connect-attempt", limit: 20, windowMs: 3600000 });
  if (limited) { limited.headers.set("Cache-Control", "no-store"); return limited; }
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!isConnectProvider(body.provider) || !isLocale(body.locale) || (body.visitorId !== undefined && !uuidPattern.test(body.visitorId)))
      return NextResponse.json({ error: "Invalid connection attempt" }, { status: 400, headers });
    const { owner, attempt } = await createConnectAttempt(request, { ...body, visitorId: body.visitorId || randomUUID() });
    const response = NextResponse.json(attempt, { status: 201, headers });
    const localDev = connectIsLocalRequest(request);
    response.cookies.set(connectCookieName(environment), owner, { httpOnly: true, secure: !localDev, sameSite: "lax", path: "/", maxAge: 2 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "Confirmation unavailable", connectionUrl: connectServerUrl(request) }, { status: 503, headers }); }
}
