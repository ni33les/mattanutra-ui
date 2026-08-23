import { spawn } from "node:child_process";
import net from "node:net";
import nextEnv from "@next/env";

const retiredDatabaseUrlKey = ["DATABASE", "URL"].join("_");
const runtimeEnvBeforeLoad = describeRuntimeEnv(process.env);
const dbUrlBeforeLoad = process.env.DB_URL;

logRuntimeEnvDiagnostic("before-loadEnvConfig", runtimeEnvBeforeLoad);
nextEnv.loadEnvConfig(process.cwd());

const runtimeEnvAfterLoad = describeRuntimeEnv(process.env);
let restoredDbUrlAfterEnvLoad = false;

if (dbUrlBeforeLoad?.trim() && !process.env.DB_URL?.trim()) {
  process.env.DB_URL = dbUrlBeforeLoad;
  restoredDbUrlAfterEnvLoad = true;
}

const runtimeEnvAfterRestore = describeRuntimeEnv(process.env);

logRuntimeEnvDiagnostic("after-loadEnvConfig", runtimeEnvAfterLoad);

if (restoredDbUrlAfterEnvLoad) {
  console.error(
    "[platform] DB_URL was restored after local env loading removed or blanked it.",
  );
  logRuntimeEnvDiagnostic("after-db-url-restore", runtimeEnvAfterRestore, {
    force: true,
  });
}

const port = Number(process.env.PORT || process.env.NEXT_PORT || 3000);
const bindHost = process.env.PLATFORM_BIND_HOST || "0.0.0.0";
const probeHost =
  process.env.PLATFORM_PROBE_HOST ||
  (bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost);
const workerMode = process.env.PLATFORM_WORKER_MODE || "all";
const workerApiBaseUrl =
  process.env.PLATFORM_WORKER_API_BASE_URL || `http://127.0.0.1:${port}`;
const startupTimeoutMs = Number(
  process.env.PLATFORM_STARTUP_TIMEOUT_MS || 120_000,
);
const shutdownTimeoutMs = Number(
  process.env.PLATFORM_SHUTDOWN_TIMEOUT_MS || 25_000,
);
const workerAuthConfigurationExitCode = 78;

const children = new Map();
let shuttingDown = false;
let workerRestartDelayMs = 1_000;

function envValueState(value) {
  if (value === undefined) {
    return "missing";
  }

  return String(value).trim() ? "present" : "blank";
}

function normalizeEnvKeyForShape(key) {
  return key.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function visibleWorkerAgentKeys(env = process.env) {
  return Object.entries(env)
    .filter(
      ([key, value]) =>
        key.startsWith("WORKER_") &&
        key.endsWith("_AGENT_API_KEY") &&
        value?.trim(),
    )
    .map(([key]) => key)
    .sort();
}

function describeRuntimeEnv(env = process.env) {
  const keys = Object.keys(env);
  const hasDbUrlKey = Object.prototype.hasOwnProperty.call(env, "DB_URL");
  const dbLikeKeys = keys
    .filter((key) => {
      const normalized = normalizeEnvKeyForShape(key);

      return normalized.includes("DB") && normalized.includes("URL");
    })
    .sort();
  const dbUrlVariantKeys = keys
    .filter((key) => key !== "DB_URL" && key.trim().toUpperCase() === "DB_URL")
    .sort();
  const workerAgentKeys = visibleWorkerAgentKeys(env);

  return {
    dbLikeKeys,
    dbUrlKeyExists: hasDbUrlKey,
    dbUrlState: hasDbUrlKey ? envValueState(env.DB_URL) : "missing",
    dbUrlVariantKeys,
    retiredDatabaseUrlPresent: Object.prototype.hasOwnProperty.call(
      env,
      retiredDatabaseUrlKey,
    ),
    workerAgentKeyCount: workerAgentKeys.length,
    workerAgentKeys,
  };
}

function logRuntimeEnvDiagnostic(label, summary, options = {}) {
  if (!options.force && process.env.PLATFORM_ENV_DIAGNOSTICS !== "1") {
    return;
  }

  console.error(`[platform-env] ${label} ${JSON.stringify(summary)}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerAgentKeyConfigured() {
  return visibleWorkerAgentKeys().length > 0;
}

async function mcpRpc(method, params) {
  const response = await fetch(`http://${probeHost}:${port}/api/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
    }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`MCP ${method} HTTP ${response.status}`);
  }

  return body;
}

