import { executeTaskWorkItem } from "@/lib/task-execution";
import {
  AGENT_CAPABILITIES,
  SYSTEM_AGENTS,
  taskReservationAgent
} from "@/lib/system-agents";
import type { TaskWorkItem } from "@/lib/task-work-items";

type WorkerGroup = Readonly<{
  agent: ReturnType<typeof taskReservationAgent>;
  leaseSeconds: number;
  mustRequireCapability?: string;
  taskTypes: readonly string[];
}>;

type ReserveResponse = Readonly<{
  agent?: Readonly<{ id: string }>;
  reservationId?: string;
  task?: Readonly<{
    id: string;
    taskType: string;
  }> | null;
  workItem?: TaskWorkItem;
}>;

const DEFAULT_MAX_TASKS_PER_TICK = 25;
const DEFAULT_WORKER_CONCURRENCY = 1;
const DEFAULT_WORKER_GROUPS: readonly WorkerGroup[] = [
  {
    agent: taskReservationAgent(SYSTEM_AGENTS.communicationsCoordinator),
    leaseSeconds: 600,
    mustRequireCapability: AGENT_CAPABILITIES.clientSafetyFollowup,
    taskTypes: ["client_safety_followup"]
  },
  {
    agent: taskReservationAgent(SYSTEM_AGENTS.healthScoreEngine),
    leaseSeconds: 900,
    taskTypes: ["analyze_healthscore"]
  },
  {
    agent: taskReservationAgent(SYSTEM_AGENTS.formulationWorker),
    leaseSeconds: 3600,
    taskTypes: ["generate_formulation", "generate_example_formulation"]
  },
  {
    agent: taskReservationAgent(SYSTEM_AGENTS.emailDispatcher),
    leaseSeconds: 600,
    taskTypes: ["send_example_email", "send_reassessment_email"]
  }
];

const globalWorker = globalThis as typeof globalThis & {
  mattanutraInternalApiWorker?: Promise<void>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function apiBaseUrl() {
  const configured =
    process.env.MATTANUTRA_API_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || "3001"}`;
  }

  return "";
}

function apiToken() {
  return process.env.ADMIN_CLAW_TOKEN || "";
}

async function requestJson<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const baseUrl = apiBaseUrl();
  const token = apiToken();

  if (!baseUrl) {
    throw new Error("MATTANUTRA_API_BASE_URL is required for API workers");
  }

  if (!token) {
    throw new Error("ADMIN_CLAW_TOKEN is required for API workers");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    let detail = "";

    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text().catch(() => "");
    }

    throw new Error(`${path} failed with ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

async function addWorkerComment(
  reserved: ReserveResponse,
  body: string,
  metadata: Record<string, unknown> = {}
) {
  if (!reserved.task?.id || !reserved.agent?.id) {
    return;
  }

  try {
    await requestJson(`/api/tasks/${reserved.task.id}/comment`, {
      agentId: reserved.agent.id,
      authorName: "Internal API worker",
      authorType: "worker",
      body,
      commentType: "status",
      metadata,
      visibility: "worker"
    });
  } catch {
    // Progress notes are useful but should never block task execution.
  }
}

async function reserveTask(group: WorkerGroup) {
  return requestJson<ReserveResponse>("/api/tasks/reserve", {
    agent: group.agent,
    leaseSeconds: group.leaseSeconds,
    mustRequireCapability: group.mustRequireCapability,
    taskTypes: [...group.taskTypes]
  });
}

async function failReservedTask(
  reserved: ReserveResponse,
  error: unknown
) {
  if (!reserved.task?.id || !reserved.reservationId || !reserved.agent?.id) {
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown task error";

  await requestJson(`/api/tasks/${reserved.task.id}/fail`, {
    agentId: reserved.agent.id,
    errorMessage: message,
    reservationId: reserved.reservationId,
    resultPayload: {
      taskType: reserved.task.taskType
    }
  });
}

async function processGroup(group: WorkerGroup) {
  let reserved: ReserveResponse;

  try {
    reserved = await reserveTask(group);
  } catch (error) {
    console.error("Unable to reserve worker task", error);
    return false;
  }

  if (!reserved.task || !reserved.workItem || !reserved.reservationId) {
    return false;
  }

  try {
    await addWorkerComment(reserved, "Task execution started.", {
      workerMode: "internal_api"
    });
    const resultPayload = await executeTaskWorkItem(reserved.workItem);

    await requestJson(`/api/tasks/${reserved.task.id}/complete`, {
      agentId: reserved.agent?.id,
      reservationId: reserved.reservationId,
      resultPayload
    });
    return true;
  } catch (error) {
    try {
      await failReservedTask(reserved, error);
    } catch (failureError) {
      console.error("Unable to report worker task failure", failureError);
    }
    return true;
  }
}

async function runWorkerLane(maxTasks: number) {
  let processed = 0;

  while (processed < maxTasks) {
    let didWork = false;

    for (const group of DEFAULT_WORKER_GROUPS) {
      if (processed >= maxTasks) {
        break;
      }

      const worked = await processGroup(group);

      if (worked) {
        processed += 1;
        didWork = true;
      }
    }

    if (!didWork) {
      break;
    }
  }
}

export async function runInternalApiWorker() {
  const maxTasks = positiveInteger(
    process.env.WORKER_MAX_TASKS_PER_TICK,
    DEFAULT_MAX_TASKS_PER_TICK
  );
  const concurrency = positiveInteger(
    process.env.WORKER_CONCURRENCY,
    DEFAULT_WORKER_CONCURRENCY
  );

  await Promise.all(
    Array.from({ length: concurrency }, () => runWorkerLane(maxTasks))
  );
}

export function kickInternalApiWorker() {
  if (globalWorker.mattanutraInternalApiWorker) {
    return globalWorker.mattanutraInternalApiWorker;
  }

  globalWorker.mattanutraInternalApiWorker = runInternalApiWorker()
    .catch((error) => {
      console.error("Internal API worker failed", error);
    })
    .finally(() => {
      globalWorker.mattanutraInternalApiWorker = undefined;
    });

  return globalWorker.mattanutraInternalApiWorker;
}
