import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { handleJsonRpc } from "@/lib/agentic/mcp/dispatcher";
import { getAgenticRuntime } from "@/lib/agentic/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp");

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.mcp);

  if (limited) {
    return limited;
  }

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

  const runtime = getAgenticRuntime(request);

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

export async function GET() {
  return NextResponse.json(
    {
      contractVersion: "3.0.0",
      transport: "streamable-http",
      tools: ["info", "plan", "execute", "order", "support", "feedback"]
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
