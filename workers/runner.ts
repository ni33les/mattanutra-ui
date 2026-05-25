import { hostname } from "node:os";
import nextEnv from "@next/env";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import {
  SYSTEM_AGENTS,
  type SystemAgentKey
} from "../lib/system-agents.ts";
import { WorkerApiClient, type WorkerAgentConfig } from "./api-client.ts";

nextEnv.loadEnvConfig(process.cwd());

type WorkerMode =
  | "advisor"
  | "all"
  | "communications"
  | "content"
  | "email"
  | "food"
  | "formulation"
  | "healthscore"
  | "hosting"
  | "products"
  | "supplement";
type WorkerProfileMode = Exclude<WorkerMode, "all" | "supplement">;

const DEFAULT_POLL_WAIT_SECONDS = 20;
const DEFAULT_LEASE_SECONDS = 900;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const INITIAL_AGENT_RESTART_BACKOFF_MS = 1_000;
const MAX_AGENT_RESTART_BACKOFF_MS = 30_000;
const MAX_POLLING_BACKOFF_MS = 30_000;
const MAX_WORKER_PROFILE_CONCURRENCY = 8;
const WORKER_PROFILE_STARTUP_STAGGER_MS = 350;
const WORKER_PROFILE_MODES: readonly WorkerProfileMode[] = [
  "advisor",
  "communications",
  "content",
  "email",
  "food",
  "formulation",
  "healthscore",
  "hosting",
  "products"
];

type ActiveSession = Readonly<{
  agentId: string;
  client: WorkerApiClient;
  workerSessionId: string;
}>;

type WorkerHeartbeatStatus = "idle" | "working";

const activeSessions = new Map<string, ActiveSession>();
let shuttingDown = false;

