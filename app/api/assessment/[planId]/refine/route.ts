import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import { enqueueNutritionPlanRefinementTask } from "@/lib/task-worker";

type RefinePlanRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: RefinePlanRouteProps
) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.assessmentPlanMutation
  );

  if (limited) {
    return limited;
  }

  const { planId } = await params;
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return NextResponse.json({ message: "Plan not found" }, { status: 404 });
  }

  const planRows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.assessments
      where plan_id = ${planId}::uuid
        and selected_plan is not null
    ) as exists
  `;

  if (planRows[0]?.exists !== true) {
    return NextResponse.json({ message: "Plan not found" }, { status: 404 });
  }

  const queued = await enqueueNutritionPlanRefinementTask({
    planId,
    requestedBy: "gui"
  });

  if (!queued.taskId) {
    return NextResponse.json(
      { message: queued.reason ?? "Unable to refine plan" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    taskId: queued.taskId
  });
}
