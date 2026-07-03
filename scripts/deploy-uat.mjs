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

function deriveUatDbUrl(value) {
  if (!value) {
    return null;
  }

  const url = new URL(value);
  const database = url.pathname.replace(/^\/+/, "");

  if (/uat/i.test(database)) {
    return url.toString();
  }

  if (/^mn-dev$/i.test(database)) {
    url.pathname = "/mn-uat";
  } else if (/mattanutra-dev/i.test(database)) {
    url.pathname = `/${database.replace(/mattanutra-dev/ig, "mattanutra-uat")}`;
  } else {
    url.pathname = "/mn-uat";
  }

  url.searchParams.set("sslmode", "require");

  return url.toString();
}

function uatDbUrl() {
  return process.env.UAT_DB_URL?.trim() || deriveUatDbUrl(process.env.DB_URL?.trim());
}

function uatSchemaDbUrl() {
  const explicitSchema =
    process.env.UAT_DB_SCHEMA_URL?.trim() || process.env.UAT_DB_OWNER_URL?.trim();

  if (explicitSchema) {
    return explicitSchema;
  }

  const sharedSchema =
    process.env.DB_SCHEMA_URL?.trim() || process.env.DB_OWNER_URL?.trim();

  if (sharedSchema) {
    return deriveUatDbUrl(sharedSchema);
  }

  return uatDbUrl();
}

function assertUatDbUrl(connection) {
  if (!connection) {
    throw new Error("Set UAT_DB_URL, or DB_URL that can be derived to the UAT database.");
  }

  const url = new URL(connection);
  const database = url.pathname.replace(/^\/+/, "");

  if (!/uat|mattanutra-uat/i.test(database) || /prd|prod/i.test(database)) {
    throw new Error(`Refusing to apply UAT schema to unexpected database "${database}".`);
  }
}

function uatRuntimeDatabaseEnv() {
  const connection = uatDbUrl();
  assertUatDbUrl(connection);

  return {
    ...process.env,
    DB_APPLICATION_NAME: process.env.DB_APPLICATION_NAME ?? "mattanutra-uat-deploy",
    DB_URL: connection,
    MATTANUTRA_ENV: "uat",
    UAT_DB_URL: connection
  };
}

function uatSchemaDatabaseEnv() {
  const connection = uatSchemaDbUrl();
  assertUatDbUrl(connection);

  return {
    ...process.env,
    DB_ALLOW_DIRECT_CONNECTION: "true",
    DB_APPLICATION_NAME:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-uat-deploy-schema",
    DB_OWNER_URL: connection,
    DB_SCHEMA_URL: connection,
    DB_URL: connection,
    MATTANUTRA_ENV: "uat",
    UAT_DB_URL: uatDbUrl() ?? connection
  };
}

async function applyRuntimeSchema(env) {
  console.log("[deploy:uat] Applying runtime schema...");
  await run(npmCommand, ["run", "supplements:country-availability:schema:apply"], {
    env
  });
  await run(npmCommand, ["run", "products:soft-delete:schema:apply"], {
    env
  });
  await run(npmCommand, ["run", "products:v9:schema:apply"], {
    env
  });
  await run(npmCommand, ["run", "product-coverage:demand-cache:schema:apply"], {
    env
  });
  await run(npmCommand, ["run", "payments:schema:apply"], {
    env
  });
}

function runCaptureWithStatus(command, args = [], env = process.env) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      env,
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

async function runSmokeUntilActive(env = process.env) {
  let lastOutput = "";

  for (let attempt = 1; attempt <= smokeAttempts; attempt += 1) {
    console.log(`[deploy:uat] Running UAT smoke attempt ${attempt}/${smokeAttempts}...`);
    const result = await runCaptureWithStatus(npmCommand, ["run", "uat:smoke"], env);
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
      process.env.DO_SPACES_ACCESS_KEY?.trim() ||
      process.env.DO_SPACES_KEY_ID?.trim()
    ) &&
      (
        process.env.DO_SPACES_SECRET_ACCESS_KEY?.trim() ||
        process.env.DO_SPACES_SECRET_KEY?.trim() ||
        process.env.DO_SPACES_KEY?.trim()
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
  const runtimeEnv = uatRuntimeDatabaseEnv();
  const schemaEnv = uatSchemaDatabaseEnv();

  console.log(`[deploy:uat] Branch: ${branch}`);
  console.log(`[deploy:uat] Commit: ${commit}`);
  await applyRuntimeSchema(schemaEnv);
  await run("git", ["push", "origin", `HEAD:uat`]);
  await runSmokeUntilActive(runtimeEnv);
  await runImageStorageProbeIfConfigured();
  console.log("[deploy:uat] UAT deployment accepted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
