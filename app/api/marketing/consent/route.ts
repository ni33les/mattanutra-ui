import { NextResponse } from "next/server";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { metaPublicConfig } from "@/lib/meta-config";
import { META_CONSENT_COOKIE, META_CONTEXT_COOKIE, metaRequestOriginAllowed } from "@/lib/meta-event-policy";
import { marketingCookie, setMetaPreference } from "@/lib/meta-tracking";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(metaPublicConfig(), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.bpmPost); if (limited) return limited;
  const config = metaPublicConfig();
  if (!metaRequestOriginAllowed(request, config.environment)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.granted !== "boolean") return NextResponse.json({ error: "Choose a marketing preference" }, { status: 400 });
    const source = body.source ?? "explicit";
    if (!["explicit", "site_default"].includes(source) || source === "site_default" && !body.granted) return NextResponse.json({ error: "Invalid preference source" }, { status: 400 });
    if (source === "site_default" && (!config.enabled || marketingCookie(request, META_CONSENT_COOKIE) === "denied")) {
      return NextResponse.json({ granted: false, ...config }, { headers: { "Cache-Control": "no-store" } });
    }
    const { id, granted } = await setMetaPreference(request, body.granted, body.sourceUrl, source);
    const response = NextResponse.json({ granted, ...config }, { headers: { "Cache-Control": "no-store" } });
    const options = { path: "/", sameSite: "lax" as const, secure: config.environment !== "dev" || new URL(request.url).protocol === "https:", maxAge: 90 * 86400 };
    response.cookies.set(META_CONSENT_COOKIE, granted ? "granted" : "denied", options);
    response.cookies.set(META_CONTEXT_COOKIE, id, { ...options, httpOnly: true });
    return response;
  } catch { return NextResponse.json({ error: "Could not save marketing preference" }, { status: 503 }); }
}
