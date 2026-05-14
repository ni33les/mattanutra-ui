import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import { buildTaskWorkItem } from "@/lib/task-work-items";
import {
  failTask,
  getTaskBundle,
  heartbeatWorkerSession,
  releaseExpiredReservations,
  reserveNextTask
} from "@/lib/task-service";
import type { AgentType } from "@/lib/task-service";
import { requireWorkerRequest } from "@/lib/worker-auth";

export const runtime = "nodejs";

function agentType(value: unknown): AgentType {
  const text = textValue(value);

  return text === "ai" ||
    text === "deterministic" ||
    text === "human" ||
    text === "system"
    ? text
    : "external";
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function waitSeconds(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(25, Math.max(0, Math.round(parsed)))
    : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const unauthorized = requireWorkerRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const agent = objectValue(body.agent);
  const workerSessionId = textValue(body.workerSessionId);
  const deadline = Date.now() + waitSeconds(body.waitSeconds) * 1000;

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to reserve a task" },
      { status: 400 }
    );
  }

  try {
    await heartbeatWorkerSession({
      agentId: textValue(agent.id),
      status: "polling",
      workerSessionId
    });

    await releaseExpiredReservations({
      applyFailure: (context) =>
        applyTaskFailureResult({
          afterCommit: context.afterCommit,
          errorMessage: context.errorMessage,
          resultPayload: context.resultPayload,
          retryWillBeScheduled: context.retryWillBeScheduled,
          sql: context.sql,
          task: context.task,
          taskId: context.task.id
        })
    });

    while (true) {
      const reserved = await reserveNextTask({
        agent: {
          capabilities: agent.capabilities,
          id: textValue(agent.id),
          metadata: objectValue(agent.metadata),
          model: textValue(agent.model),
          name: textValue(agent.name) ?? "Unnamed worker agent",
          type: agentType(agent.type)
        },
        leaseSeconds: body.leaseSeconds,
        mustRequireCapability: textValue(body.mustRequireCapability),
        taskTypes: textArray(body.taskTypes),
        workerSessionId
      });

    if (!reserved) {
      if (Date.now() >= deadline) {
        if (workerSessionId) {
          await heartbeatWorkerSession({
            agentId: textValue(agent.id),
            status: "idle",
            workerSessionId
          });
        }

        return openClawJson({ task: null });
      }

      await sleep(750);
      continue;
    }

    const bundle = await getTaskBundle({ taskId: reserved.task.id });
    let workItem;

    try {
      workItem = await buildTaskWorkItem(bundle.task);
    } catch (error) {
      await failTask({
        agentId: reserved.agent.id,
        applyFailure: (context) =>
          applyTaskFailureResult({
            afterCommit: context.afterCommit,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Unable to build task work item",
            resultPayload: context.resultPayload,
            retryWillBeScheduled: context.retryWillBeScheduled,
            sql: context.sql,
            task: context.task,
            taskId: bundle.task.id
          }),
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to build task work item",
        workerSessionId,
        reservationId: reserved.reservationId,
        resultPayload: {
          stage: "work_item_build",
          taskType: bundle.task.taskType
        },
        taskId: bundle.task.id
      });
      throw error;
    }

      return openClawJson({
        agent: reserved.agent,
        comments: bundle.comments,
        dependencies: bundle.dependencies,
        goal: bundle.goal,
        reservationId: reserved.reservationId,
        task: bundle.task,
        workItem
      });
    }
  } catch (error) {
    return taskApiError(error, "Unable to reserve task");
  }
}
