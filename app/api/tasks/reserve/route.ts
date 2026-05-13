import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { applyTaskFailureResult } from "@/lib/task-result-applier";
import { buildTaskWorkItem } from "@/lib/task-work-items";
import { failTask, getTaskBundle, reserveNextTask } from "@/lib/task-service";
import type { AgentType } from "@/lib/task-service";

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

export async function POST(request: Request) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const agent = objectValue(body.agent);

  try {
    const reserved = await reserveNextTask({
      agent: {
        capabilities: agent.capabilities,
        id: textValue(agent.id),
        metadata: objectValue(agent.metadata),
        model: textValue(agent.model),
        name: textValue(agent.name) ?? "Unnamed OpenClaw agent",
        type: agentType(agent.type)
      },
      applyExpiredFailure: (context) =>
        applyTaskFailureResult({
          errorMessage: context.errorMessage,
          resultPayload: context.resultPayload,
          retryWillBeScheduled: context.retryWillBeScheduled,
          sql: context.sql,
          task: context.task,
          taskId: context.task.id
        }),
      leaseSeconds: body.leaseSeconds,
      mustRequireCapability: textValue(body.mustRequireCapability),
      taskTypes: textArray(body.taskTypes)
    });

    if (!reserved) {
      return openClawJson({ task: null });
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
  } catch (error) {
    return taskApiError(error, "Unable to reserve task");
  }
}
