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
  | "all"
  | "communications"
  | "content"
  | "email"
  | "formulation"
  | "healthscore"
  | "hosting";
type WorkerProfileMode = Exclude<WorkerMode, "all">;

const DEFAULT_POLL_WAIT_SECONDS = 20;
const DEFAULT_LEASE_SECONDS = 900;
const INITIAL_AGENT_RESTART_BACKOFF_MS = 1_000;
const MAX_AGENT_RESTART_BACKOFF_MS = 30_000;
const MAX_POLLING_BACKOFF_MS = 30_000;
const WORKER_PROFILE_MODES: readonly WorkerProfileMode[] = [
  "communications",
  "content",
  "email",
  "formulation",
  "healthscore",
  "hosting"
];

type ActiveSession = Readonly<{
  agentId: string;
  client: WorkerApiClient;
  workerSessionId: string;
}>;

const activeSessions = new Map<string, ActiveSession>();
let shuttingDown = false;

function envText(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  return value === "communications" ||
    value === "content" ||
    value === "email" ||
    value === "formulation" ||
    value === "healthscore" ||
    value === "hosting"
    ? value
    : "all";
}

function workerVersion() {
  return envText("WORKER_VERSION", envText("npm_package_version", "dev"));
}

function instanceId(mode: WorkerProfileMode) {
  const base = envText("WORKER_INSTANCE_ID", `${hostname()}:${process.pid}`);

  return `${base}:${mode}`;
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
  communications: agentProfile("communicationsCoordinator", [
    "client_safety_followup"
  ]),
  content: agentProfile("contentPublisher", ["content_status_change"]),
  email: agentProfile("emailDispatcher", [
    "send_example_email",
    "send_reassessment_email"
  ]),
  formulation: agentProfile("formulationWorker", [
    "generate_formulation",
    "generate_example_formulation"
  ]),
  healthscore: agentProfile("healthScoreEngine", ["analyze_healthscore"]),
  hosting: agentProfile("scheduler", ["sync_digitalocean_billing"])
};

function profileForMode(mode: WorkerProfileMode) {
  return WORKER_PROFILES[mode];
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
      goalId: workItem.goalId,
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
  config: Readonly<{ baseUrl: string; token: string }>
) {
  const client = new WorkerApiClient(config);
  const agentConfig = profileForMode(mode);
  const concurrency = positiveInteger(process.env.WORKER_CONCURRENCY, 1);
  let activeSessionKey: string | null = null;
  let activeSession: ActiveSession | null = null;
  const registration = await retryApiCall(
    `${agentConfig.name} registration`,
    () =>
      client.register({
        agent: agentConfig,
        concurrency,
        instanceId: instanceId(mode),
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

  activeSession = { agentId: agent.id, client, workerSessionId };
  activeSessionKey = sessionKey;
  activeSessions.set(sessionKey, activeSession);

  try {
    await retryApiCall(`${agent.name} initial heartbeat`, () =>
      client.heartbeat({
        agentId: agent.id,
        status: "idle",
        workerSessionId
      })
    );

    console.log(
      `[agent] ${agent.name} registered session ${workerSessionId} for ${agentConfig.taskTypes.join(", ")}`
    );

    let pollingBackoffMs = 1_000;

    while (!shuttingDown) {
      let reserved: Awaited<ReturnType<WorkerApiClient["reserve"]>>;

      try {
        await client.heartbeat({
          agentId: agent.id,
          status: "polling",
          workerSessionId
        });

        reserved = await client.reserve({
          agent,
          leaseSeconds,
          taskTypes: agentConfig.taskTypes,
          waitSeconds,
          workerSessionId
        });
        pollingBackoffMs = 1_000;
      } catch (error) {
        console.error(
          `[agent] ${agent.name} polling failed: ${errorMessage(error)}`
        );
        await sleep(jitter(pollingBackoffMs));
        pollingBackoffMs = nextBackoff(pollingBackoffMs, MAX_POLLING_BACKOFF_MS);
        continue;
      }

      if (!reserved.task || !reserved.reservationId || !reserved.workItem) {
        continue;
      }

      const reservationId = reserved.reservationId;
      const task = reserved.task;
      const taskId = task.id;
      const taskType = task.taskType;
      const workItem = reserved.workItem;
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
      } catch (error) {
        clearInterval(renew);
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
          console.error(
            `[agent] ${agent.name} could not mark task failed: ${errorMessage(failureError)}`
          );
        });
      }
    }
  } finally {
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
  config: Readonly<{ baseUrl: string; token: string }>
) {
  const agentName = profileForMode(mode).name;
  let restartBackoffMs = INITIAL_AGENT_RESTART_BACKOFF_MS;

  while (!shuttingDown) {
    try {
      await runAgentLoop(mode, config);
      restartBackoffMs = INITIAL_AGENT_RESTART_BACKOFF_MS;
    } catch (error) {
      console.error(
        `[agent] ${agentName} loop failed: ${errorMessage(error)}`
      );
    }

    if (!shuttingDown) {
      console.error(
        `[agent] ${agentName} restarting in ${restartBackoffMs}ms`
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

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });

  await Promise.all(
    modes.map((profileMode) => runSupervisedAgentLoop(profileMode, config))
  );
}

const mode = workerMode(process.argv[2] ?? process.env.WORKER_MODE);

runWorker(mode).catch((error) => {
  console.error(error);
  void markSessionsOffline().finally(() => process.exit(1));
});
