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

    assert.match(
      packageJson.scripts?.["workers:doctor"] ?? "",
      /workers-doctor\.ts/,
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

  it("keeps PRD smoke live-safe while preserving strict external secret checks", () => {
    const smokeSource = readFileSync(
      new URL("../scripts/prd-smoke.mjs", import.meta.url),
      "utf8",
    );

    assert.match(smokeSource, /scripts\/workers-doctor\.ts/);
    assert.match(smokeSource, /worker auth doctor/);
    assert.match(smokeSource, /externalSecretChecksStrict/);
    assert.match(smokeSource, /PRD_SMOKE_REQUIRE_EXTERNAL_SECRETS/);
    assert.match(smokeSource, /PRD_EXPECT_CLEAN_RUNTIME/);
    assert.match(smokeSource, /mattanutra-ui-prd/);
    assert.match(
      smokeSource,
      /local worker credential hash validation skipped because local env is not explicitly PRD/,
    );
    assert.match(smokeSource, /DigitalOcean DB env/);
    assert.match(smokeSource, /DigitalOcean retired DB env/);
    assert.match(
      smokeSource,
      /retiredDatabaseUrlKey = \["DATABASE", "URL"\]\.join\("_"\)/,
    );
    assert.match(
      smokeSource,
      /runtime logs show DB_URL is not visible to start:platform/,
    );
    assert.match(smokeSource, /last_seen_at >= now\(\) - interval '2 minutes'/);
    assert.match(smokeSource, /if \(expectCleanRuntime\)/);
    assert.match(smokeSource, /clean operational runtime/);
    assert.match(smokeSource, /Worker API access is not authorized/);
  });
});