function envText(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  max: number
) {
  return Math.min(positiveInteger(value, fallback), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(current: number, max = MAX_AGENT_RESTART_BACKOFF_MS) {
  return Math.min(current * 2, max);
}

function jitter(ms: number) {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isStaleWorkerSessionError(error: unknown) {
  return errorMessage(error).toLowerCase().includes("worker session not found");
}

async function retryApiCall<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = 3
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(jitter(750 * attempt));
      }
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${errorMessage(lastError)}`);
}

function workerMode(value: string | undefined): WorkerMode {
  if (value === "supplement") {
    return "formulation";
  }

  return value === "communications" ||
    value === "content" ||
    value === "email" ||
    value === "food" ||
    value === "formulation" ||
    value === "healthscore" ||
    value === "hosting" ||
    value === "products" ||
    value === "advisor"
    ? value
    : "all";
}

function workerVersion() {
  return envText("WORKER_VERSION", envText("npm_package_version", "dev"));
}

function instanceId(mode: WorkerProfileMode, slotIndex: number, slotCount: number) {
  const base = envText("WORKER_INSTANCE_ID", `${hostname()}:${process.pid}`);
  const slotSuffix = slotCount > 1 ? `:${slotIndex + 1}` : "";

  return `${base}:${mode}${slotSuffix}`;
}

function agentProfile(
  agentKey: SystemAgentKey,
  taskTypes: readonly string[]
): WorkerAgentConfig {
  const agent = SYSTEM_AGENTS[agentKey];

  return {
    capabilities: [...agent.capabilities],
    id: agent.id,
    metadata: {
      ...agent.metadata,
      systemAgent: true
    },
    model: agent.model,
    name: agent.name,
    taskTypes,
    type: agent.type
  };
}

const WORKER_PROFILES: Record<WorkerProfileMode, WorkerAgentConfig> = {
  advisor: agentProfile("nutritionPlanAdvisor", [
    "generate_nutrition_report",
    "nutrition_plan_chat_reply",
    "refine_nutrition_plan"
  ]),
  communications: agentProfile("communicationsCoordinator", [
    "client_safety_followup"
  ]),
  content: agentProfile("contentPublisher", ["content_status_change"]),
  email: agentProfile("emailDispatcher", [
    "send_example_email",
    "send_reassessment_email"
  ]),
  food: agentProfile("foodGuidanceWorker", [
    "generate_food_guidance"
  ]),
  formulation: agentProfile("formulationWorker", [
    "generate_example_supplement_guidance",
    "generate_supplement_guidance"
  ]),
  healthscore: agentProfile("healthScoreEngine", ["analyze_healthscore"]),
  hosting: agentProfile("scheduler", ["sync_digitalocean_billing"]),
  products: agentProfile("productMatcher", [
    "generate_product_recommendations"
  ])
};

function profileForMode(mode: WorkerProfileMode) {
  return WORKER_PROFILES[mode];
}

function workerConcurrency(mode: WorkerProfileMode) {
  const profileEnvName = `WORKER_${mode.toUpperCase()}_CONCURRENCY`;
  const defaultConcurrency = boundedPositiveInteger(
    process.env.WORKER_CONCURRENCY,
    1,
    MAX_WORKER_PROFILE_CONCURRENCY
  );

  return boundedPositiveInteger(
    process.env[profileEnvName],
    defaultConcurrency,
    MAX_WORKER_PROFILE_CONCURRENCY
  );
}

function requireConfig() {
  const baseUrl =
    envText("WORKER_API_BASE_URL") ||
    envText("MATTANUTRA_API_BASE_URL") ||
    envText("APP_BASE_URL") ||
    "http://localhost:3000";
  const token = envText("WORKER_API_TOKEN");

  if (!token) {
    throw new Error("WORKER_API_TOKEN is required for external workers");
  }

  return { baseUrl, token };
}

async function executeWorkItem(
  client: WorkerApiClient,
  workItem: Record<string, unknown>
) {
  if (workItem.taskType === "client_safety_followup") {
    const communication = await client.sendCommunication({
      body: workItem.body,
      messageType: "safety_review_decision",
      metadata: workItem.metadata,
      planId: workItem.planId,
      subject: workItem.subject,
      taskId: workItem.taskId
    });

    return { communication };
  }

  return executeTaskWorkItem(workItem as never);
}

async function runAgentLoop(
  mode: WorkerProfileMode,
  config: Readonly<{ baseUrl: string; token: string }>,
  slotIndex: number,
  slotCount: number
) {
  const client = new WorkerApiClient(config);
  const agentConfig = profileForMode(mode);
  const slotLabel = slotCount > 1 ? ` slot ${slotIndex + 1}/${slotCount}` : "";
  let activeSessionKey: string | null = null;
  let activeSession: ActiveSession | null = null;
  const registration = await retryApiCall(
    `${agentConfig.name}${slotLabel} registration`,
    () =>
      client.register({
        agent: agentConfig,
        concurrency: 1,
        instanceId: instanceId(mode, slotIndex, slotCount),
        workerVersion: workerVersion()
      }),
    5
  );
  const agent = registration.agent;
  const workerSessionId = registration.session.id;
  const sessionKey = `${agent.id}:${workerSessionId}`;
  const leaseSeconds =
    positiveInteger(
      process.env.WORKER_LEASE_SECONDS,
      registration.polling.leaseSeconds
    ) || DEFAULT_LEASE_SECONDS;
  const waitSeconds =
    positiveInteger(
      process.env.WORKER_POLL_WAIT_SECONDS,
      registration.polling.waitSeconds
    ) || DEFAULT_POLL_WAIT_SECONDS;
  const heartbeatIntervalMs = positiveInteger(
    process.env.WORKER_HEARTBEAT_INTERVAL_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS
  );

  activeSession = { agentId: agent.id, client, workerSessionId };
  activeSessionKey = sessionKey;
  activeSessions.set(sessionKey, activeSession);

  let heartbeatStatus: WorkerHeartbeatStatus = "idle";
  let heartbeatTaskId: string | null = null;
  let staleHeartbeatError: Error | null = null;
  const heartbeat = setInterval(() => {
    void retryApiCall(`${agent.name} heartbeat`, () =>
      client.heartbeat({
        agentId: agent.id,
        currentTaskId: heartbeatTaskId,
        status: heartbeatStatus,
        workerSessionId
      }),
      2
    ).catch((error) => {
      if (isStaleWorkerSessionError(error)) {
        staleHeartbeatError = new Error(
          `${agent.name} worker session ${workerSessionId} no longer exists; re-registering`
        );
        return;
      }

      console.error(
        `[agent] ${agent.name} heartbeat failed: ${errorMessage(error)}`
      );
    });
  }, heartbeatIntervalMs);
  (heartbeat as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();

  try {
    await retryApiCall(`${agent.name} initial heartbeat`, () =>
      client.heartbeat({
        agentId: agent.id,
        status: "idle",
        workerSessionId
      })
    );

    console.log(
      `[agent] ${agent.name}${slotLabel} registered session ${workerSessionId} for ${agentConfig.taskTypes.join(", ")}`
    );

    let pollingBackoffMs = 1_000;

    while (!shuttingDown) {
      if (staleHeartbeatError) {
        throw staleHeartbeatError;
      }

      let reserved: Awaited<ReturnType<WorkerApiClient["reserve"]>>;

      try {
        heartbeatStatus = "idle";
        heartbeatTaskId = null;
        reserved = await client.reserve({
          agent,
          leaseSeconds,
          taskTypes: agentConfig.taskTypes,
          waitSeconds,
          workerSessionId
        });
        pollingBackoffMs = 1_000;
      } catch (error) {
        heartbeatStatus = "idle";
        heartbeatTaskId = null;

        if (isStaleWorkerSessionError(error)) {
          throw new Error(
            `${agent.name} worker session ${workerSessionId} no longer exists; re-registering`
          );
        }

        console.error(
          `[agent] ${agent.name} polling failed: ${errorMessage(error)}`
        );
        await sleep(jitter(pollingBackoffMs));
        pollingBackoffMs = nextBackoff(pollingBackoffMs, MAX_POLLING_BACKOFF_MS);
        continue;
      }

      if (!reserved.task || !reserved.reservationId || !reserved.workItem) {
        heartbeatStatus = "idle";
        heartbeatTaskId = null;
        continue;
      }

      const reservationId = reserved.reservationId;
      const task = reserved.task;
      const taskId = task.id;
      const taskType = task.taskType;
      const workItem = reserved.workItem;
      heartbeatStatus = "working";
      heartbeatTaskId = taskId;
      const renew = setInterval(() => {
        void retryApiCall(`${agent.name} task lease renewal`, () =>
          client.renew({
            agentId: agent.id,
            leaseSeconds,
            reservationId,
            taskId,
            workerSessionId
          }),
          2
        ).catch((error) => {
          console.error(
            `[agent] ${agent.name} could not renew task ${taskId}: ${errorMessage(error)}`
          );
        });
      }, Math.max(30_000, Math.floor(leaseSeconds * 400)));
      (renew as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();

      try {
        const resultPayload = await executeWorkItem(client, workItem);

        clearInterval(renew);
        await retryApiCall(`${agent.name} task completion`, () =>
          client.complete({
            agentId: agent.id,
            reservationId,
            resultPayload: resultPayload as Record<string, unknown>,
            taskId,
            workerSessionId
          })
        );
        heartbeatStatus = "idle";
        heartbeatTaskId = null;
      } catch (error) {
        clearInterval(renew);
        let staleSession = isStaleWorkerSessionError(error);

        await retryApiCall(`${agent.name} task failure`, () =>
          client.fail({
            agentId: agent.id,
            errorMessage: errorMessage(error),
            reservationId,
            resultPayload: {
              taskType
            },
            taskId,
            workerSessionId
          })
        ).catch((failureError) => {
          staleSession ||= isStaleWorkerSessionError(failureError);
          console.error(
            `[agent] ${agent.name} could not mark task failed: ${errorMessage(failureError)}`
          );
        });

        if (staleSession) {
          throw new Error(
            `${agent.name} worker session ${workerSessionId} went stale while handling task ${taskId}; re-registering`
          );
        }

        heartbeatStatus = "idle";
        heartbeatTaskId = null;
      }
    }
  } finally {
    clearInterval(heartbeat);

    if (!shuttingDown && activeSessionKey && activeSession) {
      await markSessionOffline(activeSessionKey, activeSession);
    }
  }
}

async function markSessionOffline(
  sessionKey: string,
  session: ActiveSession
) {
  activeSessions.delete(sessionKey);

  await retryApiCall(
    "agent session offline heartbeat",
    () =>
      session.client.heartbeat({
        agentId: session.agentId,
        status: "offline",
        workerSessionId: session.workerSessionId
      }),
    2
  ).catch((error) => {
    console.error(
      `[agent] could not mark session ${session.workerSessionId} offline: ${errorMessage(error)}`
    );
  });
}

async function markSessionsOffline() {
  const sessions = [...activeSessions.entries()];

  await Promise.allSettled(
    sessions.map(([sessionKey, session]) =>
      markSessionOffline(sessionKey, session)
    )
  );
}

async function runSupervisedAgentLoop(
  mode: WorkerProfileMode,
  config: Readonly<{ baseUrl: string; token: string }>,
  slotIndex = 0,
  slotCount = 1,
  startupDelayMs = 0
) {
  const agentName = profileForMode(mode).name;
  const slotLabel = slotCount > 1 ? ` slot ${slotIndex + 1}/${slotCount}` : "";
  let restartBackoffMs = INITIAL_AGENT_RESTART_BACKOFF_MS;

  if (startupDelayMs > 0) {
    await sleep(jitter(startupDelayMs));
  }

  while (!shuttingDown) {
    try {
      await runAgentLoop(mode, config, slotIndex, slotCount);
      restartBackoffMs = INITIAL_AGENT_RESTART_BACKOFF_MS;
    } catch (error) {
      console.error(
        `[agent] ${agentName}${slotLabel} loop failed: ${errorMessage(error)}`
      );
    }

    if (!shuttingDown) {
      console.error(
        `[agent] ${agentName}${slotLabel} restarting in ${restartBackoffMs}ms`
      );
      await sleep(jitter(restartBackoffMs));
      restartBackoffMs = nextBackoff(restartBackoffMs);
    }
  }
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await markSessionsOffline();
  process.exit(0);
}

async function runWorker(mode: WorkerMode) {
  const config = requireConfig();
  const modes =
    mode === "all" ? WORKER_PROFILE_MODES : ([mode] as readonly WorkerProfileMode[]);
  const loops = modes.flatMap((profileMode, profileIndex) => {
    const concurrency = workerConcurrency(profileMode);

    return Array.from({ length: concurrency }, (_, slotIndex) =>
      runSupervisedAgentLoop(
        profileMode,
        config,
        slotIndex,
        concurrency,
        (profileIndex + slotIndex) * WORKER_PROFILE_STARTUP_STAGGER_MS
      )
    );
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });

  await Promise.all(loops);
}

const mode = workerMode(process.argv[2] ?? process.env.WORKER_MODE);

runWorker(mode).catch((error) => {
  console.error(error);
  void markSessionsOffline().finally(() => process.exit(1));
});
