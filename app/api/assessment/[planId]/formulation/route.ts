import { NextResponse } from "next/server";
import {
  getStoredAssessmentSnapshot,
  getStoredFormulationResult
} from "@/lib/assessment-store";

type FormulationRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function GET(_request: Request, { params }: FormulationRouteProps) {
  const { planId } = await params;
  const snapshot = await getStoredAssessmentSnapshot(planId);

  if (!snapshot) {
    return NextResponse.json({ message: "Plan not found" }, { status: 404 });
  }

  const storedResult = await getStoredFormulationResult(planId, {
    mode: "full"
  });

  if (storedResult) {
    return NextResponse.json(storedResult);
  }

  if (snapshot.status === "ready") {
    return NextResponse.json(
      {
        message: "Formulation result is missing or invalid",
        status: snapshot.status,
        steps: snapshot.steps
      },
      { status: 409 }
    );
  }

  const previewResult = await getStoredFormulationResult(planId, {
    mode: "preview"
  });

  if (previewResult) {
    return NextResponse.json(previewResult);
  }

  if (snapshot.status === "failed") {
    return NextResponse.json(
      {
        message: "Formulation processing failed",
        status: snapshot.status,
        steps: snapshot.steps
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message: "Formulation is still being prepared",
      status: snapshot.status,
      steps: snapshot.steps
    },
    { status: 202 }
  );
}
