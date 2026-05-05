import { NextResponse } from "next/server";
import { getAssessmentJobSnapshot } from "@/lib/assessment-jobs";

type AssessmentStatusRouteProps = Readonly<{
  params: Promise<{
    jobId: string;
  }>;
}>;

export async function GET(_request: Request, { params }: AssessmentStatusRouteProps) {
  const { jobId } = await params;
  const snapshot = getAssessmentJobSnapshot(jobId);

  if (!snapshot) {
    return NextResponse.json(
      { message: "Assessment job not found" },
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
