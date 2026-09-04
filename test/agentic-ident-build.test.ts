import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { infoTool, resetInfoCache } from "../lib/agentic/info.ts";
import {
  BUILD_ID_PATTERN,
  TEST_RELEASE_BUILD_ID,
  buildReleaseManifest,
  pipelineBuildId,
  releaseManifest,
  resetReleaseManifestForTests,
  validateReleaseManifest
} from "../lib/agentic/release-manifest.ts";

describe("BUILD identity contract", () => {
  it("BUILD-01 deploy-dev injects AGENTIC_BUILD_ID from git SHA", () => {
    const source = readFileSync(
      new URL("../scripts/deploy-dev.mjs", import.meta.url),
      "utf8"
    );
    assert.match(source, /AGENTIC_BUILD_ID=\$\{sha\}/);
    const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    assert.match(nextConfig, /AGENTIC_BUILD_ID: gitBuildId\(\)/);
    assert.equal(pipelineBuildId(), TEST_RELEASE_BUILD_ID);
  });

  it("BUILD-02 one instance returns the same buildId for 1,000 calls and after cache eviction", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const config = loadAgenticConfig();
    const ids = [];
    for (let index = 0; index < 1_000; index += 1) {
      const info = await infoTool({ config, locale: "en" });
      ids.push(info.buildId);
    }
    resetInfoCache();
    ids.push((await infoTool({ config, locale: "en" })).buildId);
    assert.equal(new Set(ids).size, 1);
    assert.match(ids[0] ?? "", BUILD_ID_PATTERN);
  });

  it("BUILD-03 replica equality uses the same process manifest", () => {
    resetReleaseManifestForTests();
    const first = releaseManifest();
    const second = releaseManifest();
    assert.equal(first.buildId, second.buildId);
    assert.equal(first, second);
  });

  it("BUILD-04 restart from the same artifact rebuilds the same buildId", () => {
    resetReleaseManifestForTests();
    const first = releaseManifest().buildId;
    resetReleaseManifestForTests();
    const second = releaseManifest().buildId;
    assert.equal(first, second);
  });

  it("BUILD-05 a different artifact identifier changes buildId", () => {
    const previous = buildReleaseManifest({
      buildId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const next = buildReleaseManifest({
      buildId: "cccccccccccccccccccccccccccccccccccccccc"
    });
    assert.notEqual(previous.buildId, next.buildId);
    assert.match(previous.buildId, BUILD_ID_PATTERN);
    assert.match(next.buildId, BUILD_ID_PATTERN);
  });

  it("BUILD-06 malformed build metadata never becomes an accepted identity", () => {
    assert.throws(
      () =>
        validateReleaseManifest(
          buildReleaseManifest({ buildId: "not-a-sha" }),
          { skipRecompute: true }
        ),
      /40-character lowercase git SHA|build_id_malformed/
    );
  });
});
