import { closeSync, openSync, writeSync } from "node:fs";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";
import { npmRun, runCapture } from "./dev-cycle-utils.mjs";

nextEnv.loadEnvConfig(process.cwd());

const port = Number(process.env.PORT || process.env.NEXT_PORT || 3000);
const host = "127.0.0.1";
const adminRoute =
  process.env.DEV_LIVE_ADMIN_ROUTE ||
  `http://${host}:${port}/en/admin/dashboard?view=retail-reorder`;
const assetSmokeRoute =
  process.env.DEV_LIVE_ASSET_ROUTE ||
  `http://${host}:${port}/en/admin/login`;
const logPath = process.env.DEV_LIVE_LOG || "/tmp/mattanutra-platform.log";
const workerMode = process.env.PLATFORM_WORKER_MODE || "all";
const platformScriptName = "start:platform";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pgrep(pattern) {
  try {
    const stdout = await runCapture("pgrep", ["-f", pattern]);

    return stdout
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sendSignal(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

async function parentPid(pid) {
  try {
    const stdout = await runCapture("ps", ["-o", "ppid=", "-p", String(pid)]);
    const parsed = Number(stdout.trim());

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function portOwnerPids() {
  try {
    const stdout = await runCapture("ss", ["-ltnp", `sport = :${port}`]);
    const matches = stdout.matchAll(/pid=(\d+)/g);

    return [...new Set([...matches].map((match) => Number(match[1])))]
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

async function waitForPortFree() {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    if ((await portOwnerPids()).length === 0) {
      return;
    }

    await sleep(250);
  }

  const owners = await portOwnerPids();

  if (owners.length === 0) {
    return;
  }

  console.log(`[dev:live] Stopping stale port ${port} owners: ${owners.join(", ")}`);

  for (const pid of owners) {
    sendSignal(pid, "SIGTERM");
  }

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if ((await portOwnerPids()).length === 0) {
      return;
    }

    await sleep(250);
  }

  for (const pid of await portOwnerPids()) {
    sendSignal(pid, "SIGKILL");
  }
}

async function stopExistingPlatform() {
  const platformPids = await pgrep("scripts/start-platform.mjs");

  if (platformPids.length > 0) {
    console.log(`[dev:live] Stopping existing platform pids: ${platformPids.join(", ")}`);

    for (const pid of platformPids) {
      sendSignal(pid, "SIGTERM");
    }
  }

  let platformStopped = false;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await pgrep("scripts/start-platform.mjs")).length === 0) {
      platformStopped = true;
      break;
    }

    await sleep(250);
  }

  const stubbornPlatformPids = platformStopped
    ? []
    : await pgrep("scripts/start-platform.mjs");

  if (stubbornPlatformPids.length > 0) {
    console.log("[dev:live] Existing platform did not stop cleanly; forcing stop.");

    for (const pid of stubbornPlatformPids) {
      sendSignal(pid, "SIGKILL");
    }
  }

  for (const pid of await pgrep("workers/runner.ts")) {
    sendSignal(pid, "SIGTERM");
  }

  await waitForPortFree();
}

async function resolvePlatformPid(candidatePid) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    if (candidatePid && processAlive(candidatePid)) {
      return candidatePid;
    }

    const platformPids = await pgrep("scripts/start-platform.mjs");

    if (platformPids.length > 0) {
      return platformPids.sort((left, right) => right - left)[0];
    }

    await sleep(100);
  }

  return candidatePid;
}

async function startPlatform() {
  const log = openSync(logPath, "a");
  writeSync(log, `\n[dev:live] starting platform at ${new Date().toISOString()}\n`);

  console.log(
    `[dev:live] Starting ${platformScriptName} via node scripts/start-platform.mjs`
  );

  const child = spawn(process.execPath, ["scripts/start-platform.mjs"], {
    detached: true,
    env: process.env,
    stdio: ["ignore", log, log]
  });

  child.unref();
  closeSync(log);
  const platformPid = await resolvePlatformPid(child.pid);

  console.log(
    `[dev:live] Started platform supervisor pid=${platformPid}; log=${logPath}`
  );

  if (platformPid !== child.pid) {
    console.log(`[dev:live] Spawned pid ${child.pid} resolved to ${platformPid}`);
  }

  return platformPid;
}

