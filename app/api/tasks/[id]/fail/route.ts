import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import { writeBpmEvent } from "@/lib/bpm";
import { failTask } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type FailTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: FailTaskRouteProps) {
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
      { message: "reservationId is required to fail a task" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to fail a task" },
      { status: 400 }
    );
  }

  try {
    const errorMessage = textValue(body.errorMessage) ?? "Task failed.";
    const agentId = access.principal?.agentId ?? textValue(body.agentId);

    const task = await failTask({
      accessScope: access.scope,
      agentId,
      applyFailure: (context) =>
        applyTaskFailureResult({
          afterCommit: context.afterCommit,
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
      errorMessage,
      eventName: "task_failed",
      eventStatus: "failed",
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
      severity: "high"
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to fail task");
  }
}
