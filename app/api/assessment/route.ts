import { NextResponse } from "next/server";
import { createAssessmentJob } from "@/lib/assessment-jobs";

export async function POST(request: Request) {
  let plan: unknown = "free";

  try {
    const body = (await request.json()) as { plan?: unknown };
    plan = body.plan;
  } catch {
    plan = "free";
  }

  const snapshot = createAssessmentJob(plan);

  return NextResponse.json(snapshot);
}
