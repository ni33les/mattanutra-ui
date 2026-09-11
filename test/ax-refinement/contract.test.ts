import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
const ajv = new Ajv({ multipleOfPrecision: 8, allErrors: true, strict: false, validateFormats: false });
import { AGENTIC_CONTRACT_VERSION, GUIDANCE_RULES_VERSION } from "../../lib/agentic/config.ts";
import { AGENTIC_PUBLIC_TOOLS, AGENTIC_OUTPUT_SCHEMAS, AGENTIC_TOOL_SCHEMAS } from "../../lib/agentic/contract/index.ts";
import { CLIENT_GUIDE_URI, CONTRACT_SCHEMA_URI, readContractResource, CLIENT_EXAMPLES } from "../../lib/agentic/contract/guide.ts";
import { runtime, rpc } from "./helpers.ts";

test("AXR-SPEC-01 current contract publishes six tools and current schemas; clinical references stay unchanged", () => {
  assert.equal(AGENTIC_CONTRACT_VERSION, "11.0.0"); assert.equal(GUIDANCE_RULES_VERSION, "6.0.0");
  assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], ["info", "plan", "execute", "order", "support", "feedback"]);
  for (const version of ["4.0.0", "5.0.0", "6.0.0", "7.0.0", "8.0.0"]) assert.equal(readContractResource(`mattanutra://contract/${version}/schema`), null);
  assert.ok(CLIENT_GUIDE_URI.includes("11.0.0")); assert.ok(CONTRACT_SCHEMA_URI.includes("11.0.0"));
});

for (const locale of ["en", "th", "zh-CN"]) test(`AXR-SPEC-02 ${locale} tools-only info and native resources provide the same executable conversational contract`, async () => {
  const client = runtime(`contract-${locale}`);
  const info = await rpc(client, "info", { locale });
  assert.equal(info.ok, true); assert.ok(ajv.validate(AGENTIC_OUTPUT_SCHEMAS.info, info), JSON.stringify(ajv.errors));
  const text = JSON.stringify(info);
  for (const required of ["selectedOptionId", "supplemental", "idempotencyKey"]) assert.ok(text.includes(required), `Ordinary info is missing ${required}`);
  const help = await rpc(client, "info", { locale, view: "client_guide" });
  assert.equal(help.ok, true);
  for (const required of ["no_purchase", "expectedRevision", "searchEffort", "pillCountAtLeast"]) assert.ok(String(help.clientGuideText).includes(required), `Tools-only guide is missing ${required}`);
  const guide = readContractResource(CLIENT_GUIDE_URI); assert.ok(guide);
  assert.ok(guide.contents[0]!.text.includes("selectedOptionId"));
  for (const example of CLIENT_EXAMPLES) assert.ok(ajv.validate(AGENTIC_TOOL_SCHEMAS[example.tool], example.arguments), example.name);
  const schema = await rpc(client, "info", { locale, view: "plan_schema" });
  assert.equal(schema.ok, true); assert.equal(JSON.parse(String(schema.planSchemaJson)).anyOf.length, 5);
});
