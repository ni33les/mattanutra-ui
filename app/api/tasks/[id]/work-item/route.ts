import {
  openClawJson,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import {
  failTask,
  getTaskBundle,
  releaseReservedTaskToQueue
} from "@/lib/task-service";
import {
  buildTaskWorkItem,
  isRetryableMatchingWorkItemError
} from "@/lib/task-work-items";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type WorkItemRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function GET(request: Request, { params }: WorkItemRouteProps) {
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const url = new URL(request.url);
  const reservationId = textValue(url.searchParams.get("reservationId"));
  const workerSessionId = textValue(url.searchParams.get("workerSessionId"));

  if (!reservationId || !workerSessionId) {
    return openClawJson(
      { message: "reservationId and workerSessionId are required" },
      { status: 400 }
    );
  }

  try {
    const bundle = await getTaskBundle({
      accessScope: access.scope,
      taskId: id
    });

    if (
      bundle.task.status !== "reserved" &&
      bundle.task.status !== "running"
    ) {
      return openClawJson(
        { message: "Task is not reserved for this worker" },
        { status: 409 }
      );
    }

    const workItem = await buildTaskWorkItem(bundle.task);

    return openClawJson({
      comments: bundle.comments,
      dependencies: bundle.dependencies,
      reservationId,
      task: bundle.task,
      workItem
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to build task work item";
    const agentId = access.principal?.agentId;

    if (isRetryableMatchingWorkItemError(error)) {
      try {
        await releaseReservedTaskToQueue({
          reservationId,
          taskId: id,
          workerSessionId
        });
      } catch {
        /* fail-closed below if release itself fails */
      }

      return openClawJson(
        { message: errorMessage, retryable: true },
        { status: 409 }
      );
    }

    try {
      await failTask({
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
        resultPayload: {
          stage: "work_item_build"
        },
        taskId: id,
        workerSessionId
      });
    } catch {
      /* fail-closed below */
    }

    return openClawJson(
      { message: errorMessage },
      { status: 409 }
    );
  }
}
