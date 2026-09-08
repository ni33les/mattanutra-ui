import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
register("./config-loader.mjs", import.meta.url);
const { default: nextConfig } = await import("../../next.config.ts");
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";

test("production build regenerates a stale publication while server startup does not write it", () => {
  const file = "public/.well-known/mcp.json", original = readFileSync(file, "utf8");
  try {
    writeFileSync(file, '{"tools":"stale"}');
    assert.equal(typeof nextConfig, "function", "The production build must publish the shared contract");
    const configure = nextConfig as unknown as (phase: string) => unknown;
    configure("phase-production-server"); assert.equal(readFileSync(file, "utf8"), '{"tools":"stale"}');
    configure("phase-production-build");
    const published = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(published.tools, toolList()); assert.equal(published.contractVersion, AGENTIC_CONTRACT_VERSION);
    assert.deepEqual(JSON.parse(readFileSync(`contract/mcp/${AGENTIC_CONTRACT_VERSION}/tools.json`, "utf8")).tools, published.tools);
  } finally { writeFileSync(file, original); }
});
