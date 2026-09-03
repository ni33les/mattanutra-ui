import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { requestCorrelationId } from "@/lib/request-correlation";
import { loadAgenticConfig } from "@/lib/agentic/config";
import { agenticServerInstructions } from "@/lib/agentic/contract";
import {
  canonicalPublicToolName,
  handleLightweightJsonRpc,
  mcpCallNeedsStore,
  toolList,
  toolResult,
  type JsonRpcRequest
} from "@/lib/agentic/mcp/rpc";
import { recordMcpTiming } from "@/lib/agentic/metrics";
import { enforceMcpOrQaRateLimit } from "@/lib/agentic/qa/rate-limit";
import {
  frozenSnapshotMissingResult,
  hydrateQaRequest,
  QaRunInvalidError,
  QA_PACK_CLOCK,
  withQaSessionSnapshot
} from "@/lib/agentic/qa/session";
import {
  mcpGetSseNotSupported,
  mcpOneShotResponse,
  wantsMcpSse
} from "@/lib/agentic/mcp/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp");

function mcpReply(
  request: Request,
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  const accept = request.headers.get("accept");
  return mcpOneShotResponse(accept, payload, status, {
    "x-request-id": requestCorrelationId(request),
    ...extraHeaders
  });
}

function mcpNeedsRateLimit(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return true;
  }

  const method = (body as { method?: unknown }).method;
  if (
    method === "initialize" ||
    method === "tools/list" ||
    method === "ping" ||
    method === "notifications/initialized"
  ) {
    return false;
  }

  if (method === "tools/call") {
    const name = (body as { params?: { name?: unknown } }).params?.name;
    if (typeof name !== "string") {
      return true;
    }

    const suffix = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
    return suffix !== "info" && suffix !== "order";
  }

  return true;
}

function timedToolName(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const method = (body as { method?: unknown }).method;
  if (method === "initialize" || method === "tools/list" || method === "ping") {
    return "info";
  }

  if (method !== "tools/call") {
    return null;
  }

  const name = (body as { params?: { name?: unknown } }).params?.name;
  return typeof name === "string" ? canonicalPublicToolName(name) : null;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return mcpReply(
      request,
      {
        error: { code: -32700, message: "Parse error" },
        jsonrpc: "2.0"
      },
      400
    );
  }

  if (mcpNeedsRateLimit(body)) {
    const limited = await enforceMcpOrQaRateLimit(
      request,
      loadAgenticConfig(request).environment,
      body
    );

    if (limited) {
      return limited;
    }
  }

  const started = performance.now();
  const timed = timedToolName(body);
  const correlationId = requestCorrelationId(request);

  try {
    if (!Array.isArray(body) && !mcpCallNeedsStore(body)) {
      const light = await handleLightweightJsonRpc(
        loadAgenticConfig(request),
        body as JsonRpcRequest
      );

      if (light === null) {
        return new NextResponse(null, { headers: { Connection: "close" }, status: 202 });
      }

      if (light) {
        const durationMs = Math.round(performance.now() - started);
        if (timed) {
          recordMcpTiming(timed, durationMs);
        }
        log.info("mcp.tool_completed", {
          correlationId,
          durationMs,
          tool: timed ?? "other"
        });
        return mcpReply(request, light, 200, { "x-mcp-handler-ms": String(durationMs) });
      }
    }

    const [{ getLiveAgenticRuntime }, { handleJsonRpc }] = await Promise.all([
      import("@/lib/agentic/live-runtime"),
      import("@/lib/agentic/mcp/dispatcher")
    ]);
    const { bindQaRuntime } = await import("@/lib/agentic/qa/session");
    const qaNamespace = await hydrateQaRequest(request, body);
    let runtime = bindQaRuntime(getLiveAgenticRuntime(request), request);
    if (qaNamespace === "") {
      runtime = { ...runtime, now: runtime.now ?? QA_PACK_CLOCK };
    }

    if (Array.isArray(body)) {
      const responses = [];

      for (const item of body) {
        const result = await withQaSessionSnapshot(qaNamespace || undefined, () =>
          handleJsonRpc(runtime, item)
        );
        if (result) {
          responses.push(result);
        }
      }

      const durationMs = Math.round(performance.now() - started);
      if (timed) {
        recordMcpTiming(timed, durationMs);
      }
      log.info("mcp.tool_completed", {
        correlationId,
        durationMs,
        tool: timed ?? "batch"
      });
      return mcpReply(request, responses, 200, { "x-mcp-handler-ms": String(durationMs) });
    }

    const result = await withQaSessionSnapshot(qaNamespace || undefined, () =>
      handleJsonRpc(runtime, body as JsonRpcRequest)
    );

    if (!result) {
      return new NextResponse(null, { headers: { Connection: "close" }, status: 202 });
    }

    const durationMs = Math.round(performance.now() - started);
    if (timed) {
      recordMcpTiming(timed, durationMs);
    }
    log.info("mcp.tool_completed", {
      correlationId,
      durationMs,
      tool: timed ?? "other"
    });
    return mcpReply(request, result, 200, { "x-mcp-handler-ms": String(durationMs) });
  } catch (error) {
    if (error instanceof QaRunInvalidError) {
      const id =
        body && typeof body === "object" && !Array.isArray(body)
          ? ((body as { id?: unknown }).id ?? null)
          : null;
      return mcpReply(
        request,
        {
          id,
          jsonrpc: "2.0",
          result: toolResult(frozenSnapshotMissingResult(), true)
        },
        200
      );
    }

    log.error("mcp.dispatch_failed", {
      correlationId,
      durationMs: Math.round(performance.now() - started),
      message: error instanceof Error ? error.message : "unknown",
      tool: timed ?? "unknown"
    });

    return mcpReply(
      request,
      {
        error: { code: -32603, message: "Internal error" },
        jsonrpc: "2.0"
      },
      500
    );
  }
}

export async function GET(request: Request) {
  void import("@/lib/db")
    .then((mod) => mod.keepDatabaseWarm())
    .catch(() => null);

  if (wantsMcpSse(request.headers.get("accept"))) {
    return mcpGetSseNotSupported();
  }

  const config = loadAgenticConfig(request);
  return mcpReply(request, {
    contractVersion: "3.0.0",
    instructions: agenticServerInstructions(config.environment),
    tools: toolList(config.environment),
    transport: "streamable-http"
  });
}
