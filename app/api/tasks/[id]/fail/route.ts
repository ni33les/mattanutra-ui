import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import { assertActiveTaskReservation, failTask } from "@/lib/task-service";

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

    await assertActiveTaskReservation({
      agentId,
      reservationId,
      taskId: id
    });
    const resultPayload = objectValue(
      await applyTaskFailureResult({
        errorMessage,
        resultPayload: objectValue(body.resultPayload),
        taskId: id
      })
    );
    const task = await failTask({
      agentId,
      errorMessage,
      reservationId,
      resultPayload,
      taskId: id
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to fail task");
  }
}
