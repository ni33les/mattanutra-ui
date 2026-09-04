import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { AGENTIC_TOOL_SCHEMAS } from "../lib/agentic/contract/index.ts";
import { infoTool, resetInfoCache } from "../lib/agentic/info.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { qaPreflight } from "../lib/agentic/qa/preflight.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import {
  computeSchemaChecksum,
  permuteJsonKeyOrder,
  releaseManifest,
  resetReleaseManifestForTests,
  servedSchemaBundle
} from "../lib/agentic/release-manifest.ts";

describe("SCHEMA checksum contract", () => {
  it("SCHEMA-01 canonical input hashes the served schema bundle", () => {
    const checksum = computeSchemaChecksum();
    assert.match(checksum, /^[0-9a-f]{64}$/);
    assert.equal(checksum, computeSchemaChecksum(servedSchemaBundle()));
  });

  it("SCHEMA-02 permuting JSON object key order leaves schemaChecksum unchanged", () => {
    const bundle = servedSchemaBundle();
    const left = computeSchemaChecksum(bundle);
    const right = computeSchemaChecksum(permuteJsonKeyOrder(bundle, 3));
    assert.equal(left, right);
  });

  it("SCHEMA-03 a material schema field change changes schemaChecksum", () => {
    const mutated = {
      ...servedSchemaBundle(),
      tools: {
        ...AGENTIC_TOOL_SCHEMAS,
        info: {
          ...AGENTIC_TOOL_SCHEMAS.info,
          additionalProperties: true
        }
      }
    };
    assert.notEqual(computeSchemaChecksum(mutated), computeSchemaChecksum());
  });

  it("SCHEMA-04 localized presentation copy is excluded from the schema checksum", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const config = loadAgenticConfig();
    const en = await infoTool({ config, locale: "en" });
    const th = await infoTool({ config, locale: "th" });
    assert.notEqual(en.description, th.description);
    assert.equal(en.schemaChecksum, th.schemaChecksum);
  });

  it("SCHEMA-05 recomputes from tools/list advertised schemas", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const runtime = createAgenticRuntime({
      config: loadAgenticConfig(),
      store: createMemoryStore()
    });
    const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    const tools = (
      listed?.result as { tools?: Array<{ inputSchema: unknown; name: string }> }
    )?.tools;
    assert.ok(tools);
    const advertised = Object.fromEntries(
      tools.map((tool) => [tool.name, tool.inputSchema])
    );
    const recomputed = computeSchemaChecksum({
      contractVersion: "3.0.0",
      tools: advertised
    });
    const info = await infoTool({ config: runtime.config, locale: "en" });
    assert.equal(recomputed, info.schemaChecksum);
  });

  it("SCHEMA-06 public info equals QA preflight schemaChecksum", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    const preflight = await qaPreflight();
    assert.equal(info.schemaChecksum, preflight.manifest.schemaChecksum);
  });

  it("SCHEMA-07 release manifest is the only schema identity source", () => {
    resetReleaseManifestForTests();
    const manifest = releaseManifest();
    assert.equal(manifest.schemaChecksum, computeSchemaChecksum());
  });
});
