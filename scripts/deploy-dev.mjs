import { payloadExpectedIdentity, readPayloadProof, compiledBuildIdentity } from "./mcp-payload/proof.mjs";
import { RELEASE_BASE as PAYLOAD_RELEASE_BASE } from "./mcp-payload/run-tests.mjs";
import { checkMcp721Proof, mcp721Identity } from "./mcp-721-proof.mjs";
import { mkdir, writeFile, readFile, cp, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sourceManifest } from "./run-full-test-suite.mjs";
import { axExpectedIdentity, readAxValidationProof } from "./ax-validation-proof.mjs";
import { npmCommand, npmRun, run, runCapture } from "./dev-cycle-utils.mjs";
import {validateRolloutBinding} from "./service-efficiency/rollout-proof.mjs";

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
  const boundariesIndex = process.argv.indexOf("--matching-lock-boundaries-attestation");
  let matchingBuild, matchingProofFile, matchingBuildHash;
  const simplePlanIndex = process.argv.indexOf("--mcp-simple-plan-attestation");
  const practicalIndex = process.argv.indexOf("--practical-matching-attestation");
  const discoveryIndex = process.argv.indexOf("--mcp-discovery-attestation");
  const efficiencyIndex = process.argv.indexOf("--service-efficiency-attestation");
  const scopedIndex = process.argv.indexOf("--ax-refinement-attestation");
  const payloadIndex = process.argv.indexOf("--mcp-payload-attestation");
  const patchIndex = process.argv.indexOf("--mcp-721-attestation");
  const conversationIndex = process.argv.indexOf("--mcp-conversation-attestation");
  const toolCardIndex = process.argv.indexOf("--mcp-tool-card-attestation");
  const latestPatchIndex = process.argv.indexOf("--mcp-723-attestation");
  const currentPatchIndex = process.argv.indexOf("--mcp-722-attestation");
  if ([boundariesIndex, simplePlanIndex, practicalIndex, discoveryIndex, efficiencyIndex, scopedIndex, payloadIndex, patchIndex, currentPatchIndex, latestPatchIndex, toolCardIndex, conversationIndex].filter(index => index >= 0).length > 1) throw new Error("Choose exactly one release attestation path");
  if (boundariesIndex >= 0 || simplePlanIndex >= 0 || practicalIndex >= 0 || discoveryIndex >= 0 || efficiencyIndex >= 0 || patchIndex >= 0 || currentPatchIndex >= 0 || latestPatchIndex >= 0 || toolCardIndex >= 0 || conversationIndex >= 0) {
    const packageId = boundariesIndex >= 0 ? "boundaries" : simplePlanIndex >= 0 ? "simple-plan" : practicalIndex >= 0 ? "practical" : discoveryIndex >= 0 ? "discovery" : efficiencyIndex >= 0 ? "efficiency" : conversationIndex >= 0 ? "conversation" : toolCardIndex >= 0 ? "724" : latestPatchIndex >= 0 ? "723" : currentPatchIndex >= 0 ? "722" : "721";
    if (branch !== "dev" || process.env.MATTANUTRA_ENV !== "dev") throw new Error("MCP work-package proof is DEV-only");
    const file = process.argv[(boundariesIndex >= 0 ? boundariesIndex : simplePlanIndex >= 0 ? simplePlanIndex : practicalIndex >= 0 ? practicalIndex : discoveryIndex >= 0 ? discoveryIndex : efficiencyIndex >= 0 ? efficiencyIndex : conversationIndex >= 0 ? conversationIndex : toolCardIndex >= 0 ? toolCardIndex : latestPatchIndex >= 0 ? latestPatchIndex : currentPatchIndex >= 0 ? currentPatchIndex : patchIndex) + 1];
    if (!file?.startsWith("/")) throw new Error("Pass the absolute MCP work-package attestation path");
    if (await runCapture("git", ["status", "--porcelain"])) throw new Error("Validated source must remain clean");
    const identity=mcp721Identity(sourceManifest().sha256, await runCapture("git", ["rev-parse", "HEAD"]), packageId);
    checkMcp721Proof(file, identity, packageId);
    if (["practical", "simple-plan", "boundaries"].includes(packageId)) {
      const active = await fetch("http://127.0.0.1:3000/api/mcp", { method: "HEAD", signal: AbortSignal.timeout(5000) });
      const base = active.headers.get("x-agentic-build-id");
      if (base !== identity.deploymentBases.dev && base !== identity.sourceCommit) throw new Error("DEV changed since practical matching qualification");
    }
    if(packageId === "efficiency") {
      const active=await fetch("http://127.0.0.1:3000/api/mcp",{method:"HEAD",signal:AbortSignal.timeout(5000)});
      validateRolloutBinding(JSON.parse(await readFile(resolve(dirname(file),"rollout.json"),"utf8")),identity,"dev",active.headers.get("x-agentic-build-id"));
    }
    const build = JSON.parse(await readFile(resolve(dirname(file), "build.json"), "utf8"));
    if (packageId === "boundaries") {
      const buildIndex = process.argv.indexOf("--matching-lock-build");
      matchingBuild = buildIndex >= 0 ? process.argv[buildIndex + 1] : undefined;
      if (!matchingBuild?.startsWith("/")) throw new Error("Pass the absolute attested --matching-lock-build directory");
      matchingProofFile = file;
      matchingBuildHash = build.buildSha256;
    }
    if (build.nextBuildId !== (await readFile(resolve(matchingBuild ?? ".next", "BUILD_ID"), "utf8")).trim() || build.buildSha256 !== compiledBuildIdentity(matchingBuild ?? ".next")) throw new Error("Validated compiled build changed");
    console.log(`[deploy:dev] Verified scoped MCP ${packageId} evidence: ${file}`);
  } else if (payloadIndex >= 0) {
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
  if (boundariesIndex >= 0) {
    // Stage the attested build while the old application still serves requests.
    // Stop every child worker before changing the dependency guard: old/global
    // and new/graph-scoped guard implementations must never execute together.
    const staged = resolve("tmp", `matching-lock-build-${await runCapture("git", ["rev-parse", "HEAD"])}`);
    await cp(matchingBuild, staged, { recursive: true, errorOnExist: true, force: false,
      filter: source => source !== resolve(matchingBuild, "cache") });
    if (compiledBuildIdentity(staged) !== matchingBuildHash) throw new Error("Staged matching build changed");
    await run("systemctl", ["stop", serviceName]);
    await rename(".next", resolve(dirname(matchingProofFile), "next-before"));
    await rename(staged, ".next");
    await run(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-matching-lock-boundaries.ts"], { env: schemaEnv() });
    await npmRun("dev-runtime-schema:verify");
  } else if (efficiencyIndex >= 0) {
    await run(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-service-efficiency-schema.ts"]);
    await npmRun("dev-runtime-schema:verify");
  } else if (simplePlanIndex >= 0 || practicalIndex >= 0 || discoveryIndex >= 0 || payloadIndex >= 0 || patchIndex >= 0 || latestPatchIndex >= 0 || toolCardIndex >= 0 || conversationIndex >= 0) {
    // These packages, including maintained MCP recovery fixes, require no migrations or catalogue changes.
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
  if (boundariesIndex >= 0 || simplePlanIndex >= 0 || practicalIndex >= 0 || discoveryIndex >= 0 || efficiencyIndex >= 0 || payloadIndex >= 0 || patchIndex >= 0 || currentPatchIndex >= 0 || latestPatchIndex >= 0 || toolCardIndex >= 0 || conversationIndex >= 0) await writeFile(`${dropInDir}/mcp-payload-worker-version.conf`, `[Service]\nEnvironment=WORKER_VERSION=${sha}\nEnvironment=AGENTIC_WORKER_VERSION=${sha}\n`, "utf8");
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
