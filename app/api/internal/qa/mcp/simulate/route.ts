import { NextResponse } from "next/server";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { qaHarnessAvailable } from "@/lib/agentic/config";
import { authorizeQaRequest } from "@/lib/agentic/qa/authorize";
import { nowIso } from "@/lib/agentic/runtime";
import { isPaymentScenario, simulatePayment } from "@/lib/agentic/qa/simulate";
import { isAgenticErrorResult } from "@/lib/agentic/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!qaHarnessAvailable(runtime.config)) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (!authorizeQaRequest(request, runtime.config.environment)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (typeof body.orderHandle !== "string" || !isPaymentScenario(body.scenario)) {
    return NextResponse.json(
      { message: "orderHandle and scenario are required" },
      { status: 400 }
    );
  }

  const result = await simulatePayment({
    config: runtime.config,
    now: nowIso(),
    orderHandle: body.orderHandle,
    scenario: body.scenario,
    scope: runtime.scope,
    store: runtime.store
  });

  return NextResponse.json(result, {
    status: isAgenticErrorResult(result) ? 404 : 200,
    headers: { "Cache-Control": "no-store" }
  });
}
