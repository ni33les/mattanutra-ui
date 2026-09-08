import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
import { toolList, handleLightweightJsonRpc } from "../../lib/agentic/mcp/rpc.ts";
import { agenticServerInstructions } from "../../lib/agentic/contract/instructions.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { CLIENT_EXAMPLES, CLIENT_GUIDE_URI, readContractResource } from "../../lib/agentic/contract/guide.ts";

const names = ["info", "plan", "execute", "order", "support", "feedback", "evidence"];
const isolatedInfo = { conditionCodes: ["high_cholesterol"], medicationCodes: ["apixaban"], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] };
test("AG72-DOC-01 current guide has one plan default, a dated compatibility window and a valid evidence template", () => {
  const text = readContractResource(CLIENT_GUIDE_URI)!.contents[0].text;
  assert.match(text, /All five plan operations default to responseView=conversation/);
  assert.ok(!text.includes("Omitting responseView retains the compatible full response"));
  assert.match(text, /X-MattaNutra-Contract-Version: 7.1.0/); assert.match(text, /ends in 7.3/);
  const evidence = CLIENT_EXAMPLES.find(example => example.tool === "evidence"); assert.ok(evidence);
  const tool = toolList().find(item => item.name === "evidence")!;
  assert.equal(new Ajv({ strict: false, validateFormats: false }).validate(tool.inputSchema, evidence.arguments), true);
  for (const version of ["7.0.0", "7.1.0"]) {
    const historical = readContractResource(`mattanutra://contract/${version}/schema`); assert.ok(historical);
    assert.equal(JSON.parse(historical.contents[0].text).contractVersion, version);
  }
});
async function info(environment: "dev" | "uat" | "prd", args: Record<string, unknown>) {
  const reply = await handleLightweightJsonRpc({ ...loadAgenticConfig(), environment }, { id: 1, method: "tools/call", params: { name: "info", arguments: args } }, isolatedInfo);
  const value = reply?.result?.structuredContent as Record<string, unknown>;
  assert.equal(value?.ok, true);
  return value;
}

test("AG72-CARD-01 seven short descriptors and an honest overview support resource-free clients in every environment", async () => {
  for (const environment of ["dev", "uat", "prd"] as const) {
    for (const locale of ["en", "th", "zh-CN"]) {
      const tools = toolList(environment, locale);
      assert.deepEqual(tools.map(tool => tool.name), names);
      for (const tool of tools) assert.ok(tool.description.length < 1000, `${tool.name} needs a concise descriptor`);
      const overview = await info(environment, { locale });
      const text = String(overview.clientInstructions);
      assert.match(text, /finite/i); assert.match(text, /TH/);
      assert.match(text, /checkout.ready/i); assert.match(text, /targets met|coverage.*complete/i);
      assert.match(text, /medical approval/i); assert.match(text, /accepted inputs/i);
      assert.match(text, /do not guarantee.*interaction/i);
      assert.match(text, /host.*lists/i); assert.match(text, /templates/i);
      assert.match(text, /last response/i); assert.match(text, /evidence/);
      assert.ok(text.length < 2200, "Overview must remain one screen");
      assert.ok(!/six short|never prefix|8000|64000/i.test(text));
      assert.equal(overview.contractVersion, "7.2.2");
      assert.deepEqual(overview.medicationCodes, ["apixaban"]);
      const examples = overview.clientExamples as { arguments: Record<string, unknown> }[];
      assert.equal(examples.length, 1); assert.equal(examples[0].arguments.responseView, "conversation");
      assert.ok(!Object.hasOwn(overview, "products") && !Object.hasOwn(overview, "catalogueSize"));
      const card = agenticServerInstructions(environment);
      assert.match(card, /Thailand/); assert.match(card, /THB/);
      assert.match(card, /conversation.*default/i); assert.match(card, /same key/i);
      assert.ok(card.length < 1700, "Server card must not repeat the full guide");
    }
  }
});

test("AG72-SCHEMA-01 live tool and info get schemas agree on conversation, polling, details and invalid field combinations", async () => {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const handle = "cap_" + "x".repeat(40);
  for (const environment of ["dev", "uat", "prd"] as const) {
    const tool = toolList(environment).find(tool => tool.name === "plan"); assert.ok(tool);
    const help = await info(environment, { locale: "en", view: "plan_schema", planOperation: "get" });
    const listing = ajv.compile(tool.inputSchema), operation = ajv.compile(JSON.parse(String(help.planSchemaJson)));
    const valid = [
      { operation: "get", planHandle: handle },
      { operation: "get", planHandle: handle, responseView: "conversation" },
      { operation: "get", planHandle: handle, responseView: "full" },
      { operation: "get", planHandle: handle, responseView: "status", knownResultVersion: "v".repeat(64) },
      { operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["score", "advice"], optionIds: ["opt_12345678"] },
    ];
    const invalid = [
      { operation: "get", planHandle: handle, responseView: "details", sections: ["score"] },
      { operation: "get", planHandle: handle, responseView: "status", sections: ["advice"] },
      { operation: "get", planHandle: handle, responseView: "conversation", knownResultVersion: "v".repeat(64) },
      { operation: "get", planHandle: handle, responseView: "details", expectedRevision: 1, sections: ["private"] },
    ];
    for (const input of valid) { assert.equal(listing(input), true, JSON.stringify(listing.errors)); assert.equal(operation(input), true, JSON.stringify(operation.errors)); }
    for (const input of invalid) { assert.equal(listing(input), false); assert.equal(operation(input), false); }
  }
});
