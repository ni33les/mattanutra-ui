import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateInstalledConnectorProjection } from "../scripts/validate-installed-connector-projection.mjs";

describe("actual installed connector projection evidence", () => {
  const published = { contractVersion: "7.0.0", schemaChecksum: "sha", tools: ["info", "plan", "execute", "order", "support", "feedback"].map(name => ({ name, description: `${name} current`, inputSchema: { type: "object", properties: { operation: { enum: ["create", "get", "revise", "answer", "select"] } } } })) };
  const evidence = { ...published, source: "installed_connector", connectorId: "dev-client", environment: "dev", observedAt: "2026-09-07T00:00:00Z" };
  it("ANNA-AX-06 preserves local schema checks while refusing to mistake native discovery for an installed projection", () => {
    assert.equal(validateInstalledConnectorProjection(evidence, published).passed, true);
    assert.equal(validateInstalledConnectorProjection({ ...evidence, source: "native_endpoint" }, published).passed, false);
    assert.equal(validateInstalledConnectorProjection({ ...evidence, tools: [...evidence.tools, { name: "evidence", description: "stale", inputSchema: {} }] }, published).passed, false);
  });
  it("ANNA-AX-07 rejects stale descriptions and schemas even when the endpoint info identity is current", () => {
    const tools = structuredClone(evidence.tools);
    tools[1]!.inputSchema = { type: "object", properties: { request: {} } } as never;
    tools[1]!.description = "Omit handle to create; sex may be unspecified";
    assert.deepEqual(validateInstalledConnectorProjection({ ...evidence, tools }, published).failures, ["plan:input_schema_mismatch", "plan:description_mismatch"]);
  });
});
