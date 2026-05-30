import {
  openClawJson,
  readJsonObject,
  requireOpenClawAccess,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { enqueueNutritionPlanRefinementTask } from "@/lib/task-worker";

export const runtime = "nodejs";

type OpenClawPlanRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: OpenClawPlanRouteProps
) {
  const { unauthorized, principal } = await requireOpenClawAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;
  const body = await readJsonObject(request);

  try {
    const queued = await enqueueNutritionPlanRefinementTask({
      planId,
      requestedBy:
        principal?.type === "agent"
          ? principal.agentName
          : textValue(body.requestedBy) ?? "openclaw"
    });

    if (!queued.taskId) {
      return openClawJson(
        { message: queued.reason ?? "Unable to refine plan" },
        { status: 409 }
      );
    }

    return openClawJson({
      taskId: queued.taskId
    });
  } catch (error) {
    return taskApiError(error, "Unable to queue OpenClaw plan refinement");
  }
}
