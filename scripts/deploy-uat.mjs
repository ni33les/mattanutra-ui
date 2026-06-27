import { npmCommand, run, runCapture } from "./dev-cycle-utils.mjs";
import { spawn } from "node:child_process";

const smokeAttempts = Number(process.env.UAT_DEPLOY_SMOKE_ATTEMPTS || 30);
const smokeDelayMs = Number(process.env.UAT_DEPLOY_SMOKE_DELAY_MS || 20_000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allowDirtyTree() {
  return process.env.UAT_DEPLOY_ALLOW_DIRTY === "1" || process.argv.includes("--allow-dirty");
}

function runCaptureWithStatus(command, args = []) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({
        code: 1,
        stderr: error instanceof Error ? error.message : String(error),
        stdout
      });
    });
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stderr,
        stdout
      });
    });
  });
}

async function runSmokeUntilActive() {
  let lastOutput = "";

  for (let attempt = 1; attempt <= smokeAttempts; attempt += 1) {
    console.log(`[deploy:uat] Running UAT smoke attempt ${attempt}/${smokeAttempts}...`);
    const result = await runCaptureWithStatus(npmCommand, ["run", "uat:smoke"]);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    lastOutput = output;

    if (output) {
      console.log(output);
    }

    if (result.code === 0) {
      return;
    }

    if (!/phase=(BUILDING|DEPLOYING|PENDING|SUPERSEDED)|no deployment/i.test(output)) {
      throw new Error("UAT smoke failed after deployment became checkable");
    }

    await sleep(smokeDelayMs);
  }

  throw new Error(
    `UAT smoke did not pass after ${smokeAttempts} attempts. Last output:\n${lastOutput}`
  );
}

async function runImageStorageProbeIfConfigured() {
  const required = process.env.UAT_IMAGE_STORAGE_PROBE_REQUIRED === "true";
  const hasEndpoint = Boolean(process.env.DO_SPACES_ENDPOINT?.trim());
  const hasExplicitCredentials = Boolean(
    (
      process.env.DO_SPACES_ACCESS_KEY_ID?.trim() ||
      process.env.DO_SPACES_ACCESS_KEY?.trim()
    ) &&
      (
        process.env.DO_SPACES_SECRET_ACCESS_KEY?.trim() ||
        process.env.DO_SPACES_SECRET_KEY?.trim()
      )
  );
  const hasLegacyCredentials = Boolean(process.env.DO_SPACES_KEY?.trim());

  if (!hasEndpoint || (!hasExplicitCredentials && !hasLegacyCredentials)) {
    const message =
      "[deploy:uat] Skipping image storage probe because local Spaces credentials are not configured.";

    if (required) {
      if (process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim()) {
        console.log("[deploy:uat] Running UAT app image storage probe...");
        await run(npmCommand, ["run", "uat:images:storage:probe:app"]);
        return;
      }

      throw new Error(`${message} Set DIGITALOCEAN_ACCESS_TOKEN or local Spaces envs.`);
    }

    console.warn(`${message} Run npm run uat:images:storage:probe:app to validate the deployed app env.`);
    return;
  }

  console.log("[deploy:uat] Running image storage probe...");
  await run(npmCommand, ["run", "uat:images:storage:probe"]);
}

async function main() {
  const branch = await runCapture("git", ["branch", "--show-current"]);
  const dirty = await runCapture("git", ["status", "--porcelain"]);

  if (dirty && !allowDirtyTree()) {
    throw new Error("Refusing to deploy UAT from a dirty working tree.");
  }

  const commit = await runCapture("git", ["rev-parse", "HEAD"]);

  console.log(`[deploy:uat] Branch: ${branch}`);
  console.log(`[deploy:uat] Commit: ${commit}`);
  await run("git", ["push", "origin", `HEAD:uat`]);
  await runSmokeUntilActive();
  await runImageStorageProbeIfConfigured();
  console.log("[deploy:uat] UAT deployment accepted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