async function curlStatus(url) {
  const stdout = await runCapture("curl", [
    "-sS",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    url
  ]);
  const status = Number(stdout);

  return Number.isInteger(status) ? status : 0;
}

async function curlBody(url) {
  return runCapture("curl", ["-sS", "-L", url]);
}

function assetUrlFor(ref) {
  const url = new URL(ref, assetSmokeRoute);

  return url.toString();
}

function staticAssetRefs(html) {
  const refs = new Set();
  const matches = html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g);

  for (const match of matches) {
    const ref = match[1];

    if (!ref || !/\.(?:css|js)(?:\?|$)/.test(ref)) {
      continue;
    }

    refs.add(assetUrlFor(ref));
  }

  return [...refs].sort();
}

async function verifyStaticAssets() {
  const html = await curlBody(assetSmokeRoute);
  const assets = staticAssetRefs(html);

  if (assets.length === 0) {
    throw new Error(`No Next static JS/CSS assets found in ${assetSmokeRoute}`);
  }

  const failures = [];

  for (const asset of assets) {
    const status = await curlStatus(asset);

    if (status < 200 || status >= 400) {
      failures.push(`${status} ${asset}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Next static asset smoke failed for ${assetSmokeRoute}:\n${failures.join("\n")}`
    );
  }

  console.log(
    `[dev:live] Static asset smoke passed for ${assets.length} JS/CSS assets: ${assetSmokeRoute}`
  );
}

async function waitForAdminRoute(platformPid) {
  let activePlatformPid = platformPid;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 80; attempt += 1) {
    if (!processAlive(activePlatformPid)) {
      const platformPids = await pgrep("scripts/start-platform.mjs");

      if (platformPids.length === 0) {
        throw new Error(`Platform supervisor exited before web became healthy`);
      }

      activePlatformPid = platformPids.sort((left, right) => right - left)[0];
      console.log(`[dev:live] Tracking platform supervisor pid=${activePlatformPid}`);
    }

    try {
      lastStatus = await curlStatus(adminRoute);

      if (lastStatus >= 200 && lastStatus < 400) {
        const ownerPids = await portOwnerPids();
        const childOwners = [];

        for (const pid of ownerPids) {
          if ((await parentPid(pid)) === activePlatformPid) {
            childOwners.push(pid);
          }
        }

        if (childOwners.length > 0) {
          console.log(`[dev:live] Admin route served ${lastStatus}: ${adminRoute}`);
          console.log(`[dev:live] Web pids: ${childOwners.join(", ")}`);
          return;
        }
      }
    } catch {
      lastStatus = 0;
    }

    await sleep(1_000);
  }

  throw new Error(
    `Admin route did not become healthy: ${adminRoute} last_status=${lastStatus}`
  );
}

async function verifyWorkers(platformPid) {
  let activePlatformPid = platformPid;
  const workerPattern = `workers/runner.ts ${workerMode}`;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (!processAlive(activePlatformPid)) {
      const platformPids = await pgrep("scripts/start-platform.mjs");

      if (platformPids.length > 0) {
        activePlatformPid = platformPids.sort((left, right) => right - left)[0];
        console.log(`[dev:live] Tracking platform supervisor pid=${activePlatformPid}`);
      }
    }

    const workerPids = [];

    for (const pid of await pgrep(workerPattern)) {
      if ((await parentPid(pid)) === activePlatformPid) {
        workerPids.push(pid);
      }
    }

    if (workerPids.length > 0) {
      console.log(`[dev:live] Worker pids: ${workerPids.join(", ")}`);
      return;
    }

    await sleep(1_000);
  }

  throw new Error(`No worker process found for pattern "${workerPattern}"`);
}

async function main() {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT/NEXT_PORT value: ${process.env.PORT}`);
  }

  await npmRun("build:dev-fast");
  await stopExistingPlatform();
  const platformPid = await startPlatform();
  await waitForAdminRoute(platformPid);
  await verifyStaticAssets();
  await verifyWorkers(platformPid);
  console.log("[dev:live] Rebuilt, restarted, and verified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
