import { NextResponse } from "next/server";
import { getStoredFormulationRead } from "@/lib/assessment-store";
import { buildAssessmentSteps } from "@/lib/assessment-snapshot";

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
  const startedAt = Date.now();
  const { planId } = await params;
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale");
  const includeProducts = url.searchParams.get("products") === "1";
  const sqlStartedAt = Date.now();
  const stored = await getStoredFormulationRead(planId, {
    includeProducts,
    locale
  });
  const sqlMs = Date.now() - sqlStartedAt;
  console.info("[formulation:get]", {
    includeProducts,
    planId,
    sqlMs,
    status: stored?.status ?? "missing",
    totalMs: Date.now() - startedAt
  });

  if (!stored) {
    return jsonNoStore({ message: "Plan not found" }, { status: 404 });
  }

  const storedResult = stored.result;

  if (storedResult.supplementBreakdown.length > 0) {
    return jsonNoStore(storedResult);
  }

  const steps = buildAssessmentSteps(stored.status);

  if (stored.status === "ready") {
    return jsonNoStore(
      {
        message: "Formulation result is missing or invalid",
        status: stored.status,
        steps
      },
      { status: 409 }
    );
  }

  if (stored.status === "failed") {
    return jsonNoStore(
      {
        message: "Formulation processing failed",
        status: stored.status,
        steps
      },
      { status: 500 }
    );
  }

  return jsonNoStore(
    {
      message: "Formulation is still being prepared",
      status: stored.status,
      steps
    },
    { status: 202 }
  );
}
