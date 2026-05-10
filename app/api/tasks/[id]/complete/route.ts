import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskCompletionResult } from "@/lib/task-result-applier";
import { assertActiveTaskReservation, completeTask } from "@/lib/task-service";

export const runtime = "nodejs";

type CompleteTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: CompleteTaskRouteProps
) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  const reservationId = textValue(body.reservationId);

  if (!reservationId) {
    return openClawJson(
      { message: "reservationId is required to complete a task" },
      { status: 400 }
    );
  }

  try {
    const agentId = textValue(body.agentId);

    await assertActiveTaskReservation({
      agentId,
      reservationId,
      taskId: id
    });
    const resultPayload = objectValue(
      await applyTaskCompletionResult({
        reservationId,
        resultPayload: objectValue(body.resultPayload),
        taskId: id
      })
    );
    const task = await completeTask({
      agentId,
      reservationId,
      resultPayload,
      taskId: id
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to complete task");
  }
}
