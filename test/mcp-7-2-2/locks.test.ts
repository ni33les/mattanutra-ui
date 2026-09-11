import assert from "node:assert/strict";
import { test } from "node:test";
import { runtime } from "../ax-refinement/helpers.ts";
import { handleLightweightJsonRpc, toolList } from "../../lib/agentic/mcp/rpc.ts";
async function info(args: Record<string, unknown>) {
  const result = await handleLightweightJsonRpc(runtime("locks").config, { id: 1, method: "tools/call", params: { name: "info", arguments: args } });
  const value = result!.result!.structuredContent as Record<string, unknown>; assert.equal(value.ok, true); return value;
}
test("L1_overview_is_honest_and_advertises_six_tools", async () => {
  assert.deepEqual(toolList().map(row => row.name).sort(), ["execute", "feedback", "info", "order", "plan", "support"]);
  for (const locale of ["en", "th", "zh-CN"]) {
    const value = await info({ locale }); const text = String(value.clientInstructions);
    assert.match(text, /TH.*only/); assert.match(text, /finite catalogue/); assert.match(text, /real gaps/);
    assert.match(text, /not targets met or medical approval/); assert.doesNotMatch(text, /call evidence|evidence tool/);
  }
});
test("L2_info_schema_creates_one_conversational_plan_without_modes", async () => {
  const value = await info({ view: "plan_schema" });
  const schema = JSON.parse(String(value.planSchemaJson));
  assert.equal(schema.properties.responseView, undefined);
  assert.ok(schema.properties.targets); assert.ok(schema.properties.scoring);
  const { validateToolIssues } = await import("../../lib/agentic/contract/validate.ts");
  assert.deepEqual(validateToolIssues(schema, { locale: "en", destinationCountry: "TH", idempotencyKey: "locked-current-create", targets: [{name:"Vitamin D3", amount:2000, unit:"IU"}] }), []);
});
test("L3_info_and_tool_card_share_the_handle_only_poll_contract", async () => {
  const value = await info({ view: "plan_schema" });
  const schema = JSON.parse(String(value.planSchemaJson));
  assert.deepEqual(schema, JSON.parse(JSON.stringify(toolList().find(row => row.name === "plan")!.inputSchema)));
  const { validateToolIssues } = await import("../../lib/agentic/contract/validate.ts");
  assert.deepEqual(validateToolIssues(schema, { planHandle: "cap_returned_plan_handle_123456789" }), []);
  assert.ok(validateToolIssues(schema, { planHandle: "cap_returned_plan_handle_123456789", responseView: "status" }).length);
});
