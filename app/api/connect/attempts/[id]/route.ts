import { after, NextResponse } from "next/server";
import { getConnectAttempt, flushConnectMeta } from "@/lib/connect-verification";
import { uuidPattern } from "@/lib/meta-event-policy";
import { enforceRateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const limited = enforceRateLimit(request, { name: "connect-status", limit: 150, windowMs: 60000 });
  if (limited) { limited.headers.set("Cache-Control", "no-store"); return limited; }
  try {
    const attempt = await getConnectAttempt(request, id);
    if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    if (attempt.status === "verified") {
      try { after(async () => { try { await flushConnectMeta(id); } catch { console.warn("[connect] Event delivery pending"); } }); }
      catch { console.warn("[connect] Event delivery scheduling unavailable"); }
    }
    return NextResponse.json(attempt, { headers });
  } catch { return NextResponse.json({ error: "Confirmation unavailable" }, { status: 503, headers }); }
}
