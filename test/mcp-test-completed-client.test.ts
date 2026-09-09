import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";

beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
const request = { destinationCountry: "TH", locale: "en", optimization: "lowest_cost", profile: { ageYears: 40, lifeStage: "adult" }, requirements: {}, targets: [{name: "Vitamin D3", amount: 2000, unit: "IU"}] };
const body = (key: string) => ({id: 1, method: "tools/call", params: {name: "plan", arguments: {operation: "create", idempotencyKey: key, request}}});
const content = (response: Awaited<ReturnType<typeof handleJsonRpc>>) => response?.result?.structuredContent as Record<string, unknown>;

test("MCP-CLIENT-01 completed full client runs admitted work separately and records the complete result", async () => {
  const { handleCompletedFullJsonRpc, fullPlanRequest } = await import("./helpers/completed-mcp-client.ts");
  const runtime=createAgenticRuntime();
  const result=content(await handleCompletedFullJsonRpc(runtime,body("completed-client-01")));
  assert.equal(result.ok,true,JSON.stringify(result)); assert.equal(result.status,"ready");
  assert.equal(fullPlanRequest(body("completed-client-01")).params.arguments.responseView,"full"); assert.ok(Array.isArray(result.coverage) && result.coverage.length===1);
  const operation=await runtime.store.getPlanOperationByKey("dev:mattanutra:anon","completed-client-01");
  assert.ok(operation); assert.equal(operation.status,"complete"); assert.ok(operation.checkpoint);
  const replay=content(await handleCompletedFullJsonRpc(runtime,body("completed-client-01")));
  assert.deepEqual(replay,result); assert.equal((await runtime.store.getPlanOperation(operation.id))?.version,operation.version);
});
test("MCP-CLIENT-02 ordinary dispatch still admits without executing and defaults to conversation", async () => {
  const { handleCompletedFullJsonRpc } = await import("./helpers/completed-mcp-client.ts");
  assert.equal(typeof handleCompletedFullJsonRpc,"function");
  const runtime=createAgenticRuntime(); const result=content(await handleJsonRpc(runtime,body("completed-client-02")));
  assert.equal(result.status,"processing"); assert.equal(result.responseView,"conversation");
  const operation=await runtime.store.getPlanOperationByKey("dev:mattanutra:anon","completed-client-02");
  assert.ok(operation); assert.equal(operation.status,"queued"); assert.equal(operation.checkpoint,null);
});
test("MCP-CLIENT-03 completed client preserves explicit views and never executes on GET", async () => {
  const { handleCompletedFullJsonRpc } = await import("./helpers/completed-mcp-client.ts");
  const runtime=createAgenticRuntime(); const admitted=content(await handleJsonRpc(runtime,body("completed-client-03")));
  const poll=content(await handleCompletedFullJsonRpc(runtime,{id:2,method:"tools/call",params:{name:"plan",arguments:{operation:"get",planHandle:admitted.planHandle,responseView:"status"}}}));
  assert.equal(poll.status,"processing"); assert.equal(poll.responseView,"status");
  assert.equal((await runtime.store.getPlanOperationByKey("dev:mattanutra:anon","completed-client-03"))?.status,"queued");
});
test("MCP-CLIENT-04 validation errors remain errors and admit no matching work", async () => {
  const { handleCompletedFullJsonRpc } = await import("./helpers/completed-mcp-client.ts");
  const runtime=createAgenticRuntime(); const payload=body("completed-client-04");
  const result=content(await handleCompletedFullJsonRpc(runtime,{...payload,params:{...payload.params,arguments:{...payload.params.arguments,request:{...request,targets:[]}}}}));
  assert.equal(result.ok,false); assert.equal(await runtime.store.getPlanOperationByKey("dev:mattanutra:anon","completed-client-04"),null);
});
test("MCP-CLIENT-05 published catalogue identity survives a durable receipt and JSON transport", async () => {
  const { handleCompletedFullJsonRpc } = await import("./helpers/completed-mcp-client.ts");
  const runtime = createAgenticRuntime();
  const value = content(await handleCompletedFullJsonRpc(runtime, body("completed-client-05")));
  assert.equal(value.ok, true, JSON.stringify(value));
  const operation = await runtime.store.getPlanOperationByKey("dev:mattanutra:anon", "completed-client-05");
  assert.ok(operation);
  const saved = await runtime.store.getPlanRevision(operation.planId, 1);
  assert.ok(saved);
  const snapshotId = (saved.result as { matcherTelemetry: { snapshotId: string } }).matcherTelemetry.snapshotId;
  assert.ok(snapshotId);
  const transported = JSON.parse(JSON.stringify(value));
  assert.equal(transported.canonical.catalogId, snapshotId);
  assert.equal(transported.canonical.snapshotId, undefined, "The internal compatibility alias is not wire data");
});
