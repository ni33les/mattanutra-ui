import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
import { toolList, handleLightweightJsonRpc } from "../../lib/agentic/mcp/rpc.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { baseline, bytes } from "./fixtures.ts";

test("PAY-SCHEMA-01 discovery preserves six complete contracts within 65% of baseline bytes", () => {
  const original = baseline.cases.find(row => row.caseId === "A1-en")!.discovery![1].response.result.tools;
  const tools = toolList();
  assert.deepEqual(tools.map(row => row.name), ["info", "plan", "execute", "order", "support", "feedback"]);
  assert.ok(bytes(tools) <= bytes(original) * .65, `${bytes(tools)} exceeds ${Math.floor(bytes(original) * .65)}`);
  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const tool of tools) { ajv.compile(tool.inputSchema); ajv.compile(tool.outputSchema); }
});

test("PAY-SCHEMA-02 overview offers one starting example and operation help works without resources", async () => {
  const info = async (args: Record<string, unknown>) => {
    const response = await handleLightweightJsonRpc(loadAgenticConfig(), { id: 1, method: "tools/call", params: { name: "info", arguments: args } },
      { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] });
    return response!.result!.structuredContent as { clientExamples: { arguments: Record<string, unknown> }[]; clientInstructions: string; planSchemaJson?: string };
  };
  for (const locale of ["en", "th", "zh-CN"]) {
    const overview = await info({ locale });
    assert.equal(overview.clientExamples.length, 1);
    assert.equal(overview.clientExamples[0].arguments.operation, "create");
    assert.match(overview.clientInstructions, /supplemental/);
    const original = baseline.cases.find(row => row.caseId === `A1-${locale}`)!.discovery![2].response.result.structuredContent;
    assert.ok(bytes(overview) <= bytes(original) * .65);
    for (const planOperation of ["create", "get", "revise", "answer", "select"]) {
      const help = await info({ locale, view: "plan_schema", planOperation });
      assert.ok(help.planSchemaJson);
      assert.equal(help.clientExamples.length, 1);
      assert.equal(help.clientExamples[0].arguments.operation, planOperation);
      assert.ok(!help.clientInstructions.includes("Help the customer explore"), "Detail view must not repeat the entire overview");
    }
  }
});

test("PAY-SCHEMA-03 factored schemas preserve acceptance and normalized field errors", async () => {
  const { AGENTIC_INPUT_SCHEMAS, AGENTIC_OUTPUT_SCHEMAS } = await import("../../lib/agentic/contract/index.ts");
  const { factorSchema } = await import("../../lib/agentic/contract/factor-schema.ts");
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const errors = (check: ReturnType<typeof ajv.compile>) => (check.errors ?? []).map(({ instancePath, keyword, params }) => JSON.stringify({ instancePath, keyword, params })).sort();
  const examples = baseline.cases.flatMap(row => row.discovery?.[2].response.result.structuredContent.clientExamples ?? []);
  assert.ok(examples.length >= 3);
  for (const [name, schema] of Object.entries(AGENTIC_INPUT_SCHEMAS)) {
    const original = ajv.compile(schema), factored = ajv.compile(factorSchema(schema));
    const corpus = [null, {}, { unexpected: true }, ...examples.filter(row => row.tool === name).flatMap(row => [row.arguments, { ...row.arguments, unexpected: true }])];
    for (const input of corpus) { assert.equal(factored(input), original(input)); assert.deepEqual(errors(factored), errors(original)); }
  }
  const original = ajv.compile(AGENTIC_OUTPUT_SCHEMAS.plan), factored = ajv.compile(factorSchema(AGENTIC_OUTPUT_SCHEMAS.plan));
  for (const row of baseline.cases) {
    assert.equal(original(row.plan), true); assert.equal(factored(row.plan), true);
    const invalid = { ...row.plan, revision: "one" };
    assert.equal(original(invalid), false); assert.equal(factored(invalid), false); assert.deepEqual(errors(factored), errors(original));
  }
});
