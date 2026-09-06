import { NextResponse } from "next/server";
import { requestHealthScoreDelivery } from "@/lib/healthscore-delivery";
import { funnelErrorResponse } from "@/lib/funnel-errors";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPlanMutation);
  if (limited) return limited;
  try {
    const { planId } = await params;
    const result = await requestHealthScoreDelivery(planId, await request.json());
    return NextResponse.json(result, { status: result.status === "sent" ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return funnelErrorResponse(error); }
}
