import { qaJson, qaRuntimeOrDeny } from "@/lib/agentic/qa/auth";
import { isQaErrorResult } from "@/lib/agentic/qa/errors";
import { startProofRun } from "@/lib/agentic/qa/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = qaRuntimeOrDeny(request);

  if (!gate.ok) {
    return gate.response;
  }

  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const result = await startProofRun({
    idempotencyKey: body.idempotencyKey,
    parameters: body.parameters,
    proof: body.proof,
    runtime: gate.runtime
  });

  if (isQaErrorResult(result)) {
    return qaJson(result, 400);
  }

  return qaJson(result);
}
