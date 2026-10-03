import { NextResponse } from "next/server";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { metaPublicConfig } from "@/lib/meta-config";
import { META_CONSENT_COOKIE, META_CONTEXT_COOKIE, metaOrigin } from "@/lib/meta-event-policy";
import { setMetaConsent } from "@/lib/meta-tracking";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(metaPublicConfig(), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.bpmPost); if (limited) return limited;
  const origin = request.headers.get("origin"), config = metaPublicConfig();
  if (!origin || ![new URL(request.url).origin, metaOrigin(config.environment)].includes(origin)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.granted !== "boolean") return NextResponse.json({ error: "Choose a marketing preference" }, { status: 400 });
    const id = await setMetaConsent(request, body.granted, body.sourceUrl);
    const response = NextResponse.json({ granted: body.granted, ...config }, { headers: { "Cache-Control": "no-store" } });
    const options = { path: "/", sameSite: "lax" as const, secure: new URL(request.url).protocol === "https:", maxAge: 90 * 86400 };
    response.cookies.set(META_CONSENT_COOKIE, body.granted ? "granted" : "denied", options);
    response.cookies.set(META_CONTEXT_COOKIE, id, { ...options, httpOnly: true });
    return response;
  } catch { return NextResponse.json({ error: "Could not save marketing preference" }, { status: 503 }); }
}
