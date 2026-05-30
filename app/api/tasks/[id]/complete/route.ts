import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskCompletionResult } from "@/lib/task-result-applier";
import { writeBpmEvent } from "@/lib/bpm";
import { completeTask } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

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
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  const reservationId = textValue(body.reservationId);
  const workerSessionId = textValue(body.workerSessionId);

  if (!reservationId) {
    return openClawJson(
      { message: "reservationId is required to complete a task" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to complete a task" },
      { status: 400 }
    );
  }

  try {
    const agentId = access.principal?.agentId ?? textValue(body.agentId);

    const task = await completeTask({
      accessScope: access.scope,
      agentId,
      applyResult: (context) =>
        applyTaskCompletionResult({
          afterCommit: context.afterCommit,
          resultPayload: context.resultPayload,
          sql: context.sql,
          task: context.task,
          taskId: id
        }),
      reservationId,
      resultPayload: objectValue(body.resultPayload),
      taskId: id,
      workerSessionId
    });

    await writeBpmEvent({
      actorType: "worker",
      durationMs:
        task.startedAt && task.completedAt
          ? new Date(task.completedAt).getTime() -
            new Date(task.startedAt).getTime()
          : null,
      eventName: "task_completed",
      eventStatus: "completed",
      eventType: "system",
      planId: task.planId,
      properties: {
        agentId,
        reservationId,
        taskGroupId: task.taskGroupId,
        taskId: task.id,
        taskType: task.taskType,
        workerSessionId
      },
      severity: "low"
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to complete task");
  }
}
