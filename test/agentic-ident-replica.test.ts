import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { infoTool, resetInfoCache } from "../lib/agentic/info.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { mcpOneShotHeaders } from "../lib/agentic/mcp/transport.ts";
import {
  fingerprintReleaseIdentity,
  releaseManifest,
  resetReleaseManifestForTests
} from "../lib/agentic/release-manifest.ts";

function identityOf(info: {
  buildId?: string;
  contractVersion: string;
  schemaChecksum?: string;
}) {
  return `${info.buildId}:${info.schemaChecksum}:${info.contractVersion}`;
}

describe("REPLICA and cache identity", () => {
  it("REPLICA-01 in-process matrix returns one identity", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const config = loadAgenticConfig();
    const first = await infoTool({ config, locale: "en" });
    const second = await infoTool({ config, locale: "en" });
    assert.equal(identityOf(first), identityOf(second));
    assert.equal(fingerprintReleaseIdentity(releaseManifest()), fingerprintReleaseIdentity(releaseManifest()));
  });

  it("REPLICA-02 100 uncached public info calls return one canonical identity", async () => {
    resetReleaseManifestForTests();
    const config = loadAgenticConfig();
    const ids = new Set<string>();
    for (let index = 0; index < 100; index += 1) {
      resetInfoCache();
      const info = await infoTool({ config, locale: "en" });
      ids.add(identityOf(info));
    }
    assert.equal(ids.size, 1);
  });

  it("REPLICA-03 twenty independent sessions return the same identity fields", async () => {
    resetReleaseManifestForTests();
    const ids = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const runtime = createAgenticRuntime({
        config: loadAgenticConfig(),
        store: createMemoryStore()
      });
      const response = await handleJsonRpc(runtime, {
        id: 1,
        method: "tools/call",
        params: { arguments: { locale: "en" }, name: "info" }
      });
      const info = response?.result?.structuredContent as {
        buildId?: string;
        contractVersion: string;
        schemaChecksum?: string;
      };
      ids.add(identityOf(info));
    }
    assert.equal(ids.size, 1);
  });

  it("REPLICA-04 locale/session matrix keeps identity invariant", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const config = loadAgenticConfig();
    const ids = new Set<string>();
    for (const locale of ["en", "th", "zh-CN"]) {
      for (let index = 0; index < 20; index += 1) {
        const info = await infoTool({ config, locale });
        ids.add(identityOf(info));
      }
    }
    assert.equal(ids.size, 1);
  });

  it("REPLICA-05 cache eviction does not drop identity fields", async () => {
    resetReleaseManifestForTests();
    const config = loadAgenticConfig();
    const before = await infoTool({ config, locale: "en" });
    resetInfoCache();
    const after = await infoTool({ config, locale: "en" });
    assert.equal(identityOf(before), identityOf(after));
    assert.ok(after.buildId);
    assert.ok(after.schemaChecksum);
  });

  it("REPLICA-07 identity responses are not cacheable across releases", () => {
    const headers = mcpOneShotHeaders("application/json");
    assert.match(headers["Cache-Control"], /no-store/);
    const route = readRoute();
    assert.match(route, /x-agentic-build-id/);
    assert.match(route, /x-agentic-schema-checksum/);
  });
});

function readRoute() {
  return readFileSync(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
}
