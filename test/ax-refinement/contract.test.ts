import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv from "ajv";
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
import { AGENTIC_CONTRACT_VERSION, GUIDANCE_RULES_VERSION } from "../../lib/agentic/config.ts";
import { AGENTIC_PUBLIC_TOOLS, AGENTIC_OUTPUT_SCHEMAS, AGENTIC_TOOL_SCHEMAS } from "../../lib/agentic/contract/index.ts";
import { CLIENT_GUIDE_URI, CONTRACT_SCHEMA_URI, readContractResource, CLIENT_EXAMPLES } from "../../lib/agentic/contract/guide.ts";
import { runtime, rpc } from "./helpers.ts";

test("AXR-SPEC-01 contract 7.1 preserves six public tools, legacy request acceptance and historical v4–v7 resources", () => {
  assert.equal(AGENTIC_CONTRACT_VERSION, "7.1.0");
  assert.equal(GUIDANCE_RULES_VERSION, "6.0.0", "Clinical reference rules were not changed by this package");
  const old = JSON.parse(readFileSync(new URL("../../contract/mcp/6.0.0/tools.json", import.meta.url), "utf8"));
  assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], ["info", "plan", "execute", "order", "support", "feedback"]);
  assert.equal(AGENTIC_PUBLIC_TOOLS.length, 6);
  const v7 = JSON.parse(readFileSync(new URL("../../contract/mcp/7.0.0/tools.json", import.meta.url), "utf8"));
  // Historical exact-input assertion remains attached to the historical release.
  for (const tool of AGENTIC_PUBLIC_TOOLS) assert.deepEqual(v7.tools.find((row: { name: string }) => row.name === tool).inputSchema, old.tools.find((row: { name: string }) => row.name === tool).inputSchema);
  for (const example of CLIENT_EXAMPLES) { const legacy = { ...example.arguments }; delete legacy.responseView; assert.ok(ajv.validate(AGENTIC_TOOL_SCHEMAS[example.tool], legacy), example.name); }
  assert.ok(Object.hasOwn(AGENTIC_TOOL_SCHEMAS, "evidence"), "legacy evidence schema remains available internally");
  for (const version of ["4.0.0", "5.0.0", "6.0.0", "7.0.0"]) for (const suffix of ["client-guide", "schema"]) {
    const resource = readContractResource(`mattanutra://contract/${version}/${suffix}`);
    assert.ok(resource, `${version}/${suffix} remains accessible`);
    assert.ok(resource.contents[0]!.text.includes(version));
  }
  assert.ok(CLIENT_GUIDE_URI.includes("7.1.0")); assert.ok(CONTRACT_SCHEMA_URI.includes("7.1.0"));
});

for (const locale of ["en", "th", "zh-CN"]) test(`AXR-SPEC-02 ${locale} tools-only info and native resources provide the same executable conversational contract`, async () => {
  const client = runtime(`contract-${locale}`);
  const info = await rpc(client, "info", { locale });
  assert.equal(info.ok, true); assert.ok(ajv.validate(AGENTIC_OUTPUT_SCHEMAS.info, info), JSON.stringify(ajv.errors));
  const text = JSON.stringify(info);
  for (const required of ["highlightedAlternativeOptionId", "no_purchase", "supplemental", "expectedRevision", "searchEffort", "idempotencyKey", "actualLowerBound"]) assert.ok(text.includes(required), `Ordinary info is missing ${required}`);
  const guide = readContractResource(CLIENT_GUIDE_URI); assert.ok(guide);
  assert.ok(guide.contents[0]!.text.includes("highlightedAlternativeOptionId"));
  for (const example of CLIENT_EXAMPLES) assert.ok(ajv.validate(AGENTIC_TOOL_SCHEMAS[example.tool], example.arguments), example.name);
  for (const operation of ["create", "get", "revise", "answer", "select"]) {
    const schema = await rpc(client, "info", { locale, view: "plan_schema", planOperation: operation });
    assert.equal(schema.ok, true); assert.ok(JSON.stringify(schema).includes(operation));
  }
});
