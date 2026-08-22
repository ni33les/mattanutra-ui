import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { writeBpmEvent } from "@/lib/bpm";
import {
  heartbeatWorkerSession,
  reserveNextTask
} from "@/lib/task-service";
import type { AgentType } from "@/lib/task-service";
import { waitForTaskQueueChange } from "@/lib/task-wakeup";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

const DEFAULT_RESERVE_POLL_INTERVAL_MS = 5_000;
const INTERACTIVE_RESERVE_POLL_INTERVAL_MS = 1_000;

const INTERACTIVE_TASK_TYPES = new Set([
  "analyze_healthscore",
  "generate_food_gap_guidance",
  "generate_supplement_guidance",
  "generate_product_recommendations"
]);

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

function reservePollIntervalMs(taskTypes: readonly string[]) {
  return taskTypes.some((taskType) => INTERACTIVE_TASK_TYPES.has(taskType))
    ? INTERACTIVE_RESERVE_POLL_INTERVAL_MS
    : DEFAULT_RESERVE_POLL_INTERVAL_MS;
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
  const deadline = Date.now() + waitSeconds(body.waitSeconds) * 1000;
  const pollIntervalMs = reservePollIntervalMs(taskTypes);

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to reserve a task" },
      { status: 400 }
    );
  }

  try {
    const heartbeatStartedAt = Date.now();
    await heartbeatWorkerSession({
      accessScope: access.scope,
      agentId,
      status: "polling",
      workerSessionId
    });
    const heartbeatDurationMs = Date.now() - heartbeatStartedAt;

    while (true) {
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
        if (Date.now() >= deadline) {
          if (workerSessionId) {
            const idleHeartbeatStartedAt = Date.now();
            await heartbeatWorkerSession({
              accessScope: access.scope,
              agentId,
              status: "idle",
              workerSessionId
            });
            const idleHeartbeatDurationMs = Date.now() - idleHeartbeatStartedAt;

            if (idleHeartbeatDurationMs > 1_000) {
              console.info("[tasks:reserve] idle heartbeat", {
                durationMs: idleHeartbeatDurationMs,
                taskTypes,
                workerSessionId
              });
            }
          }

          console.info("[tasks:reserve]", {
            heartbeatDurationMs,
            reserved: false,
            taskTypes,
            totalDurationMs: Date.now() - startedAt,
            workerSessionId
          });

          return openClawJson({ task: null });
        }

        await waitForTaskQueueChange(
          Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))
        );
        continue;
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
        severity: "low"
      });

      console.info("[tasks:reserve]", {
        heartbeatDurationMs,
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
    }
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
