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

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);

  headers.set("Cache-Control", "no-store, max-age=0");

  return NextResponse.json(body, {
    ...init,
    headers
  });
}

export async function GET(request: Request, { params }: FormulationRouteProps) {
  const { planId } = await params;
  const locale = new URL(request.url).searchParams.get("locale");
  const snapshot = await getStoredAssessmentSnapshot(planId);

  if (!snapshot) {
    return jsonNoStore({ message: "Plan not found" }, { status: 404 });
  }

  const storedResult = await getStoredFormulationResult(planId, {
    locale,
    mode: "full"
  });

  if (storedResult) {
    return jsonNoStore(storedResult);
  }

  if (snapshot.status === "ready") {
    return jsonNoStore(
      {
        message: "Formulation result is missing or invalid",
        status: snapshot.status,
        steps: snapshot.steps
      },
      { status: 409 }
    );
  }

  const previewResult = await getStoredFormulationResult(planId, {
    locale,
    mode: "preview"
  });

  if (previewResult) {
    return jsonNoStore(previewResult);
  }

  if (snapshot.status === "failed") {
    return jsonNoStore(
      {
        message: "Formulation processing failed",
        status: snapshot.status,
        steps: snapshot.steps
      },
      { status: 500 }
    );
  }

  return jsonNoStore(
    {
      message: "Formulation is still being prepared",
      status: snapshot.status,
      steps: snapshot.steps
    },
    { status: 202 }
  );
}
