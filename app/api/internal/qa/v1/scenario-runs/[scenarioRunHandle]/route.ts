import { qaJson, qaRuntimeOrDeny } from "@/lib/agentic/qa/auth";
import { isQaErrorResult } from "@/lib/agentic/qa/errors";
import { getScenarioRun } from "@/lib/agentic/qa/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = Readonly<{
  params: Promise<{ scenarioRunHandle: string }>;
}>;

export async function GET(request: Request, { params }: RouteProps) {
  const gate = qaRuntimeOrDeny(request);

  if (!gate.ok) {
    return gate.response;
  }

  const { scenarioRunHandle } = await params;
  const result = getScenarioRun(scenarioRunHandle);

  if (isQaErrorResult(result)) {
    return qaJson(result, 404);
  }

  return qaJson(result);
}
