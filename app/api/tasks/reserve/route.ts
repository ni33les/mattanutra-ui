import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { writeBpmEvent } from "@/lib/bpm";
import { getWorkerSql } from "@/lib/db";
import { reserveNextTask } from "@/lib/task-service";
import type { AgentType } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

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
  const startedAt = Date.now();
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const agent = objectValue(body.agent);
  const principal = access.principal;
  const agentId = principal?.agentId ?? textValue(agent.id);
  const workerSessionId = textValue(body.workerSessionId);
  const taskTypes = textArray(body.taskTypes);

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to reserve a task" },
      { status: 400 }
    );
  }

  try {
    const reserved = await reserveNextTask({
      accessScope: access.scope,
      agent: {
        capabilities: principal?.capabilities ?? agent.capabilities,
        id: agentId,
        metadata: objectValue(agent.metadata),
        model: textValue(agent.model),
        name: principal?.agentName ?? textValue(agent.name) ?? "Unnamed agent",
        type: agentType(agent.type)
      },
      leaseSeconds: body.leaseSeconds,
      mustRequireCapability: textValue(body.mustRequireCapability),
      taskTypes,
      workerSessionId
    });

    if (!reserved) {
      console.info("[tasks:reserve]", {
        reserved: false,
        taskTypes,
        totalDurationMs: Date.now() - startedAt,
        workerSessionId
      });

      return openClawJson({ task: null });
    }

    await writeBpmEvent({
      actorType: "worker",
      eventName: "task_reserved",
      eventStatus: "reserved",
      eventType: "system",
      planId: reserved.task.planId,
      properties: {
        agentId: reserved.agent.id,
        reservationId: reserved.reservationId,
        taskGroupId: reserved.task.taskGroupId,
        taskId: reserved.task.id,
        taskType: reserved.task.taskType,
        workerSessionId
      },
      severity: "low",
      sql: getWorkerSql() ?? undefined
    });

    console.info("[tasks:reserve]", {
      reserved: true,
      taskId: reserved.task.id,
      taskType: reserved.task.taskType,
      totalDurationMs: Date.now() - startedAt,
      workerSessionId
    });

    return openClawJson({
      agent: reserved.agent,
      comments: reserved.comments,
      reservationId: reserved.reservationId,
      task: reserved.task
    });
  } catch (error) {
    console.warn("[tasks:reserve] failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      taskTypes,
      totalDurationMs: Date.now() - startedAt,
      workerSessionId
    });

    return taskApiError(error, "Unable to reserve task");
  }
}
