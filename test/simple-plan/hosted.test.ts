import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { validateInstalledConnectorProjection } from "../../scripts/validate-installed-connector-projection.mjs";

const published = { contractVersion: "9.0.0", schemaChecksum: "fixture-checksum", tools: toolList() };
const installed = () => ({ ...structuredClone(published), source: "installed_connector", connectorId: "dev-host", environment: "dev", observedAt: "2026-09-10T10:00:00Z" });

test("M721-HOST-01 current seven-tool exports pass while missing evidence and native-only evidence fail", () => {
  assert.equal(validateInstalledConnectorProjection(installed(), published).passed, true);
  const missing = installed(); missing.tools = missing.tools.filter(row => row.name !== "evidence");
  assert.equal(validateInstalledConnectorProjection(missing, published).passed, false);
  assert.equal(validateInstalledConnectorProjection({ ...installed(), source: "native_endpoint" }, published).passed, false);
});

test("M721-HOST-02 documented host wrappers preserve complete schemas; stale get and descriptions fail", () => {
  const wrapped = installed(); wrapped.tools = wrapped.tools.map(row => ({ ...row, name: `mattanutra_dev___${row.name}` }));
  assert.equal(validateInstalledConnectorProjection(wrapped, published).passed, true);
  const stale = installed(); const plan = stale.tools.find(row => row.name === "plan")!;
  plan.inputSchema = { type: "object", properties: { operation: { const: "get" }, planHandle: { type: "string" } } } as never;
  plan.description = "Old hosted description";
  const failures = validateInstalledConnectorProjection(stale, published).failures;
  assert.ok(failures.includes("plan:input_schema_mismatch")); assert.ok(failures.includes("plan:description_mismatch"));
  assert.equal(validateInstalledConnectorProjection({ ...installed(), schemaChecksum: "stale" }, published).passed, false);
});

test("M721-HOST-03 connector artifacts advertise evidence, host names and the same honest service scope", () => {
  for (const provider of ["openai", "anthropic", "xai"]) {
    const adapter = JSON.parse(readFileSync(`lib/agentic/adapters/${provider}.json`, "utf8"));
    assert.match(adapter.instructions, /evidence/); assert.match(adapter.instructions, /host/i);
    assert.match(adapter.instructions, /checkout.ready/i); assert.match(adapter.description, /Thailand/);
    assert.doesNotMatch(adapter.description, /Never prefix|Never call mattanutra/);
    assert.deepEqual(adapter.tools, published.tools.map(row => row.name));
  }
});
