import { qaJson, qaRuntimeOrDeny } from "@/lib/agentic/qa/auth";
import { isQaErrorResult } from "@/lib/agentic/qa/errors";
import { startScenarioRun } from "@/lib/agentic/qa/control-plane";

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

  const allowed = new Set(["idempotencyKey", "resource", "scenario", "parameters"]);
  const unexpected = Object.keys(body).find((key) => !allowed.has(key));

  if (unexpected) {
    return qaJson(
      {
        ok: false,
        error: {
          category: "validation",
          fieldPath: unexpected,
          message: "Unexpected property.",
          reasonCode: "unexpected_property",
          retryable: false
        }
      },
      400
    );
  }

  const result = await startScenarioRun({
    idempotencyKey: body.idempotencyKey,
    parameters: body.parameters,
    resource: body.resource,
    runtime: gate.runtime,
    scenario: body.scenario
  });

  if (isQaErrorResult(result)) {
    const status = result.error.reasonCode === "not_found" ? 404 : 400;
    return qaJson(result, status);
  }

  return qaJson(result);
}

export async function GET(request: Request) {
  const gate = qaRuntimeOrDeny(request);

  if (!gate.ok) {
    return gate.response;
  }

  return qaJson({
    ok: true,
    scenarios: true,
    transport: "internal-qa-v1"
  });
}
