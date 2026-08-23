import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { getNutritionJourneySnapshot } from "@/lib/nutrition-journey-read";

type JourneyRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: JourneyRouteProps
) {
  const { planId } = await params;

  if (!isUuid(planId)) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  const snapshot = await getNutritionJourneySnapshot(planId);

  if (!snapshot) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" }
  });
}
