import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { normalizeProductStackPreference } from "@/lib/product-recommendations";
import {
  enqueueFoodGapSupportTask,
  enqueueProductRecommendationsTask
} from "@/lib/task-worker";

type ProductRecommendationsRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: ProductRecommendationsRouteProps
) {
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

  const body = await request.json().catch(() => ({}));
  const stackPreference = normalizeProductStackPreference(
    body && typeof body === "object" && "stackPreference" in body
      ? (body as Record<string, unknown>).stackPreference
      : null
  );
  const taskId = await enqueueProductRecommendationsTask({
    forceNew: true,
    planId,
    stackPreference
  });

  if (!taskId) {
    return NextResponse.json(
      { message: "Unable to queue product matching" },
      { status: 409 }
    );
  }

  await enqueueFoodGapSupportTask({
    dependsOnTaskId: taskId,
    forceNew: true,
    parentTaskId: taskId,
    planId,
    source: "product_recommendations_request"
  });

  return NextResponse.json({
    stackPreference,
    taskId
  });
}
