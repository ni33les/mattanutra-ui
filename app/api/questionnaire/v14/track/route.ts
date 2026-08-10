import { NextResponse } from "next/server";
import { trackV14Event } from "@/lib/questionnaire/v14/adapter";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MN_CONFIG.trackEndpoint target for v14 sendBeacon analytics.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.bpmPost);
  if (limited) {
    return limited;
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    await trackV14Event(body, { request });
  } catch (error) {
    console.warn("v14 track failed", error);
  }

  // Always 204/200 so sendBeacon is happy
  return new NextResponse(null, {
    headers: { "Cache-Control": "no-store" },
    status: 204
  });
}
