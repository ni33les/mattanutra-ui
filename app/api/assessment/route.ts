import { NextResponse } from "next/server";
import { captureAssessment } from "@/lib/assessment-capture";
import { funnelErrorResponse } from "@/lib/funnel-errors";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPost);
  if (limited) return limited;
  try {
    const body = await request.json();
    const receipt = await captureAssessment(body, { idempotencyKey: request.headers.get("Idempotency-Key") ?? "" });
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return funnelErrorResponse(error); }
}
