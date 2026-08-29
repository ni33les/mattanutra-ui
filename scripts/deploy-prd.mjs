import { spawn } from "node:child_process";
import { npmCommand, run, runCapture } from "./dev-cycle-utils.mjs";

const smokeAttempts = Number(process.env.PRD_DEPLOY_SMOKE_ATTEMPTS || 30);
const smokeDelayMs = Number(process.env.PRD_DEPLOY_SMOKE_DELAY_MS || 20_000);
const prdBranch = process.env.PRD_GIT_BRANCH?.trim() || "prd";
const forbiddenRolloutScripts = [
  "prd" + ":rebuild",
  "catalogue" + ":reload",
  "db" + ":reset:dev"
];

const forwardSchemaScripts = [
  "admin-access:schema:apply",
  "communications:schema:apply",
  "panya:schema:apply",
  "payments:schema:apply",
  "retail-checkout:schema:apply",
  "retail-financials:schema:apply",
  "retail-stock:schema:apply",
  "product-identifiers:schema:apply",
  "products:soft-delete:schema:apply",
  "products:v9:schema:apply",
  "product-regulatory:schema:apply",
  "product-coverage:demand-cache:schema:apply",
  "supplements:country-availability:schema:apply",
  "supplements:safety-limit-bands:schema:apply",
  "assessment:schema:apply",
  "foods:schema:apply",
  "recommendation-insights:schema:apply",
  "locales:schema:apply",
  "versions:core:apply",
  "thai-tax:schema:apply",
  "versions:core:check"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPrdConfirmation() {
  if (process.env.MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT !== "preserve") {
    throw new Error(
      "Refusing PRD deploy without MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT=preserve."
    );
  }
}

function assertPrdDbUrl(connection, label) {
  if (!connection) {
    throw new Error(`${label} is required for PRD deploy.`);
  }

  const url = new URL(connection);
  const database = url.pathname.replace(/^\/+/, "");
  const target = `${url.hostname}${url.pathname}`.toLowerCase();

  if (!/(mattanutra-prd|mn-prd|\/prd|[-_]prd|prod|production)/i.test(target)) {
    throw new Error(`Refusing PRD deploy against unexpected database "${database}".`);
  }
}

function prdRuntimeDbUrl() {
  return process.env.PRD_DB_URL?.trim() || process.env.DB_URL?.trim() || null;
}

function prdSchemaDbUrl() {
  return (
    process.env.PRD_DB_SCHEMA_URL?.trim() ||
    process.env.PRD_DB_OWNER_URL?.trim() ||
    null
  );
}

function prdRuntimeDatabaseEnv() {
  const connection = prdRuntimeDbUrl();

  assertPrdDbUrl(connection, "PRD_DB_URL/DB_URL");

  return {
    ...process.env,
    DB_APPLICATION_NAME: process.env.DB_APPLICATION_NAME ?? "mattanutra-prd-deploy",
    DB_URL: connection,
    MATTANUTRA_ENV: "prd",
    PRD_DB_URL: connection
  };
}

function prdSchemaDatabaseEnv() {
  const connection = prdSchemaDbUrl();

  assertPrdDbUrl(connection, "PRD_DB_SCHEMA_URL/PRD_DB_OWNER_URL");

  return {
    ...process.env,
    DB_ALLOW_DIRECT_CONNECTION: "true",
    DB_APPLICATION_NAME:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-prd-deploy-schema",
    DB_OWNER_URL: connection,
    DB_SCHEMA_URL: connection,
    DB_URL: connection,
    MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT: "preserve",
    MATTANUTRA_ENV: "prd",
    PRD_DB_OWNER_URL: connection,
    PRD_DB_SCHEMA_URL: connection,
    PRD_DB_URL: prdRuntimeDbUrl() ?? connection
  };
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

async function assertCleanUatApprovedCommit() {
  const dirty = await runCapture("git", ["status", "--porcelain"]);

  if (dirty) {
    throw new Error("Refusing to deploy PRD from a dirty working tree.");
  }

  await run("git", ["fetch", "origin", "uat"]);
  const head = await runCapture("git", ["rev-parse", "HEAD"]);
  const uatHead = await runCapture("git", ["rev-parse", "origin/uat"]);

  if (head !== uatHead) {
    throw new Error(
      `Refusing to deploy PRD from ${head}; origin/uat is ${uatHead}. Deploy the exact UAT-approved commit.`
    );
  }

  return head;
}

async function applyForwardSchema(env) {
  for (const scriptName of forwardSchemaScripts) {
    if (forbiddenRolloutScripts.includes(scriptName)) {
      throw new Error(`Refusing to run forbidden PRD rollout script ${scriptName}.`);
    }

    console.log(`[deploy:prd] Applying ${scriptName}...`);
    await run(npmCommand, ["run", scriptName], { env });
  }
}

async function runSmokeOnce(env) {
  await run(npmCommand, ["run", "prd:smoke"], { env });
}

async function runSmokeUntilActive(env = process.env) {
  let lastOutput = "";

  for (let attempt = 1; attempt <= smokeAttempts; attempt += 1) {
    console.log(`[deploy:prd] Running PRD smoke attempt ${attempt}/${smokeAttempts}...`);
    const result = await runCaptureWithStatus(npmCommand, ["run", "prd:smoke"], env);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    lastOutput = output;

    if (output) {
      console.log(output);
    }

    if (result.code === 0) {
      return;
    }

    if (!/phase=(BUILDING|DEPLOYING|PENDING|SUPERSEDED)|no deployment/i.test(output)) {
      throw new Error("PRD smoke failed after deployment became checkable.");
    }

    await sleep(smokeDelayMs);
  }

  throw new Error(
    `PRD smoke did not pass after ${smokeAttempts} attempts. Last output:\n${lastOutput}`
  );
}

async function runStrictSmokeIfRequested(env) {
  if (process.env.PRD_DEPLOY_STRICT_SMOKE !== "true") {
    return;
  }

  await run(npmCommand, ["run", "prd:smoke:strict"], { env });
}

async function main() {
  assertPrdConfirmation();

  const branch = await runCapture("git", ["branch", "--show-current"]);
  const commit = await assertCleanUatApprovedCommit();
  const runtimeEnv = prdRuntimeDatabaseEnv();
  const schemaEnv = prdSchemaDatabaseEnv();
  const postDeploySmokeEnv = {
    ...runtimeEnv,
    PRD_EXPECT_COMMIT: commit,
    PRD_SMOKE_REQUIRE_FRESH_WORKERS: "true"
  };

  console.log(`[deploy:prd] Branch: ${branch}`);
  console.log(`[deploy:prd] Commit: ${commit}`);
  console.log("[deploy:prd] Running pre-deploy PRD smoke...");
  await runSmokeOnce(runtimeEnv);
  await applyForwardSchema(schemaEnv);
  await run("git", ["push", "--force-with-lease", "origin", `HEAD:${prdBranch}`]);
  await runSmokeUntilActive(postDeploySmokeEnv);
  await runStrictSmokeIfRequested(postDeploySmokeEnv);
  console.log("[deploy:prd] PRD deployment accepted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
