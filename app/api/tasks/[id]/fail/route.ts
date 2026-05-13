import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import { failTask } from "@/lib/task-service";

export const runtime = "nodejs";

type FailTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: FailTaskRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  const reservationId = textValue(body.reservationId);

  if (!reservationId) {
    return openClawJson(
      { message: "reservationId is required to fail a task" },
      { status: 400 }
    );
  }

  try {
    const errorMessage = textValue(body.errorMessage) ?? "Task failed.";
    const agentId = textValue(body.agentId);

    const task = await failTask({
      agentId,
      applyFailure: (context) =>
        applyTaskFailureResult({
          errorMessage,
          resultPayload: context.resultPayload,
          retryWillBeScheduled: context.retryWillBeScheduled,
          sql: context.sql,
          task: context.task,
          taskId: id
        }),
      errorMessage,
      reservationId,
      resultPayload: objectValue(body.resultPayload),
      taskId: id
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to fail task");
  }
}
