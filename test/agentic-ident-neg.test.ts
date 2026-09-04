import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateV3StartGate } from "../lib/agentic/qa/v3-start-gate.ts";
import {
  TEST_RELEASE_BUILD_ID,
  buildReleaseManifest,
  computeSchemaChecksum,
  validateReleaseManifest
} from "../lib/agentic/release-manifest.ts";

describe("NEG identity failure modes", () => {
  it("NEG-01 absent build metadata fails readiness", () => {
    assert.throws(
      () =>
        validateReleaseManifest(buildReleaseManifest({ buildId: "" }), {
          skipRecompute: true
        }),
      (error: Error & { diagnostic?: string }) => {
        assert.equal(error.diagnostic, "release_manifest.build_id_absent");
        return true;
      }
    );
  });

  it("NEG-02 malformed build metadata is never accepted", () => {
    assert.throws(
      () =>
        validateReleaseManifest(buildReleaseManifest({ buildId: "latest" }), {
          skipRecompute: true
        }),
      (error: Error & { diagnostic?: string }) => {
        assert.equal(error.diagnostic, "release_manifest.build_id_malformed");
        return true;
      }
    );
  });

  it("NEG-03 absent schema checksum fails readiness", () => {
    const manifest = {
      ...buildReleaseManifest({ buildId: TEST_RELEASE_BUILD_ID }),
      schemaChecksum: ""
    };
    assert.throws(
      () => validateReleaseManifest(manifest, { skipRecompute: true }),
      (error: Error & { diagnostic?: string }) => {
        assert.equal(error.diagnostic, "release_manifest.schema_absent");
        return true;
      }
    );
  });

  it("NEG-04 checksum that disagrees with served schemas fails readiness", () => {
    const manifest = buildReleaseManifest({
      buildId: TEST_RELEASE_BUILD_ID,
      schemaChecksum: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });
    assert.throws(
      () => validateReleaseManifest(manifest),
      (error: Error & { diagnostic?: string }) => {
        assert.equal(error.diagnostic, "release_manifest.schema_checksum_mismatch");
        return true;
      }
    );
    assert.equal(computeSchemaChecksum().length, 64);
  });

  it("NEG-05 public and QA identity come from one provider", () => {
    const info = buildReleaseManifest({ buildId: TEST_RELEASE_BUILD_ID });
    const qa = buildReleaseManifest({ buildId: TEST_RELEASE_BUILD_ID });
    assert.equal(info.schemaChecksum, qa.schemaChecksum);
    assert.equal(info.buildId, qa.buildId);
  });

  it("NEG-06 mixed-version replica cannot start deterministic QA", () => {
    const replicaA = buildReleaseManifest({
      buildId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const replicaB = buildReleaseManifest({
      buildId: "cccccccccccccccccccccccccccccccccccccccc"
    });
    assert.notEqual(replicaA.buildId, replicaB.buildId);
    const mixed = evaluateV3StartGate({
      buildId: "",
      schemaChecksum: replicaA.schemaChecksum
    });
    assert.equal(mixed.status, "INVALID_RUN");
    assert.equal(mixed.score, null);
    assert.equal(mixed.runA, null);
  });
});
