import { NextResponse } from "next/server";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { isPaymentScenario, simulatePayment } from "@/lib/agentic/qa/simulate";
import { nowIso } from "@/lib/agentic/runtime";
import { isOpaqueCapabilityHandle } from "@/lib/agentic/capabilities";
import { redactedOrderCounts } from "@/lib/agentic/qa/counts";
import { resolveCapability } from "@/lib/agentic/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.UAT_PAYMENT_FIXTURE_TOKEN?.trim();

  if (!expected) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (runtime.config.environment !== "uat" || runtime.config.paymentProvider !== "stripe_test") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (runtime.config.internalQaHarness) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Parse error" }, { status: 400 });
  }

  const record = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { orderHandle?: unknown; scenario?: unknown; orderId?: unknown })
    : {};

  if ("orderId" in record && !("orderHandle" in record)) {
    return NextResponse.json(
      { message: "Use orderHandle only. Never send raw order IDs." },
      { status: 400 }
    );
  }

  const orderHandle = String(record.orderHandle ?? "");
  const scenario = record.scenario;

  if (!isOpaqueCapabilityHandle(orderHandle) || !isPaymentScenario(scenario)) {
    return NextResponse.json({ message: "orderHandle and scenario are required." }, { status: 400 });
  }

  const simulated = await simulatePayment({
    config: runtime.config,
    now: nowIso(),
    orderHandle,
    scenario,
    scope: runtime.scope,
    store: runtime.store
  });
  const capability = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: orderHandle,
    now: nowIso(),
    resourceType: "order",
    scope: runtime.scope,
    store: runtime.store
  });

  if (!capability) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const counts = await redactedOrderCounts({ orderId: capability.resourceId, runtime });
  return NextResponse.json(
    { ok: true, scenario, simulated: Boolean(simulated), ...counts },
    { headers: { "Cache-Control": "no-store" } }
  );
}
