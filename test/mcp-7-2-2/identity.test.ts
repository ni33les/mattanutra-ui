import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { handleLightweightJsonRpc, toolList } from "../../lib/agentic/mcp/rpc.ts";
import { runtime } from "../ax-refinement/helpers.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";
import { computeSchemaChecksum } from "../../lib/agentic/release-manifest.ts";

test("test_tools_list_schema_checksum_matches_info", async () => {
  const app = runtime("identity");
  const listing = await handleLightweightJsonRpc(app.config, { id: 1, method: "tools/list" });
  const info = await handleLightweightJsonRpc(app.config, { id: 2, method: "tools/call", params: { name: "info", arguments: {} } });
  const value = info!.result!.structuredContent as Record<string, unknown>;
  assert.equal(listing!.result!.schemaChecksum, value.schemaChecksum);
  assert.equal(listing!.result!.contractVersion, value.contractVersion);
  const published = JSON.parse(readFileSync(`contract/mcp/${AGENTIC_CONTRACT_VERSION}/tools.json`, "utf8"));
  assert.equal(published.schemaChecksum, computeSchemaChecksum());
  assert.deepEqual(published.tools.map(({ name, inputSchema, description }: Record<string, unknown>) => ({ name, inputSchema, description })),
    toolList().map(({ name, inputSchema, description }) => ({ name, inputSchema, description })));
});
test("test_client_guide_uri_matches_contractVersion", async () => {
  const app = runtime("guide-identity");
  const info = await handleLightweightJsonRpc(app.config, { id: 2, method: "tools/call", params: { name: "info", arguments: {} } });
  const value = info!.result!.structuredContent as Record<string, unknown>;
  assert.ok(String(value.clientGuide).includes(`/${value.contractVersion}/`));
  const read = await handleLightweightJsonRpc(app.config, { id: 3, method: "resources/read", params: { uri: value.clientGuide } });
  assert.ok(read!.result, JSON.stringify(read));
});
