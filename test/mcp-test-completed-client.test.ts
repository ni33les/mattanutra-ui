import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createAgenticRuntime } from '../lib/agentic/runtime.ts';
import { handleJsonRpc } from '../lib/agentic/mcp/dispatcher.ts';
import { handleCompletedJsonRpc } from './helpers/completed-mcp-client.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
const request = { destinationCountry: 'TH', locale: 'en', scoring: { profile: 'lowest_cost' }, profile: { ageYears: 40, lifeStage: 'adult' }, targets: [{name: 'Vitamin D3', amount: 2000, unit: 'IU'}] };
const body = (key: string) => ({id: 1, method: 'tools/call', params: {name: 'plan', arguments: {...request, idempotencyKey: key}}});
const content = (response: Awaited<ReturnType<typeof handleJsonRpc>>) => response?.result?.structuredContent as Record<string, unknown>;
test('MCP-CLIENT-01 completed flat client runs admitted work separately and records the complete result', async () => {
  const runtime=createAgenticRuntime();const result=content(await handleCompletedJsonRpc(runtime,body('completed-client-01')));
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.status,'ready');assert.ok(Array.isArray(result.choices)&&result.choices.length>0);assert.ok(!('responseView' in result));
  const operation=await runtime.store.getPlanOperationByKey('dev:mattanutra:anon','completed-client-01');assert.ok(operation);assert.equal(operation.status,'complete');assert.ok(operation.checkpoint);
  assert.deepEqual(content(await handleCompletedJsonRpc(runtime,body('completed-client-01'))),result);assert.equal((await runtime.store.getPlanOperation(operation.id))?.version,operation.version);
});
test('MCP-CLIENT-02 ordinary dispatch admits without executing or asserting selection', async () => {
  const runtime=createAgenticRuntime();const result=content(await handleJsonRpc(runtime,body('completed-client-02')));assert.equal(result.status,'processing');assert.equal(result.nextAction,'poll_plan');
  const operation=await runtime.store.getPlanOperationByKey('dev:mattanutra:anon','completed-client-02');assert.ok(operation);assert.equal(operation.status,'queued');assert.equal(operation.checkpoint,null);
});
test('MCP-CLIENT-03 completed client never executes a handle-only read', async () => {
  const runtime=createAgenticRuntime();const admitted=content(await handleJsonRpc(runtime,body('completed-client-03')));
  const poll=content(await handleCompletedJsonRpc(runtime,{id:2,method:'tools/call',params:{name:'plan',arguments:{planHandle:admitted.planHandle}}}));assert.equal(poll.status,'processing');
  assert.equal((await runtime.store.getPlanOperationByKey('dev:mattanutra:anon','completed-client-03'))?.status,'queued');
});
test('MCP-CLIENT-04 validation errors admit no matching work', async () => {
  const runtime=createAgenticRuntime();const payload=body('completed-client-04');const result=content(await handleCompletedJsonRpc(runtime,{...payload,params:{...payload.params,arguments:{...payload.params.arguments,targets:[]}}}));
  assert.equal(result.ok,false);assert.equal(await runtime.store.getPlanOperationByKey('dev:mattanutra:anon','completed-client-04'),null);
});
test('MCP-CLIENT-05 durable catalogue identity survives without publishing a duplicate result tree', async () => {
  const runtime=createAgenticRuntime();const value=content(await handleCompletedJsonRpc(runtime,body('completed-client-05')));assert.equal(value.ok,true,JSON.stringify(value));
  const operation=await runtime.store.getPlanOperationByKey('dev:mattanutra:anon','completed-client-05');assert.ok(operation);const saved=await runtime.store.getPlanRevision(operation.planId,1);assert.ok(saved);
  const snapshotId=(saved.result as {matcherTelemetry:{snapshotId:string}}).matcherTelemetry.snapshotId;assert.ok(snapshotId);assert.ok(saved.catalogueVersion);
  assert.ok(!('canonical' in JSON.parse(JSON.stringify(value))));assert.ok(Array.isArray(value.choices));
});
test('MCP-CLIENT-06 the maintained client has no retired full-view request adapter', () => {
  const source=readFileSync(new URL('./helpers/completed-mcp-client.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/fullPlanRequest|handleCompletedFullJsonRpc/);
});
