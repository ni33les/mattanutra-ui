import { withRequestLifetime } from "@/lib/request-lifetime";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { requestCorrelationId } from "@/lib/request-correlation";
import { AGENTIC_CONTRACT_VERSION, loadAgenticConfig } from "@/lib/agentic/config";
import { agenticServerInstructions } from "@/lib/agentic/contract";
import { CLIENT_CONTRACT_VERSION_HEADER } from "@/lib/agentic/contract/version-pin";
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
  withQaSessionSnapshot
} from "@/lib/agentic/qa/session";
import {
  McpBodyTooLargeError,
  McpBodyTimeoutError,
  McpInvalidRequestError,
  readMcpRequest,
  mcpGetSseNotSupported,
  mcpOneShotResponse,
  wantsMcpSse
} from "@/lib/agentic/mcp/transport";
import { assertReleaseManifestReady } from "@/lib/agentic/release-manifest";
import { requestSetupRecovery } from "@/lib/agentic/mcp/dependency-error";

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
  const identity = assertReleaseManifestReady();
  return mcpOneShotResponse(accept, payload, status, {
    "x-request-id": requestCorrelationId(request),
    "x-agentic-build-id": identity.buildId,
    "x-agentic-schema-checksum": identity.schemaChecksum,
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
    return suffix !== "info";
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

export function POST(request: Request) {
  return withRequestLifetime({ signal: request.signal }, () => handlePost(request));
}

async function handlePost(request: Request) {
  assertReleaseManifestReady();
  let body: unknown;

  try {
    body = await readMcpRequest(request);
  } catch (error) {
    if (error instanceof McpBodyTimeoutError || request.signal.aborted) {
      return mcpReply(request, { id: null, jsonrpc: "2.0", error: { code: -32600, message: "Request body was not received in time." } }, 408);
    }
    if (error instanceof McpBodyTooLargeError) {
      return mcpReply(request, { id: null, jsonrpc: "2.0", error: { code: -32600, message: error.message } }, 413);
    }
    if (error instanceof McpInvalidRequestError) {
      return mcpReply(request, { id: null, jsonrpc: "2.0", error: { code: -32600, message: error.message } }, 400);
    }
    return mcpReply(
      request,
      {
        id: null,
        error: { code: -32700, message: "Parse error" },
        jsonrpc: "2.0"
      },
      400
    );
  }

  const started = performance.now();
  const timed = timedToolName(body);
  const correlationId = requestCorrelationId(request);

  try {
    if (mcpNeedsRateLimit(body)) {
      const limited = await enforceMcpOrQaRateLimit(request, loadAgenticConfig(request).environment, body);
      if (limited) return limited;
    }
    if (!Array.isArray(body) && !mcpCallNeedsStore(body)) {
      const light = await handleLightweightJsonRpc(
        loadAgenticConfig(request),
        body as JsonRpcRequest,
        undefined, { clientContractVersion: request.headers.get(CLIENT_CONTRACT_VERSION_HEADER) ?? undefined,
          resultContent: request.headers.get("x-mattanutra-result-content") === "text" ? "text" : "structured" }
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
    const live = getLiveAgenticRuntime(request);
    const { bindQaRuntime } = await import("@/lib/agentic/qa/session");
    const qaNamespace = await hydrateQaRequest(
      request,
      body,
      live.store,
      live.config
    );
    const runtime = bindQaRuntime(live, request, qaNamespace);

    const result = await withQaSessionSnapshot(qaNamespace || undefined, () =>
      handleJsonRpc({ ...runtime, clientContractVersion: request.headers.get(CLIENT_CONTRACT_VERSION_HEADER) ?? undefined,
        resultContent: request.headers.get("x-mattanutra-result-content") === "text" ? "text" : "structured" }, body as JsonRpcRequest)
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

    const recovery = requestSetupRecovery(error, body, correlationId);
    if (recovery) return mcpReply(request, { id: (body as JsonRpcRequest).id ?? null, jsonrpc: "2.0", result: toolResult(recovery, true) });

    return mcpReply(
      request,
      {
        id: (body as JsonRpcRequest)?.id ?? null,
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
    contractVersion: AGENTIC_CONTRACT_VERSION,
    instructions: agenticServerInstructions(config.environment),
    tools: toolList(config.environment),
    transport: "streamable-http"
  });
}
