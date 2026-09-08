import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { PLAN_OPERATION_SCHEMAS } from "../../lib/agentic/contract/schemas.ts";

const plan = toolList().find(row => row.name === "plan")!;
type Schema = { anyOf?: Schema[]; properties?: Record<string, Schema>; const?: string; enum?: string[]; default?: string };
const branches = (schema: Schema): Schema[] => schema.anyOf ? schema.anyOf.flatMap(branches) : [schema];
const operation = (name: string) => branches(plan.inputSchema as Schema).filter(row => row.properties?.operation.const === name);
const installed = process.env.MCP_HOSTED_DECLARATIONS ? JSON.parse(readFileSync(process.env.MCP_HOSTED_DECLARATIONS, "utf8")) as { source: string; tools: { name: string; description: string }[] } : null;
const declaration = () => {
  assert.equal(installed?.source, "installed_connector_declarations");
  const row = installed.tools.find(row => row.name.endsWith("_plan")); assert.ok(row); return row.description;
};
test("hosted_get_schema_includes_response_view", () => {
  if (installed) {
    const text = declaration(); assert.match(text, /responseView\??: "conversation"/); assert.doesNotMatch(text, /responseView\??: unknown/);
  } else {
    const rows = operation("get"); assert.equal(rows.length, 3);
    assert.deepEqual(rows, branches(JSON.parse(JSON.stringify(PLAN_OPERATION_SCHEMAS.get))));
    assert.deepEqual(rows.flatMap(row => row.properties!.responseView.enum ?? [row.properties!.responseView.const]), ["conversation", "full", "status", "details"]);
  }
});
test("hosted_create_defaults_to_conversation", () => {
  if (installed) {
    assert.doesNotMatch(declaration(), /omission remains full|responseView\??: unknown/);
  } else {
    const rows = operation("create"); assert.equal(rows.length, 1);
    assert.equal(rows[0].properties!.responseView.default, "conversation");
    assert.deepEqual(rows[0], JSON.parse(JSON.stringify(PLAN_OPERATION_SCHEMAS.create)));
  }
});
test("hosted_plan_blurb_mentions_thailand_gaps_and_conversation", () => {
  const description = installed ? declaration() : plan.description;
  assert.match(description, /Thailand/); assert.match(description, /finite/i); assert.match(description, /gaps/i);
  assert.match(description, /checkout.ready/i); assert.match(description, /conversation/);
  assert.doesNotMatch(description, /omission remains full/);
});