function structuredPlan(value) {
  const result = value?.result ?? value;
  const nested = result?.structuredContent ?? result;
  return nested && typeof nested === "object" ? nested : null;
}

async function warmDevPlanHotPath() {
  try {
    await mcpRpc("tools/call", {
      arguments: { locale: "en" },
      name: "info",
    });
    const created = structuredPlan(
      await mcpRpc("tools/call", {
        arguments: {
          idempotencyKey: `platform-hot-${Date.now()}`,
          request: {
            destinationCountry: "TH",
            locale: "en",
            medicationCodes: ["apixaban"],
            optimization: "balanced",
            profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
            requirements: {},
            targets: [
              { amount: 2000, name: "Vitamin D3", unit: "IU" },
              { amount: 1000, name: "Algae omega-3", unit: "mg" },
              { amount: 300, name: "Magnesium", unit: "mg" },
              { amount: 1000, name: "Vitamin B12", unit: "mcg" },
              { amount: 1000, name: "Vitamin C", unit: "mg" },
              { amount: 25, name: "Zinc", unit: "mg" },
              { amount: 10, name: "Iron", unit: "mg" },
              { amount: 100, name: "CoQ10", unit: "mg" },
            ],
          },
        },
        name: "plan",
      }),
    );

    if (created?.planHandle && created.revision != null) {
      const answers = (created.questions ?? []).flatMap((question) => {
        const choice = question.choices?.[0]?.choice;
        const questionId = question.questionId;
        if (
          choice &&
          (questionId === "q_safety_ack" || String(questionId).startsWith("q_gap_"))
        ) {
          return [{ choice, questionId }];
        }
        return [];
      });
      await mcpRpc("tools/call", {
        arguments: {
          answers,
          expectedRevision: created.revision,
          idempotencyKey: `platform-hot-${Date.now()}-patch`,
          planHandle: created.planHandle,
          ...(created.guidanceIds
            ? {
                safetyAcknowledgement: {
                  confirmed: true,
                  guidanceIds: created.guidanceIds,
                  revision: created.revision,
                },
              }
            : {}),
        },
        name: "plan",
      });
    }

    console.log("[platform] plan hot path warmed (create+patch)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[platform] DEV plan hot path warm failed: ${message}`);
  }
}

function startProcess(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    env,
    stdio: "inherit",
  });

  children.set(name, child);
  console.log(`[platform] started ${name} pid=${child.pid}`);

  child.on("exit", (code, signal) => {
    children.delete(name);

    if (shuttingDown) {
      return;
    }

    if (name === "worker") {
      if (code === workerAuthConfigurationExitCode) {
        console.error(
          "[platform] worker stopped because one or more DB-managed credentials are not authorized. Run npm run workers:doctor -- --require-all, repair the credentials, then redeploy.",
        );
        return;
      }

      console.error(
        `[platform] worker exited code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${workerRestartDelayMs}ms`,
      );
      setTimeout(() => {
        if (!shuttingDown) {
          startWorker();
        }
      }, workerRestartDelayMs);
      workerRestartDelayMs = Math.min(workerRestartDelayMs * 2, 30_000);
      return;
    }

    console.error(
      `[platform] ${name} exited code=${code ?? "null"} signal=${signal ?? "null"}`,
    );
    void shutdown(code && code > 0 ? code : 1);
  });

  return child;
}

function runOneShotProcess(name, command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });

    console.log(`[platform] started ${name} pid=${child.pid}`);

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${name} exited code=${code ?? "null"} signal=${signal ?? "null"}`,
        ),
      );
    });
  });
}

function connectToPort() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: probeHost, port }, () => {
      socket.end();
      resolve();
    });

    socket.setTimeout(1_000);
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out waiting for ${probeHost}:${port}`));
    });
  });
}

