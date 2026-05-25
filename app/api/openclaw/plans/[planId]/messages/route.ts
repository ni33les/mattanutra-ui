import {
  openClawJson,
  requireOpenClawRequest
} from "@/lib/openclaw-api";

export const runtime = "nodejs";

type OpenClawPlanRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

/**
 * OpenClaw chat message endpoint for a plan (GET list / POST append).
 *
 * This surface exists so OpenClaw (and future external concierges) can store
 * and retrieve chat turns against a MattaNutra nutrition plan.
 *
 * Currently a minimal stub that satisfies the ADMIN_CLAW_TOKEN auth boundary
 * test while the full bidirectional chat + advisor handoff is completed.
 *
 * TODO: Implement using loadPlanChatMessages + appendPlanChatMessage from
 *       lib/plan-concierge.ts + enqueue appropriate follow-up tasks.
 */
export async function GET(request: Request, { params }: OpenClawPlanRouteProps) {
  const unauthorized = requireOpenClawRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;
  // Placeholder response — real implementation will return chat history
  return openClawJson({
    planId,
    messages: [],
    note: "Messages endpoint is not yet fully implemented. See TODO in source."
  });
}

export async function POST(request: Request, { params }: OpenClawPlanRouteProps) {
  const unauthorized = requireOpenClawRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;
  // Placeholder — real impl will validate + persist via plan-concierge
  return openClawJson({
    planId,
    ok: true,
    note: "Message accepted (stub). Full persistence + reply dispatch pending."
  }, { status: 202 });
}
