import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { PLAN_OPERATION_SCHEMAS } from "../../lib/agentic/contract/schemas.ts";
import { GUIDE_ESSENTIALS } from "../../lib/agentic/contract/guide.ts";

type Schema = { anyOf?: Schema[]; properties?: Record<string, Schema>; required?: string[]; const?: string; enum?: string[]; default?: string };
const listing = process.env.MCP_TOOL_LIST_JSON ? JSON.parse(readFileSync(process.env.MCP_TOOL_LIST_JSON, "utf8")).result.tools : toolList();
const plan = listing.find((row: {name: string}) => row.name === "plan");
assert.ok(plan?.inputSchema, "Read the actual tools/list JSON, not descriptor-only metadata");
const leaves = (schema: Schema): Schema[] => schema.anyOf ? schema.anyOf.flatMap(leaves) : [schema];
const operation = (name: string) => leaves(plan.inputSchema).filter(row => row.properties?.operation.const === name);

test("hosted_get_schema_includes_response_view", () => {
  const visible = (plan.inputSchema as Schema).anyOf!.find(row => row.properties?.operation.const === "get");
  assert.ok(visible, "The get operation must be visible without traversing a second union");
  assert.deepEqual(visible.properties!.responseView.enum, ["conversation", "full", "status", "details"]);
  assert.ok(visible.properties!.knownResultVersion && visible.properties!.expectedRevision && visible.properties!.sections);
  const rows = operation("get"); assert.ok(rows.length);
  assert.deepEqual(rows, leaves(JSON.parse(JSON.stringify(PLAN_OPERATION_SCHEMAS.get))));
  assert.deepEqual(rows.flatMap(row => row.properties!.responseView.enum ?? [row.properties!.responseView.const]), ["conversation", "full", "status", "details"]);
  const status = rows.find(row => row.properties!.responseView.const === "status")!;
  assert.ok(status.properties!.knownResultVersion);
  const details = rows.find(row => row.properties!.responseView.const === "details")!;
  assert.ok(details.required!.includes("expectedRevision") && details.required!.includes("sections"));
});
test("hosted_create_defaults_to_conversation", () => {
  const [create] = operation("create"); assert.ok(create);
  assert.equal(create.properties!.responseView.default, "conversation");
  // Every operation is the exact JSON served by info, including nested get/revise variants.
  assert.deepEqual(plan.inputSchema, { type: "object", anyOf: JSON.parse(JSON.stringify(Object.values(PLAN_OPERATION_SCHEMAS))) });
});
test("hosted_plan_blurb_mentions_thailand_gaps_and_conversation", () => {
  assert.match(plan.description, /TH|Thailand/); assert.match(plan.description, /finite catalogue/);
  assert.match(plan.description, /conversation/); assert.match(plan.description, /gaps/);
  assert.equal(plan.description, GUIDE_ESSENTIALS, "Publish the same eight-line overview on the plan tool card");
  assert.equal(plan.description.split("\n").length, 8);
});