async function waitForWeb() {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await connectToPort();
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  throw new Error(
    `Web server did not listen on ${probeHost}:${port} within ${startupTimeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}

function terminate(child, signal) {
  if (!child.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.error(
        `[platform] failed to send ${signal} to pid=${child.pid}`,
        error,
      );
    }
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  const deadline = Date.now() + shutdownTimeoutMs;
  const worker = children.get("worker");

  if (worker) {
    terminate(worker, "SIGTERM");
  }

  while (children.has("worker") && Date.now() < deadline) {
    await sleep(100);
  }

  const web = children.get("web");

  if (web) {
    terminate(web, "SIGTERM");
  }

  while (children.size > 0 && Date.now() < deadline) {
    await sleep(100);
  }

  for (const child of children.values()) {
    terminate(child, "SIGKILL");
  }

  process.exit(exitCode);
}

function startWorker() {
  workerRestartDelayMs = Math.max(workerRestartDelayMs, 1_000);

  startProcess(
    "worker",
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-path-loader.mjs",
      "workers/runner.ts",
      workerMode,
    ],
    {
      ...process.env,
      DB_POOL_ROLE: "worker",
      WORKER_API_BASE_URL: workerApiBaseUrl,
    },
  );
}

async function checkWorkerCredentials() {
  const runtimeEnvBeforePreflight = describeRuntimeEnv(process.env);

  logRuntimeEnvDiagnostic("before-worker-preflight", runtimeEnvBeforePreflight);

  if (!process.env.DB_URL?.trim()) {
    console.error(
      "[platform] DB_URL is not visible in the runtime process; web is running without platform workers. Confirm DB_URL is RUN_TIME/RUN_AND_BUILD_TIME for the mattanutra-ui runtime and redeploy after changing env.",
    );
    logRuntimeEnvDiagnostic(
      "worker-preflight-missing-db-url",
      {
        afterLoadEnvConfig: runtimeEnvAfterLoad,
        afterRestore: runtimeEnvAfterRestore,
        beforeLoadEnvConfig: runtimeEnvBeforeLoad,
        beforeWorkerPreflight: runtimeEnvBeforePreflight,
        restoredDbUrlAfterEnvLoad,
      },
      { force: true },
    );
    return false;
  }

  try {
    // --repair rewrites agent_credentials.credential_hash to match the live
    // WORKER_*_AGENT_API_KEY values. On App Platform those keys are ENCRYPTED
    // (EV[...]) at rest and only decrypt inside this runtime, so repair must
    // run here — not from a laptop that only sees the ciphertext via the API.
    await runOneShotProcess(
      "worker auth preflight",
      process.execPath,
      [
        "--env-file-if-exists=.env.local",
        "--experimental-strip-types",
        "--import",
        "./scripts/register-ts-path-loader.mjs",
        "scripts/workers-doctor.ts",
        "--configured-only",
        "--repair",
        "--require-all",
      ],
      process.env,
    );

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[platform] worker auth preflight failed: ${message}`);
    console.error(
      "[platform] web is running without platform workers. Credential repair runs at boot; if this persists, check WORKER_*_AGENT_API_KEY and DB_URL on the App Platform component, then redeploy.",
    );

    return false;
  }
}

async function main() {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT/NEXT_PORT value: ${process.env.PORT}`);
  }

  startProcess("web", process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    bindHost,
    "-p",
    String(port),
  ]);
  await waitForWeb();

  console.log(
    `[platform] web is listening on ${bindHost}:${port} (probe ${probeHost}:${port})`,
  );

  await warmDevPlanHotPath();

  if (!workerAgentKeyConfigured()) {
    console.error(
      "[platform] DB-managed agent API keys are not configured; web is running without platform workers. Set profile-specific WORKER_<MODE>_AGENT_API_KEY values to enable workers.",
    );
    return;
  }

  console.log(`[platform] worker API base URL: ${workerApiBaseUrl}`);
  const credentialsOk = await checkWorkerCredentials();

  if (!credentialsOk) {
    return;
  }

  startWorker();
}

process.on("SIGTERM", () => {
  void shutdown(0);
});
process.on("SIGINT", () => {
  void shutdown(0);
});

main().catch((error) => {
  console.error(error);
  void shutdown(1);
});
