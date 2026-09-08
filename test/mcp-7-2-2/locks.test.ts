import assert from "node:assert/strict";
import { test } from "node:test";
import { runtime } from "../ax-refinement/helpers.ts";
import { handleLightweightJsonRpc, toolList } from "../../lib/agentic/mcp/rpc.ts";
async function info(args: Record<string, unknown>) {
  const result = await handleLightweightJsonRpc(runtime("locks").config, { id: 1, method: "tools/call", params: { name: "info", arguments: args } });
  const value = result!.result!.structuredContent as Record<string, unknown>; assert.equal(value.ok, true); return value;
}
test("L1_overview_is_honest_and_advertises_seven_tools", async () => {
  assert.deepEqual(toolList().map(row => row.name).sort(), ["evidence", "execute", "feedback", "info", "order", "plan", "support"]);
  for (const locale of ["en", "th", "zh-CN"]) {
    const value = await info({ locale }); const text = String(value.clientInstructions);
    assert.match(text, /TH.*only/); assert.match(text, /finite catalogue/); assert.match(text, /gaps are real/);
    assert.match(text, /not targets met or medical approval/); assert.match(text, /evidence/);
  }
});
test("L2_info_create_schema_defaults_conversation", async () => {
  const value = await info({ view: "plan_schema", planOperation: "create" });
  assert.equal(JSON.parse(String(value.planSchemaJson)).properties.responseView.default, "conversation");
});
test("L3_info_get_schema_advertises_all_views", async () => {
  const value = await info({ view: "plan_schema", planOperation: "get" });
  const schema = JSON.parse(String(value.planSchemaJson));
  assert.deepEqual(schema.anyOf.flatMap((row: { properties: { responseView: { enum?: string[]; const?: string } } }) => row.properties.responseView.enum ?? [row.properties.responseView.const]), ["conversation", "full", "status", "details"]);
});
