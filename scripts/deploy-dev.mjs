import { payloadExpectedIdentity, readPayloadProof, compiledBuildIdentity } from "./mcp-payload/proof.mjs";
import { RELEASE_BASE as PAYLOAD_RELEASE_BASE } from "./mcp-payload/run-tests.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sourceManifest } from "./run-full-test-suite.mjs";
import { axExpectedIdentity, readAxValidationProof } from "./ax-validation-proof.mjs";
import { npmCommand, npmRun, run, runCapture } from "./dev-cycle-utils.mjs";

const serviceName = "mattanutra-ui-dev.service";
const schemaScripts = [
  "supplements:country-availability:schema:apply",
  // Updated reference readers/seeders require these additive provenance columns.
  "supplements:safety-reference-integrity:schema:apply",
  "supplements:safety-limit-life-stages:schema:apply",
  "products:soft-delete:schema:apply",
  "products:v9:schema:apply",
  "products:administration:schema:apply",
  "product-coverage:demand-cache:schema:apply",
  "payments:schema:apply",
  "web-funnel:schema:apply",
  "agentic:schema:apply",
  "matcher:runtime:schema:apply"
];
const smokeUrls = [
  "http://127.0.0.1:3000/en/admin/login",
  "https://dev.mattanutra.com/en/admin/login",
  "https://dev.mattanutra.com/api/mcp"
];

function allowNonDevBranch() {
  return (
    process.env.DEV_DEPLOY_ALLOW_NON_DEV === "1" ||
    process.argv.includes("--allow-non-dev")
  );
}

async function smokeCheck(url, attempts = 20) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual"
      });

      if (response.status >= 200 && response.status < 400) {
        console.log(`[deploy:dev] Smoke check passed: ${url} (${response.status})`);
        return;
      }

      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw lastError ?? new Error(`Smoke check failed: ${url}`);
}

function schemaEnv() {
  const schemaConnection =
    process.env.DB_SCHEMA_URL?.trim() || process.env.DB_OWNER_URL?.trim();

  if (!schemaConnection) {
    return process.env;
  }

  return {
    ...process.env,
    DB_ALLOW_DIRECT_CONNECTION: "true",
    DB_APPLICATION_NAME:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-dev-deploy-schema",
    DB_OWNER_URL: schemaConnection,
    DB_SCHEMA_URL: schemaConnection,
    DB_URL: schemaConnection
  };
}

async function applyOrVerifyRuntimeSchema() {
  const schemaConnection =
    process.env.DB_SCHEMA_URL?.trim() || process.env.DB_OWNER_URL?.trim();

  if (!schemaConnection) {
    console.log(
      "[deploy:dev] DB_SCHEMA_URL/DB_OWNER_URL not set; verifying existing runtime schema..."
    );
    await npmRun("dev-runtime-schema:verify");
    if (process.env.DB_URL) {
      console.log("[deploy:dev] Applying agentic schema via DB_URL...");
      await run(npmCommand, ["run", "agentic:schema:apply"]);
    }
    return;
  }

  console.log("[deploy:dev] Applying runtime schema...");

  for (const script of schemaScripts) {
    await run(npmCommand, ["run", script], {
      env: schemaEnv()
    });
  }
  await npmRun("dev-runtime-schema:verify");
}

