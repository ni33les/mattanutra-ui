import { NextResponse } from "next/server";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { packProof } from "@/lib/agentic/qa/pack-proof";
import { isOpaqueCapabilityHandle, resolveCapability } from "@/lib/agentic/capabilities";
import { redactedOrderCounts } from "@/lib/agentic/qa/counts";
import { nowIso } from "@/lib/agentic/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.MCP_QA_TOKEN ?? "dev-mcp-qa-token";
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  const runtime = getLiveAgenticRuntime(request);

  if (!runtime.config.internalQaHarness || runtime.config.environment !== "dev") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  if (url.searchParams.has("orderId")) {
    return NextResponse.json(
      { message: "Use orderHandle only. Never send raw order IDs." },
      { status: 400 }
    );
  }

  const orderHandle = url.searchParams.get("orderHandle") ?? "";

  if (orderHandle && !isOpaqueCapabilityHandle(orderHandle)) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  if (isOpaqueCapabilityHandle(orderHandle)) {
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

    const counts = await redactedOrderCounts({
      orderId: capability.resourceId,
      runtime
    });
    return NextResponse.json(
      { ok: true, ...counts },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const bundle = await packProof(runtime);
  return NextResponse.json(bundle, { headers: { "Cache-Control": "no-store" } });
}
