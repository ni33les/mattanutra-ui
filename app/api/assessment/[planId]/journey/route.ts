import { isLocale } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import {
  getHealthScoreCopySnapshot,
  getNutritionJourneySnapshot
} from "@/lib/nutrition-journey-read";

type JourneyRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export const runtime = "nodejs";

export async function GET(
  request: Request,
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

  const query = new URL(request.url).searchParams;
  const requestedLocale = query.get("locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : undefined;
  const copyView = query.get("view") === "copy";
  const snapshot = copyView
    ? await getHealthScoreCopySnapshot(planId, locale)
    : await getNutritionJourneySnapshot(planId, locale);

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
