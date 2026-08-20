import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
import { handleQaJsonRpc } from "@/lib/agentic/mcp/qa-dispatcher";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.mcp.qa");

function authorized(request: Request) {
  const expected = process.env.MCP_QA_TOKEN ?? "dev-mcp-qa-token";
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!runtime.config.internalQaHarness || runtime.config.environment !== "dev") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (!authorized(request)) {
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
      tools: ["simulate", "evidence", "isolationProof", "checkoutContinuityProof"],
      transport: "streamable-http"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
