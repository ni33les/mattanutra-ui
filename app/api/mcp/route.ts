import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { loadAgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_PUBLIC_TOOLS, AGENTIC_SERVER_INSTRUCTIONS } from "@/lib/agentic/contract";
import {
  canonicalPublicToolName,
  handleLightweightJsonRpc,
  mcpCallNeedsStore,
  type JsonRpcRequest
} from "@/lib/agentic/mcp/rpc";
import { recordMcpTiming } from "@/lib/agentic/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp");
const MCP_HEADERS = {
  "Cache-Control": "no-store",
  Connection: "keep-alive"
};

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

function jsonRpc(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: MCP_HEADERS, status });
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
    return jsonRpc(
      {
        error: { code: -32700, message: "Parse error" },
        jsonrpc: "2.0"
      },
      400
    );
  }

  if (mcpNeedsRateLimit(body)) {
    const limited = enforceRateLimit(request, publicRateLimits.mcp);

    if (limited) {
      return limited;
    }
  }

  const started = performance.now();
  const timed = timedToolName(body);

  try {
    if (!Array.isArray(body) && !mcpCallNeedsStore(body)) {
      const light = handleLightweightJsonRpc(
        loadAgenticConfig(request),
        body as JsonRpcRequest
      );

      if (light === null) {
        return new NextResponse(null, { status: 202 });
      }

      if (light) {
        if (timed) {
          recordMcpTiming(timed, performance.now() - started);
        }
        return jsonRpc(light);
      }
    }

    const [{ getLiveAgenticRuntime }, { handleJsonRpc }] = await Promise.all([
      import("@/lib/agentic/live-runtime"),
      import("@/lib/agentic/mcp/dispatcher")
    ]);
    const runtime = getLiveAgenticRuntime(request);

    if (Array.isArray(body)) {
      const responses = [];

      for (const item of body) {
        const result = await handleJsonRpc(runtime, item);
        if (result) {
          responses.push(result);
        }
      }

      if (timed) {
        recordMcpTiming(timed, performance.now() - started);
      }
      return jsonRpc(responses);
    }

    const result = await handleJsonRpc(runtime, body as JsonRpcRequest);

    if (!result) {
      return new NextResponse(null, { status: 202 });
    }

    if (timed) {
      recordMcpTiming(timed, performance.now() - started);
    }
    return jsonRpc(result);
  } catch (error) {
    log.error("mcp.dispatch_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });

    return jsonRpc(
      {
        error: { code: -32603, message: "Internal error" },
        jsonrpc: "2.0"
      },
      500
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      contractVersion: "3.0.0",
      instructions: AGENTIC_SERVER_INSTRUCTIONS,
      tools: [...AGENTIC_PUBLIC_TOOLS],
      transport: "streamable-http"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
