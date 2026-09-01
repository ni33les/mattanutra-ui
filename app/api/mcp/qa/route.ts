import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { handleQaJsonRpc } from "@/lib/agentic/mcp/qa-dispatcher";
import { authorizeQaRequest } from "@/lib/agentic/qa/auth";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { isPaymentScenario, simulatePayment } from "@/lib/agentic/qa/simulate";
import { nowIso } from "@/lib/agentic/runtime";
import { isOpaqueCapabilityHandle, resolveCapability } from "@/lib/agentic/capabilities";
import { redactedOrderCounts } from "@/lib/agentic/qa/counts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp.qa");

export async function POST(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!runtime.config.internalQaHarness || runtime.config.environment !== "dev") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (!authorizeQaRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(request, publicRateLimits.mcp);

  if (limited) {
    return limited;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: -32700, message: "Parse error" }, jsonrpc: "2.0" },
      { status: 400 }
    );
  }

  if (body && typeof body === "object" && !Array.isArray(body) && !("method" in body)) {
    if ("orderId" in body && !("orderHandle" in body)) {
      return NextResponse.json(
        { message: "Use orderHandle only. Never send raw order IDs." },
        { status: 400 }
      );
    }
  }

  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    !("method" in body) &&
    "orderHandle" in body
  ) {
    const orderHandle = String((body as { orderHandle?: unknown }).orderHandle ?? "");
    const scenario = (body as { scenario?: unknown }).scenario;
    const now = nowIso();

    if (!isOpaqueCapabilityHandle(orderHandle)) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    if (typeof scenario === "string") {
      if (!isPaymentScenario(scenario)) {
        return NextResponse.json({ message: "Unknown scenario." }, { status: 400 });
      }

      await simulatePayment({
        config: runtime.config,
        now,
        orderHandle,
        scenario,
        scope: runtime.scope,
        store: runtime.store
      });
      const capability = await resolveCapability({
        action: "order.read",
        config: runtime.config,
        handle: orderHandle,
        now,
        resourceType: "order",
        scope: runtime.scope,
        store: runtime.store
      });

      if (!capability) {
        return NextResponse.json({ message: "Not found." }, { status: 404 });
      }

      const counts = await redactedOrderCounts({ orderId: capability.resourceId, runtime });
      return NextResponse.json(
        { ok: true, scenario, ...counts },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const capability = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: orderHandle,
      now,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });

    if (!capability) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        ...(await redactedOrderCounts({ orderId: capability.resourceId, runtime }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await handleQaJsonRpc(runtime, body as { method?: string });

    if (!result) {
      return new NextResponse(null, { status: 202 });
    }

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.error("mcp.qa.dispatch_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json(
      { error: { code: -32603, message: "Internal error" }, jsonrpc: "2.0" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!runtime.config.internalQaHarness || runtime.config.environment !== "dev") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      tools: [
        "simulate",
        "evidence",
        "isolationProof",
        "checkoutContinuityProof",
        "latencyProof",
        "packProof"
      ],
      transport: "streamable-http"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
