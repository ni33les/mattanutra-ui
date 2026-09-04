import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { infoTool, resetInfoCache } from "../lib/agentic/info.ts";
import { qaPreflight } from "../lib/agentic/qa/preflight.ts";
import { evaluateV3StartGate } from "../lib/agentic/qa/v3-start-gate.ts";
import {
  BUILD_ID_PATTERN,
  SCHEMA_CHECKSUM_PATTERN,
  TEST_RELEASE_BUILD_ID,
  buildReleaseManifest,
  pipelineBuildId,
  fingerprintReleaseIdentity,
  releaseManifest,
  resetReleaseManifestForTests,
  validateReleaseManifest
} from "../lib/agentic/release-manifest.ts";
import { CANONICAL_PLAN_VERSION } from "../lib/agentic/value/canonical-plan.ts";

describe("IDENT unit contract", () => {
  it("IDENT-01 public info always contains buildId and schemaChecksum when ok=true", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    assert.equal(info.ok, true);
    assert.equal(typeof info.buildId, "string");
    assert.equal(typeof info.schemaChecksum, "string");
  });

  it("IDENT-02 buildId equals the pipeline identifier and matches the full SHA format", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    const manifest = releaseManifest();
    assert.match(info.buildId ?? "", BUILD_ID_PATTERN);
    assert.equal(info.buildId, manifest.buildId);
    assert.equal(info.buildId, loadAgenticConfig().buildId);
    assert.equal(info.buildId, pipelineBuildId());
  });

  it("IDENT-03 schemaChecksum is a lowercase 64-character SHA-256 of the served schema bundle", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    assert.match(info.schemaChecksum ?? "", SCHEMA_CHECKSUM_PATTERN);
    assert.equal(info.schemaChecksum, releaseManifest().schemaChecksum);
  });

  it("IDENT-04 repeated serialization of the same release manifest is byte-identical", () => {
    const first = buildReleaseManifest({ buildId: TEST_RELEASE_BUILD_ID });
    const second = buildReleaseManifest({ buildId: TEST_RELEASE_BUILD_ID });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(fingerprintReleaseIdentity(first), fingerprintReleaseIdentity(second));
  });

  it("IDENT-05 locale invariance of identity fields", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const config = loadAgenticConfig();
    const [en, th, zh] = await Promise.all([
      infoTool({ config, locale: "en" }),
      infoTool({ config, locale: "th" }),
      infoTool({ config, locale: "zh-CN" })
    ]);
    for (const field of [
      "buildId",
      "schemaChecksum",
      "contractVersion",
      "researchVersion",
      "responsibilityVersion"
    ] as const) {
      assert.equal(en[field], th[field], field);
      assert.equal(en[field], zh[field], field);
    }
    assert.notEqual(en.description, th.description);
  });

  it("IDENT-06 missing build metadata never produces ok=true with omitted identity", () => {
    assert.throws(
      () => validateReleaseManifest(buildReleaseManifest({ buildId: "" }), { skipRecompute: true }),
      /build_id_absent|buildId/
    );
    assert.throws(
      () =>
        validateReleaseManifest(buildReleaseManifest({ buildId: "latest" }), {
          skipRecompute: true
        }),
      /build_id_malformed|git SHA/
    );
  });

  it("IDENT-07 public info and QA preflight read the same release manifest", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    const preflight = await qaPreflight();
    const manifest = releaseManifest();
    assert.equal(info.buildId, manifest.buildId);
    assert.equal(info.schemaChecksum, manifest.schemaChecksum);
    assert.equal(preflight.manifest.schemaChecksum, manifest.schemaChecksum);
    assert.equal(info.contractVersion, manifest.contractVersion);
    assert.equal(manifest.canonicalVersion, CANONICAL_PLAN_VERSION);
    const gate = evaluateV3StartGate(info);
    assert.equal(gate.status, "ELIGIBLE");
  });
});
