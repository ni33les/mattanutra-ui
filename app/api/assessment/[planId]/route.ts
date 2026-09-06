import { NextResponse } from "next/server";
import { getStoredAssessmentSnapshot, getStoredHealthScoreAnalysisSnapshot } from "@/lib/assessment-store";
import { captureAssessment } from "@/lib/assessment-capture";
import { funnelErrorResponse } from "@/lib/funnel-errors";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
export const runtime = "nodejs";
type AssessmentStatusRouteProps = Readonly<{ params: Promise<{ planId: string }> }>;

export async function GET(
  request: Request,
  { params }: AssessmentStatusRouteProps
) {
  const { planId } = await params;
  const url = new URL(request.url);
  const healthScoreView = url.searchParams.get("view") === "healthscore";

  const snapshot = healthScoreView
    ? await getStoredHealthScoreAnalysisSnapshot(planId)
    : await getStoredAssessmentSnapshot(planId);

  if (!snapshot) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function PATCH(request: Request, { params }: AssessmentStatusRouteProps) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPlanMutation);
  if (limited) return limited;
  try {
    const { planId } = await params;
    const receipt = await captureAssessment(await request.json(), { planId, idempotencyKey: request.headers.get("Idempotency-Key") ?? "" });
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return funnelErrorResponse(error); }
}
