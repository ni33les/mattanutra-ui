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

type InternalApiWorkerOptions = Readonly<{
  baseUrl?: string | null;
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
    agent: taskReservationAgent(SYSTEM_AGENTS.contentPublisher),
    leaseSeconds: 600,
    mustRequireCapability: AGENT_CAPABILITIES.contentPublish,
    taskTypes: ["content_status_change"]
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
  },
  {
    agent: taskReservationAgent(SYSTEM_AGENTS.scheduler),
    leaseSeconds: 300,
    mustRequireCapability: AGENT_CAPABILITIES.hostingCostSync,
    taskTypes: ["sync_digitalocean_billing"]
  }
];

const globalWorker = globalThis as typeof globalThis & {
  mattanutraInternalApiWorker?: Promise<void>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configured(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") || "";
}

function localApiBaseUrl() {
  const explicit = configured(process.env.MATTANUTRA_INTERNAL_API_BASE_URL);

  if (explicit) {
    return explicit;
  }

  const port = process.env.PORT?.trim();

  return port ? `http://127.0.0.1:${port}` : "";
}

function apiBaseUrl(baseUrl?: string | null) {
  const localBaseUrl = localApiBaseUrl();

  if (process.env.NODE_ENV === "production" && localBaseUrl) {
    return localBaseUrl;
  }

  const resolved =
    configured(baseUrl ?? undefined) ||
    configured(process.env.MATTANUTRA_API_BASE_URL) ||
    configured(process.env.APP_BASE_URL) ||
    configured(process.env.NEXT_PUBLIC_SITE_URL) ||
    localBaseUrl;

  if (resolved) {
    return resolved;
  }

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || "3001"}`;
  }

  return "";
}

function apiToken() {
  return process.env.ADMIN_CLAW_TOKEN || "";
}

function baseUrlForLog(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

async function requestJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: InternalApiWorkerOptions = {}
): Promise<T> {
  const baseUrl = apiBaseUrl(options.baseUrl);
  const token = apiToken();

  if (!baseUrl) {
    throw new Error(
      "Internal API workers require a request baseUrl or MATTANUTRA_API_BASE_URL/APP_BASE_URL/NEXT_PUBLIC_SITE_URL"
    );
  }

  if (!token) {
    throw new Error("ADMIN_CLAW_TOKEN is required for API workers");
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? `: ${error.cause.message}`
        : "";

    throw new Error(
      `${path} fetch failed via ${baseUrlForLog(baseUrl)}: ${message}${cause}`
    );
  }

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
  metadata: Record<string, unknown> = {},
  options: InternalApiWorkerOptions = {}
) {
  if (!reserved.task?.id || !reserved.agent?.id) {
    return;
  }

  try {
    await requestJson(
      `/api/tasks/${reserved.task.id}/comment`,
      {
        agentId: reserved.agent.id,
        authorName: "Internal API worker",
        authorType: "worker",
        body,
        commentType: "status",
        metadata,
        visibility: "worker"
      },
      options
    );
  } catch {
    // Progress notes are useful but should never block task execution.
  }
}

async function reserveTask(
  group: WorkerGroup,
  options: InternalApiWorkerOptions = {}
) {
  return requestJson<ReserveResponse>(
    "/api/tasks/reserve",
    {
      agent: group.agent,
      leaseSeconds: group.leaseSeconds,
      mustRequireCapability: group.mustRequireCapability,
      taskTypes: [...group.taskTypes]
    },
    options
  );
}

async function failReservedTask(
  reserved: ReserveResponse,
  error: unknown,
  options: InternalApiWorkerOptions = {}
) {
  if (!reserved.task?.id || !reserved.reservationId || !reserved.agent?.id) {
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown task error";

  await requestJson(
    `/api/tasks/${reserved.task.id}/fail`,
    {
      agentId: reserved.agent.id,
      errorMessage: message,
      reservationId: reserved.reservationId,
      resultPayload: {
        taskType: reserved.task.taskType
      }
    },
    options
  );
}

async function processGroup(
  group: WorkerGroup,
  options: InternalApiWorkerOptions = {}
) {
  let reserved: ReserveResponse;

  try {
    reserved = await reserveTask(group, options);
  } catch (error) {
    console.error("Unable to reserve worker task", error);
    return false;
  }

  if (!reserved.task || !reserved.workItem || !reserved.reservationId) {
    return false;
  }

  try {
    await addWorkerComment(
      reserved,
      "Task execution started.",
      {
        workerMode: "internal_api"
      },
      options
    );
    const resultPayload = await executeTaskWorkItem(reserved.workItem);

    await requestJson(
      `/api/tasks/${reserved.task.id}/complete`,
      {
        agentId: reserved.agent?.id,
        reservationId: reserved.reservationId,
        resultPayload
      },
      options
    );
    return true;
  } catch (error) {
    try {
      await failReservedTask(reserved, error, options);
    } catch (failureError) {
      console.error("Unable to report worker task failure", failureError);
    }
    return true;
  }
}

async function runWorkerLane(
  maxTasks: number,
  options: InternalApiWorkerOptions = {}
) {
  let processed = 0;

  while (processed < maxTasks) {
    let didWork = false;

    for (const group of DEFAULT_WORKER_GROUPS) {
      if (processed >= maxTasks) {
        break;
      }

      const worked = await processGroup(group, options);

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

export async function runInternalApiWorker(
  options: InternalApiWorkerOptions = {}
) {
  const maxTasks = positiveInteger(
    process.env.WORKER_MAX_TASKS_PER_TICK,
    DEFAULT_MAX_TASKS_PER_TICK
  );
  const concurrency = positiveInteger(
    process.env.WORKER_CONCURRENCY,
    DEFAULT_WORKER_CONCURRENCY
  );

  await Promise.all(
    Array.from({ length: concurrency }, () => runWorkerLane(maxTasks, options))
  );
}

export function kickInternalApiWorker(options: InternalApiWorkerOptions = {}) {
  if (globalWorker.mattanutraInternalApiWorker) {
    return globalWorker.mattanutraInternalApiWorker;
  }

  globalWorker.mattanutraInternalApiWorker = runInternalApiWorker(options)
    .catch((error) => {
      console.error("Internal API worker failed", error);
    })
    .finally(() => {
      globalWorker.mattanutraInternalApiWorker = undefined;
    });

  return globalWorker.mattanutraInternalApiWorker;
}
