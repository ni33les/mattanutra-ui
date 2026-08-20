import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import {
  advertisedPublicToolNames,
  canonicalPublicToolName,
  handleJsonRpc
} from "@/lib/agentic/mcp/dispatcher";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp");

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
    const canonical = typeof name === "string" ? canonicalPublicToolName(name) : null;
    return canonical !== "info" && canonical !== "order";
  }

  return true;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: { code: -32700, message: "Parse error" },
        jsonrpc: "2.0"
      },
      { status: 400 }
    );
  }

  if (mcpNeedsRateLimit(body)) {
    const limited = enforceRateLimit(request, publicRateLimits.mcp);

    if (limited) {
      return limited;
    }
  }

  const runtime = getLiveAgenticRuntime(request);

  try {
    if (Array.isArray(body)) {
      const responses = [];

      for (const item of body) {
        const result = await handleJsonRpc(runtime, item);
        if (result) {
          responses.push(result);
        }
      }

      return NextResponse.json(responses, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const result = await handleJsonRpc(runtime, body as { method?: string });

    if (!result) {
      return new NextResponse(null, { status: 202 });
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    log.error("mcp.dispatch_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });

    return NextResponse.json(
      {
        error: { code: -32603, message: "Internal error" },
        jsonrpc: "2.0"
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  return NextResponse.json(
    {
      contractVersion: "3.0.0",
      transport: "streamable-http",
      tools: advertisedPublicToolNames(runtime.config.environment)
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
