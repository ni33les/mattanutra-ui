import { spawn } from "node:child_process";
import net from "node:net";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const port = Number(process.env.PORT || process.env.NEXT_PORT || 3000);
const host = "127.0.0.1";
const workerMode = process.env.PLATFORM_WORKER_MODE || "all";
const workerApiBaseUrl =
  process.env.PLATFORM_WORKER_API_BASE_URL || `http://${host}:${port}`;
const startupTimeoutMs = Number(process.env.PLATFORM_STARTUP_TIMEOUT_MS || 120_000);
const shutdownTimeoutMs = Number(process.env.PLATFORM_SHUTDOWN_TIMEOUT_MS || 25_000);

const children = new Map();
let shuttingDown = false;
let workerRestartDelayMs = 1_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerAgentKeyConfigured() {
  return Object.entries(process.env).some(
    ([key, value]) =>
      key.startsWith("WORKER_") &&
      key.endsWith("_AGENT_API_KEY") &&
      value?.trim()
  );
}

function startProcess(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    env,
    stdio: "inherit"
  });

  children.set(name, child);
  console.log(`[platform] started ${name} pid=${child.pid}`);

  child.on("exit", (code, signal) => {
    children.delete(name);

    if (shuttingDown) {
      return;
    }

    if (name === "worker") {
      console.error(
        `[platform] worker exited code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${workerRestartDelayMs}ms`
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
      `[platform] ${name} exited code=${code ?? "null"} signal=${signal ?? "null"}`
    );
    void shutdown(code && code > 0 ? code : 1);
  });

  return child;
}

function connectToPort() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve();
    });

    socket.setTimeout(1_000);
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out waiting for ${host}:${port}`));
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
    `Web server did not listen on ${host}:${port} within ${startupTimeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`
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
      console.error(`[platform] failed to send ${signal} to pid=${child.pid}`, error);
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
      workerMode
    ],
    {
      ...process.env,
      WORKER_API_BASE_URL: workerApiBaseUrl
    }
  );
}

async function main() {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT/NEXT_PORT value: ${process.env.PORT}`);
  }

  startProcess("web", process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    host,
    "-p",
    String(port)
  ]);
  await waitForWeb();

  console.log(`[platform] web is listening on ${host}:${port}`);

  if (!workerAgentKeyConfigured()) {
    console.error(
      "[platform] DB-managed agent API keys are not configured; web is running without platform workers. Set profile-specific WORKER_<MODE>_AGENT_API_KEY values to enable workers."
    );
    return;
  }

  console.log(`[platform] worker API base URL: ${workerApiBaseUrl}`);
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
