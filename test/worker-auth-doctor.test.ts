import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };

describe("worker auth doctor", () => {
  it("ships an explicit doctor and repair command for worker credentials", () => {
    const doctorSource = readFileSync(
      new URL("../scripts/workers-doctor.ts", import.meta.url),
      "utf8"
    );

    assert.match(packageJson.scripts?.["workers:doctor"] ?? "", /workers-doctor\.ts/);
    assert.match(packageJson.scripts?.["uat:workers:repair"] ?? "", /--repair --require-all/);
    assert.match(doctorSource, /--repair/);
    assert.match(doctorSource, /--require-all/);
    assert.match(doctorSource, /--json/);
    assert.match(doctorSource, /credential_hash_mismatch/);
    assert.match(doctorSource, /missing_tasks_write_permission/);
    assert.match(doctorSource, /missing_required_capability/);
  });

  it("keeps worker credential repair out of request-time auth", () => {
    const accessSource = readFileSync(
      new URL("../lib/access-principal.ts", import.meta.url),
      "utf8"
    );

    assert.doesNotMatch(accessSource, /runtimeWorkerCredentialProfileForToken/);
    assert.doesNotMatch(accessSource, /worker_auth_env_profile/);
    assert.doesNotMatch(accessSource, /set[\s\S]{0,200}credential_hash = \$\{credentialHash\}/i);
    assert.match(accessSource, /agent credential rejected reason=/);
  });

  it("keeps UAT smoke strict about worker auth and fresh worker sessions", () => {
    const smokeSource = readFileSync(
      new URL("../scripts/uat-smoke.mjs", import.meta.url),
      "utf8"
    );

    assert.match(smokeSource, /scripts\/workers-doctor\.ts/);
    assert.match(smokeSource, /worker auth doctor/);
    assert.match(smokeSource, /last_seen_at >= now\(\) - interval '2 minutes'/);
    assert.match(smokeSource, /Worker API access is not authorized/);
  });
});
