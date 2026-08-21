import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

describe("worker auth doctor", () => {
  it("ships an explicit doctor and repair command for worker credentials", () => {
    const doctorSource = readFileSync(
      new URL("../scripts/workers-doctor.ts", import.meta.url),
      "utf8",
    );
    const seedCredentialSource = readFileSync(
      new URL("../scripts/seed-worker-credential.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      packageJson.scripts?.["workers:doctor"] ?? "",
      /workers-doctor\.ts/,
    );
    assert.match(
      packageJson.scripts?.["workers:seed-credential"] ?? "",
      /seed-worker-credential\.ts/,
    );
    assert.match(
      packageJson.scripts?.["uat:workers:repair"] ?? "",
      /--repair --require-all/,
    );
    assert.match(doctorSource, /--configured-only/);
    assert.match(doctorSource, /--repair/);
    assert.match(doctorSource, /--require-all/);
    assert.match(doctorSource, /--json/);
    assert.match(doctorSource, /credential_hash_mismatch/);
    assert.match(doctorSource, /missing_tasks_write_permission/);
    assert.match(doctorSource, /missing_required_capability/);
    assert.match(doctorSource, /workers:doctor-env/);
    assert.match(doctorSource, /missing-db-url/);
    assert.match(doctorSource, /workerAgentKeyCount/);
    assert.match(doctorSource, /dbUrlVariantKeys/);
    assert.match(seedCredentialSource, /runtimeWorkerProfileForMode/);
    assert.match(seedCredentialSource, /MATTANUTRA_CONFIRM_PRD_WORKER_CREDENTIAL/);
    assert.match(seedCredentialSource, /seed-worker/);
    assert.match(seedCredentialSource, /metadata->>'envKey'/);
    assert.match(seedCredentialSource, /public\.agent_credentials/);
    assert.match(seedCredentialSource, /public\.organisation_memberships/);
    assert.doesNotMatch(seedCredentialSource, /retail_sellable_products/);
    assert.doesNotMatch(seedCredentialSource, /retail_product_stock/);
    assert.doesNotMatch(seedCredentialSource, /panya_config_versions/);
  });

  it("keeps worker credential repair out of request-time auth", () => {
    const accessSource = readFileSync(
      new URL("../lib/access-principal.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(accessSource, /runtimeWorkerCredentialProfileForToken/);
    assert.doesNotMatch(accessSource, /worker_auth_env_profile/);
    assert.doesNotMatch(
      accessSource,
      /set[\s\S]{0,200}credential_hash = \$\{credentialHash\}/i,
    );
    assert.match(accessSource, /agent credential rejected reason=/);
  });

  it("keeps UAT smoke strict about worker auth when external UAT secrets are explicit", () => {
    const smokeSource = readFileSync(
      new URL("../scripts/uat-smoke.mjs", import.meta.url),
      "utf8",
    );

    assert.match(smokeSource, /scripts\/workers-doctor\.ts/);
    assert.match(smokeSource, /worker auth doctor/);
    assert.match(smokeSource, /externalSecretChecksStrict/);
    assert.match(smokeSource, /UAT_SMOKE_REQUIRE_EXTERNAL_SECRETS/);
    assert.match(smokeSource, /local worker credential hash validation skipped/);
    assert.match(smokeSource, /DigitalOcean DB env/);
    assert.match(smokeSource, /DigitalOcean retired DB env/);
    assert.match(smokeSource, /DigitalOcean runtime environment/);
    assert.match(smokeSource, /DigitalOcean optimisation worker mode/);
    assert.match(
      smokeSource,
      /retiredDatabaseUrlKey = \["DATABASE", "URL"\]\.join\("_"\)/,
    );
    assert.match(
      smokeSource,
      /runtime logs show DB_URL is not visible to start:platform/,
    );
    assert.match(smokeSource, /last_seen_at >= now\(\) - interval '2 minutes'/);
    assert.match(smokeSource, /Worker API access is not authorized/);
  });

  it("keeps PRD and UAT product optimisation smoke tied to the analytics worker", () => {
    const profileSource = readFileSync(
      new URL("../scripts/runtime-worker-profiles.mjs", import.meta.url),
      "utf8",
    );
    const prdSmokeSource = readFileSync(
      new URL("../scripts/prd-smoke.mjs", import.meta.url),
      "utf8",
    );
    const uatSmokeSource = readFileSync(
      new URL("../scripts/uat-smoke.mjs", import.meta.url),
      "utf8",
    );

    assert.match(profileSource, /WORKER_ANALYTICS_AGENT_API_KEY/);
    assert.match(profileSource, /mode: "analytics"/);
    assert.match(prdSmokeSource, /requiredRuntimeWorkerProfiles\("prd"\)/);
    assert.match(uatSmokeSource, /requiredRuntimeWorkerProfiles\("uat"\)/);
    assert.match(
      prdSmokeSource,
      /platformWorkerModeRunsProfile\(platformWorkerMode, "analytics"\)/,
    );
    assert.match(
      uatSmokeSource,
      /platformWorkerModeRunsProfile\(platformWorkerMode, "analytics"\)/,
    );
    assert.match(
      prdSmokeSource,
      /\/en\/admin\/dashboard\?view=product-optimisation/,
    );
    assert.match(
      uatSmokeSource,
      /\/en\/admin\/dashboard\?view=product-optimisation/,
    );
    assert.match(prdSmokeSource, /admin_catalogue_optimization_job/);
    assert.match(uatSmokeSource, /admin_catalogue_optimization_job/);
  });

  it("keeps PRD smoke live-safe while preserving strict external secret checks", () => {
    const smokeSource = readFileSync(
      new URL("../scripts/prd-smoke.mjs", import.meta.url),
      "utf8",
    );
    const gitignore = readFileSync(
      new URL("../.gitignore", import.meta.url),
      "utf8",
    );
    const prdSmokeExample = readFileSync(
      new URL("../.env.prd-smoke.example", import.meta.url),
      "utf8",
    );

    assert.match(smokeSource, /scripts\/workers-doctor\.ts/);
    assert.match(smokeSource, /worker auth doctor/);
    assert.match(smokeSource, /externalSecretChecksStrict/);
    assert.match(smokeSource, /PRD_SMOKE_REQUIRE_EXTERNAL_SECRETS/);
    assert.match(smokeSource, /PRD_SMOKE_VALIDATE_LINE/);
    assert.match(smokeSource, /PRD_SMOKE_VALIDATE_DB/);
    assert.match(smokeSource, /PRD_SMOKE_VALIDATE_WORKER_CREDENTIALS/);
    assert.match(smokeSource, /PRD_SMOKE_REQUIRE_FRESH_WORKERS/);
    assert.match(smokeSource, /PRD_EXPECT_CLEAN_RUNTIME/);
    assert.match(smokeSource, /PRD_EXPECT_COMMIT/);
    assert.match(smokeSource, /mattanutra-ui-prd/);
    assert.match(smokeSource, /function prdDigitalOceanComponentName/);
    assert.match(smokeSource, /DigitalOcean deployed commit/);
    assert.match(
      packageJson.scripts?.["prd:smoke:strict"] ?? "",
      /PRD_SMOKE_VALIDATE_LINE=true/,
    );
    assert.match(
      packageJson.scripts?.["prd:smoke:strict"] ?? "",
      /PRD_SMOKE_REQUIRE_FRESH_WORKERS=true/,
    );
    assert.match(
      packageJson.scripts?.["prd:smoke:strict"] ?? "",
      /--env-file-if-exists=\.env\.prd-smoke/,
    );
    assert.match(
      smokeSource,
      /set PRD_SMOKE_VALIDATE_LINE=true to validate PRD LINE endpoint/,
    );
    assert.match(
      smokeSource,
      /set PRD_DB_URL, or DB_URL containing prd, to run DB checks/,
    );
    assert.match(
      smokeSource,
      /PRD_SMOKE_VALIDATE_DB=true requires PRD_DB_URL, or DB_URL containing prd/,
    );
    assert.match(
      smokeSource,
      /set PRD_SMOKE_VALIDATE_WORKER_CREDENTIALS=true for local worker token hash validation/,
    );
    assert.match(smokeSource, /DigitalOcean DB env/);
    assert.match(smokeSource, /DigitalOcean retired DB env/);
    assert.match(smokeSource, /DigitalOcean runtime environment/);
    assert.match(smokeSource, /DigitalOcean optimisation worker mode/);
    assert.match(
      smokeSource,
      /retiredDatabaseUrlKey = \["DATABASE", "URL"\]\.join\("_"\)/,
    );
    assert.match(
      smokeSource,
      /runtime logs show DB_URL is not visible to start:platform/,
    );
    assert.match(smokeSource, /last_seen_at >= now\(\) - interval '2 minutes'/);
    assert.match(smokeSource, /fresh worker session check deferred until post-deploy/);
    assert.match(smokeSource, /if \(expectCleanRuntime\)/);
    assert.match(smokeSource, /clean operational runtime/);
    assert.match(smokeSource, /Worker API access is not authorized/);
    assert.match(smokeSource, /severity === "skip"/);
    assert.match(smokeSource, /skippedCount/);
    assert.match(gitignore, /^\.env\.prd-smoke$/m);
    assert.match(prdSmokeExample, /^PRD_DB_URL=$/m);
    assert.match(prdSmokeExample, /^LINE_CHANNEL_ACCESS_TOKEN=$/m);
    assert.match(prdSmokeExample, /^WORKER_NONG MATA_AGENT_API_KEY=$/m);
  });
});