async function main() {
  const branch = await runCapture("git", ["branch", "--show-current"]);

  if (branch !== "dev" && !allowNonDevBranch()) {
    throw new Error(
      `Refusing to deploy branch "${branch}". Use --allow-non-dev only for deliberate remote-box testing.`
    );
  }

  console.log(`[deploy:dev] Branch: ${branch}`);
  const scopedIndex = process.argv.indexOf("--ax-refinement-attestation");
  const payloadIndex = process.argv.indexOf("--mcp-payload-attestation");
  if (payloadIndex >= 0) {
    if (scopedIndex >= 0 || branch !== "dev" || process.env.MATTANUTRA_ENV !== "dev") throw new Error("MCP payload proof is DEV-only and cannot be combined with another bypass/path");
    const file = process.argv[payloadIndex + 1];
    if (!file?.startsWith("/")) throw new Error("Pass the absolute MCP payload attestation path");
    const proof = readPayloadProof(file, payloadExpectedIdentity(sourceManifest().sha256, PAYLOAD_RELEASE_BASE));
    if (await runCapture("git", ["status", "--porcelain"])) throw new Error("Validated source must remain clean");
    if (proof.sourceCommit !== await runCapture("git", ["rev-parse", "HEAD"])) throw new Error("Validated commit changed");
    const build = JSON.parse(await readFile(resolve(dirname(file), "build-identity.json"), "utf8"));
    if (build.nextBuildId !== (await readFile(".next/BUILD_ID", "utf8")).trim()) throw new Error("Validated build changed");
    if (build.buildSha256 !== compiledBuildIdentity()) throw new Error("Validated compiled artifacts changed");
    console.log(`[deploy:dev] Verified MCP payload work-package evidence: ${file}`);
  } else if (scopedIndex >= 0) {
    if (branch !== "dev" || process.env.MATTANUTRA_ENV !== "dev") throw new Error("AX work-package deployment requires the DEV environment and dev branch");
    const file = process.argv[scopedIndex + 1];
    if (!file || !file.startsWith("/")) throw new Error("Pass the absolute AX attestation path");
    const base = await runCapture("git", ["rev-parse", "22bce180"]);
    const proof = readAxValidationProof(file, axExpectedIdentity(sourceManifest().sha256, base));
    if (await runCapture("git", ["status", "--porcelain"])) throw new Error("Validated deployment source must remain clean");
    if (proof.sourceCommit !== await runCapture("git", ["rev-parse", "HEAD"])) throw new Error("Validated deployment commit changed");
    const build = JSON.parse(await readFile(resolve(dirname(file), "build-identity.json"), "utf8"));
    if (build.nextBuildId !== (await readFile(".next/BUILD_ID", "utf8")).trim()) throw new Error("Validated production build is missing or changed");
    console.log(`[deploy:dev] Verified AX work-package evidence: ${file}`);
  } else {
    await npmRun("verify:dev");
  }
  if (payloadIndex >= 0) {
    // This presentation-only package has no migrations or catalogue changes.
    await npmRun("dev-runtime-schema:verify");
  } else await applyOrVerifyRuntimeSchema();
  const sha = (await runCapture("git", ["rev-parse", "HEAD"])).trim();
  const dropInDir = "/etc/systemd/system/mattanutra-ui-dev.service.d";
  await mkdir(dropInDir, { recursive: true });
  await writeFile(
    `${dropInDir}/agentic-build.conf`,
    `[Service]\nEnvironment=AGENTIC_BUILD_ID=${sha}\nEnvironment=AGENTIC_WORKER_VERSION=${sha}\n`,
    "utf8"
  );
  if (payloadIndex >= 0) await writeFile(`${dropInDir}/mcp-payload-worker-version.conf`, `[Service]\nEnvironment=WORKER_VERSION=${sha}\nEnvironment=AGENTIC_WORKER_VERSION=${sha}\n`, "utf8");
  await run("systemctl", ["daemon-reload"]);
  console.log(`[deploy:dev] AGENTIC_BUILD_ID=${sha}`);
  console.log(`[deploy:dev] Restarting ${serviceName}...`);
  await run("systemctl", ["restart", serviceName]);
  await run("systemctl", ["is-active", "--quiet", serviceName]);
  console.log(`[deploy:dev] ${serviceName} is active.`);
  console.log("[deploy:dev] Running smoke checks...");

  for (const url of smokeUrls) {
    await smokeCheck(url);
  }

  console.log("[deploy:dev] Apply reviewed reference data separately after verifying the compatible application and workers; retain those readers during rollback.");
  console.log("[deploy:dev] DEV deploy complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
