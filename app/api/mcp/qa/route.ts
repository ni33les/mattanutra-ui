import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { handleQaJsonRpc } from "@/lib/agentic/mcp/qa-dispatcher";
import { authorizeQaRequest } from "@/lib/agentic/qa/authorize";
import { enforceMcpOrQaRateLimit } from "@/lib/agentic/qa/rate-limit";
import { qaHarnessAvailable } from "@/lib/agentic/config";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import {
  jsonCloseResponse,
  mcpGetSseNotSupported,
  mcpOneShotResponse,
  wantsMcpSse
} from "@/lib/agentic/mcp/transport";
import {
  isFulfilmentStatus,
  isPaymentScenario,
  observeQaJourney,
  simulateFulfilment,
  simulatePayment
} from "@/lib/agentic/qa/simulate";
import { qaPreflight } from "@/lib/agentic/qa/preflight";
import { assertReleaseManifestReady } from "@/lib/agentic/release-manifest";
import { getRequestClientIp } from "@/lib/request-client-ip";
import {
  beginQaRun,
  frozenSnapshotMissingResult,
  qaNamespaceFromRequest,
  QaRunInvalidError,
  resetQaRun,
  resolveQaNow,
  resolveQaSession,
  setQaChannel,
  setQaClock,
  withQaSessionSnapshot
} from "@/lib/agentic/qa/session";
import { isOpaqueCapabilityHandle, resolveCapability } from "@/lib/agentic/capabilities";
import { redactedOrderCounts } from "@/lib/agentic/qa/counts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp.qa");

function qaJson(payload: unknown, status = 200) {
  const identity = assertReleaseManifestReady();
  return jsonCloseResponse(payload, status, {
    "Cache-Control": "no-store",
    "x-agentic-build-id": identity.buildId,
    "x-agentic-schema-checksum": identity.schemaChecksum
  });
}

function qaRpc(request: Request, payload: unknown, status = 200) {
  const identity = assertReleaseManifestReady();
  return mcpOneShotResponse(request.headers.get("accept"), payload, status, {
    "Cache-Control": "no-store",
    "x-agentic-build-id": identity.buildId,
    "x-agentic-schema-checksum": identity.schemaChecksum
  });
}

export async function POST(request: Request) {
  assertReleaseManifestReady();
  const runtime = getLiveAgenticRuntime(request);

  if (!qaHarnessAvailable(runtime.config)) {
    return qaJson({ message: "Not found." }, 404);
  }

  if (!authorizeQaRequest(request, runtime.config.environment)) {
    return qaJson({ message: "Unauthorized" }, 401);
  }

  const limited = await enforceMcpOrQaRateLimit(request, runtime.config.environment);

  if (limited) {
    return limited;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return qaRpc(request, { error: { code: -32700, message: "Parse error" }, jsonrpc: "2.0" }, 400);
  }

  if (body && typeof body === "object" && !Array.isArray(body) && !("method" in body)) {
    if ("orderId" in body && !("orderHandle" in body)) {
      return qaJson({ message: "Use orderHandle only. Never send raw order IDs." }, 400);
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
      const begun = await beginQaRun(rest.runId, {
        buildId: runtime.config.buildId,
        clientKey: getRequestClientIp(request) ?? "",
        environment: runtime.config.environment
      });
      return qaJson({
        ok: true,
        clock: begun.now,
        namespace: begun.namespace,
        principalScope: begun.principalScope,
        preflight: await qaPreflight(begun.namespace, runtime.config.environment)
      });
    }
    if (rest.reset === true && typeof rest.namespace === "string") {
      return qaJson(await resetQaRun({ namespace: rest.namespace, store: runtime.store }));
    }
    if (typeof rest.now === "string" && typeof rest.namespace === "string" && !("orderHandle" in rest)) {
      const next = await setQaClock(rest.namespace, rest.now);
      return qaJson(next ?? { ok: false });
    }
    if (typeof rest.namespace === "string" && (rest.attribution != null || rest.acquisitionMinor != null) && !("orderHandle" in rest)) {
      const next = await setQaChannel(rest.namespace, {
        acquisitionMinor: typeof rest.acquisitionMinor === "number" ? rest.acquisitionMinor : undefined,
        attribution: rest.attribution
      });
      return qaJson(next ?? { ok: false });
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
    const namespace =
      typeof (body as { namespace?: unknown }).namespace === "string"
        ? String((body as { namespace?: unknown }).namespace)
        : undefined;
    if (namespace) {
      await resolveQaSession(namespace);
    }
    const now = resolveQaNow(namespace);

    if (!isOpaqueCapabilityHandle(orderHandle)) {
      return qaJson({ message: "Not found." }, 404);
    }

    const fulfilment = (body as { fulfilment?: unknown }).fulfilment;
    if (typeof fulfilment === "string") {
      if (!isFulfilmentStatus(fulfilment)) {
        return qaJson({ message: "Unknown fulfilment." }, 400);
      }
      const driven = await simulateFulfilment({
        config: runtime.config,
        now,
        orderHandle,
        scope: runtime.scope,
        status: fulfilment,
        store: runtime.store
      });
      return qaJson(driven);
    }

    if ((body as { observe?: unknown }).observe === true) {
      const observed = await observeQaJourney({
        config: runtime.config,
        now,
        namespace,
        orderHandle,
        scope: runtime.scope,
        store: runtime.store
      });
      return qaJson(observed);
    }

    if (typeof scenario === "string") {
      if (!isPaymentScenario(scenario)) {
        return qaJson({ message: "Unknown scenario." }, 400);
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
        return qaJson({ message: "Not found." }, 404);
      }

      const counts = await redactedOrderCounts({ orderId: capability.resourceId, runtime });
      return qaJson({ ok: true, scenario, ...counts });
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
      return qaJson({ message: "Not found." }, 404);
    }

    return qaJson({
      ok: true,
      ...(await redactedOrderCounts({ orderId: capability.resourceId, runtime }))
    });
  }

  try {
    const qaNamespace = qaNamespaceFromRequest(request, body) || undefined;
    if (qaNamespace) {
      await resolveQaSession(qaNamespace);
    }
    const result = await withQaSessionSnapshot(qaNamespace, () =>
      handleQaJsonRpc(runtime, body as { method?: string }, request)
    );

    if (!result) {
      return new NextResponse(null, { headers: { Connection: "close" }, status: 202 });
    }

    return qaRpc(request, result);
  } catch (error) {
    if (error instanceof QaRunInvalidError) {
      const id =
        body && typeof body === "object" && !Array.isArray(body)
          ? ((body as { id?: unknown }).id ?? null)
          : null;
      return qaRpc(request, {
        id,
        jsonrpc: "2.0",
        result: {
          content: [{ text: JSON.stringify(frozenSnapshotMissingResult(), null, 2), type: "text" }],
          isError: true,
          structuredContent: frozenSnapshotMissingResult()
        }
      });
    }

    log.error("mcp.qa.dispatch_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return qaRpc(
      request,
      { error: { code: -32603, message: "Internal error" }, jsonrpc: "2.0" },
      500
    );
  }
}

export async function GET(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!qaHarnessAvailable(runtime.config)) {
    return qaJson({ message: "Not found." }, 404);
  }

  if (!authorizeQaRequest(request, runtime.config.environment)) {
    return qaJson({ message: "Unauthorized" }, 401);
  }

  if (wantsMcpSse(request.headers.get("accept"))) {
    return mcpGetSseNotSupported();
  }

  return qaJson({
    preflight: await qaPreflight(undefined, runtime.config.environment),
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
  });
}
