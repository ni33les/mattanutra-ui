import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { handleQaJsonRpc } from "@/lib/agentic/mcp/qa-dispatcher";
import { authorizeQaRequest } from "@/lib/agentic/qa/authorize";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import {
  isFulfilmentStatus,
  isPaymentScenario,
  observeQaJourney,
  simulateFulfilment,
  simulatePayment
} from "@/lib/agentic/qa/simulate";
import { qaPreflight } from "@/lib/agentic/qa/preflight";
import { beginQaRun, resetQaRun, setQaChannel, setQaClock } from "@/lib/agentic/qa/session";
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

  if (!authorizeQaRequest(request, runtime.config.environment)) {
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
    const rest = body as {
      acquisitionMinor?: unknown;
      attribution?: unknown;
      fulfilment?: unknown;
      namespace?: unknown;
      now?: unknown;
      observe?: unknown;
      reset?: unknown;
      runId?: unknown;
    };
    if (typeof rest.runId === "string" && !("orderHandle" in rest)) {
      const begun = beginQaRun(rest.runId);
      return NextResponse.json(
        { ok: true, clock: begun.now, namespace: begun.namespace, principalScope: begun.principalScope, preflight: await qaPreflight(begun.namespace) },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (rest.reset === true && typeof rest.namespace === "string") {
      return NextResponse.json(await resetQaRun({ namespace: rest.namespace, store: runtime.store }), {
        headers: { "Cache-Control": "no-store" }
      });
    }
    if (typeof rest.now === "string" && typeof rest.namespace === "string" && !("orderHandle" in rest)) {
      const next = setQaClock(rest.namespace, rest.now);
      return NextResponse.json(next ?? { ok: false }, { headers: { "Cache-Control": "no-store" } });
    }
    if (typeof rest.namespace === "string" && (rest.attribution != null || rest.acquisitionMinor != null) && !("orderHandle" in rest)) {
      const next = setQaChannel(rest.namespace, {
        acquisitionMinor: typeof rest.acquisitionMinor === "number" ? rest.acquisitionMinor : undefined,
        attribution: rest.attribution
      });
      return NextResponse.json(next ?? { ok: false }, { headers: { "Cache-Control": "no-store" } });
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

    const fulfilment = (body as { fulfilment?: unknown }).fulfilment;
    if (typeof fulfilment === "string") {
      if (!isFulfilmentStatus(fulfilment)) {
        return NextResponse.json({ message: "Unknown fulfilment." }, { status: 400 });
      }
      const driven = await simulateFulfilment({
        config: runtime.config,
        now,
        orderHandle,
        scope: runtime.scope,
        status: fulfilment,
        store: runtime.store
      });
      return NextResponse.json(driven, { headers: { "Cache-Control": "no-store" } });
    }

    if ((body as { observe?: unknown }).observe === true) {
      const observed = await observeQaJourney({
        config: runtime.config,
        now,
        orderHandle,
        scope: runtime.scope,
        store: runtime.store
      });
      return NextResponse.json(observed, { headers: { "Cache-Control": "no-store" } });
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
      preflight: await qaPreflight(),
      tools: [
        "preflight",
        "beginRun",
        "reset",
        "setClock",
        "simulate",
        "simulateFulfilment",
        "setChannel",
        "observe",
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
