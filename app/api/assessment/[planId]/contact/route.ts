import { NextResponse } from "next/server";
import { updateAssessmentContact } from "@/lib/assessment-capture";
import { funnelErrorResponse } from "@/lib/funnel-errors";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPlanMutation);
  if (limited) return limited;
  try {
    const { planId } = await params;
    const body = await request.json();
    return NextResponse.json(await updateAssessmentContact(planId, body.contactEmail), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return funnelErrorResponse(error); }
}
