import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { cleanup, create, install, plan, rpc, runtime } from "../mcp-evidence-images/helpers.ts";
import { planCompletionResponse } from "../../lib/agentic/mcp/plan-stream.ts";
import { signalPlanOperationChange } from "../../lib/agentic/plan/completion-signals.ts";
import { runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { isAgenticErrorResult } from "../../lib/agentic/contract/errors.ts";
import { AGENTIC_OUTPUT_SCHEMAS } from "../../lib/agentic/contract/outputs.ts";
import { validateToolIssues } from "../../lib/agentic/contract/validate.ts";
import type { AgenticRuntime } from "../../lib/agentic/runtime.ts";
import type { JsonRpcResponse } from "../../lib/agentic/mcp/rpc.ts";

beforeEach(install); afterEach(cleanup);
const request = (accept = "text/event-stream") => new Request("https://dev.example/api/mcp", { method: "POST", headers: { accept } });
async function operation(app: AgenticRuntime, key: string) {
  const op = await app.store.getPlanOperationByKey(`${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? "anon"}`, key);
  assert.ok(op); return op;
}
async function finish(app: AgenticRuntime, key: string) {
  const op = await operation(app, key);
  const result = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id });
  assert.equal(result.ok, true, JSON.stringify(result));
  const committed = await operation(app, key); assert.equal(committed.status, "complete");
  // Memory store has no PostgreSQL transport. The integration cases exercise
  // the real writer + shared LISTEN delivery across independent connections.
  signalPlanOperationChange({ operationId: op.id, version: committed.version });
  return committed;
}
async function message(response: Response) {
  const events = (await response.text()).split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  assert.equal(events.length, 1); return events[0] as JsonRpcResponse;
}
for (const locale of ["en", "th", "zh-CN"]) {
  test(`STREAM-PLAN-${locale} admitted create returns the exact committed decision in its original call`, async () => {
    const app = runtime(), args = { ...create(), locale };
    const initial = await rpc(app, "plan", args); assert.ok(initial);
    assert.equal(initial.result?.structuredContent?.status, "processing");
    const op = await operation(app, args.idempotencyKey); assert.equal(op.status, "queued");
    const stream = await planCompletionResponse({ request: request(), initial, runtime: app }); assert.ok(stream);
    await setImmediate(); assert.equal((await operation(app, args.idempotencyKey)).status, "queued", "HTTP observes; only the durable executor starts matching");
    await finish(app, args.idempotencyKey);
    const delivered = await message(stream), ordinary = await rpc(app, "plan", { planHandle: initial.result!.structuredContent!.planHandle });
    assert.deepEqual(delivered, ordinary); assert.equal(delivered.id, initial.id);
    assert.notEqual(delivered.result?.structuredContent?.status, "processing");
    assert.ok(Buffer.byteLength(JSON.stringify(delivered)) < 22_000);
  });
}
test("STREAM-PLAN-refine observes revision two and same-key retries never add matching work", async () => {
  const app = runtime(), first = await plan(app, create());
  const args = { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: "stream-refine-0001", scoring: { weights: { pills: 2 } } };
  const initial = await rpc(app, "plan", args); assert.ok(initial);
  assert.equal(initial.result?.structuredContent?.revision, 2, JSON.stringify(initial));
  const stream = await planCompletionResponse({ request: request(), initial, runtime: app }); assert.ok(stream);
  const concurrent = await rpc(app, "plan", { ...args, idempotencyKey: "stream-conflict-0001", scoring: { weights: { pills: 1 } } });
  assert.equal(concurrent?.result?.structuredContent?.ok, false);
  assert.equal((concurrent?.result?.structuredContent?.error as { currentRevision?: number })?.currentRevision, 2);
  const replay = await rpc(app, "plan", args); assert.deepEqual(replay, initial);
  const before = await finish(app, args.idempotencyKey);
  const delivered = await message(stream); assert.equal(delivered.result?.structuredContent?.revision, 2);
  await rpc(app, "plan", args);
  assert.deepEqual(await operation(app, args.idempotencyKey), before, "Replay after completion preserves the operation and search attempts");
});
test("STREAM-PLAN-disconnect preserves admitted work and a handle-only stream recovers it", async () => {
  const app = runtime(), args = create(), initial = await rpc(app, "plan", args); assert.ok(initial);
  const stream = await planCompletionResponse({ request: request(), initial, runtime: app }); assert.ok(stream);
  const reader = stream.body!.getReader(); await reader.read(); await reader.cancel();
  assert.equal((await operation(app, args.idempotencyKey)).status, "queued");
  const poll = await rpc(app, "plan", { planHandle: initial.result!.structuredContent!.planHandle }); assert.ok(poll);
  const recovered = await planCompletionResponse({ request: request(), initial: poll, runtime: app }); assert.ok(recovered);
  await finish(app, args.idempotencyKey);
  assert.notEqual((await message(recovered)).result?.structuredContent?.status, "processing");
});
test("STREAM-PLAN-json does not subscribe or add status reads", async () => {
  const app = runtime(), initial = await rpc(app, "plan", create()); assert.ok(initial);
  app.store.getPlanReadState = async () => { assert.fail("JSON admission must remain immediate"); };
  assert.equal(await planCompletionResponse({ request: request("application/json"), initial, runtime: app }), null);
});
test("STREAM-PLAN-ownership revalidates read access without disclosing another owner's result", async () => {
  const app = runtime(), initial = await rpc(app, "plan", create()); assert.ok(initial);
  const other = { ...app, scope: { ...app.scope, tenantScope: "other-customer" } };
  const stream = await planCompletionResponse({ request: request(), initial, runtime: other }); assert.ok(stream);
  const denied = await message(stream); assert.equal(denied.result?.structuredContent?.ok, false);
  assert.equal(denied.result?.structuredContent?.choices, undefined);
});


for (const resultContent of ['structured', 'text'] as const) test(`STREAM-PLAN-validation-${resultContent} delivers one precise typed terminal error with its attempted revision`, async () => {
  const app = runtime(), first = await plan(app, create());
  app.resultContent = resultContent;
  const args = { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: `stream-invalid-duration-${resultContent}`,
    intake: [{ ...create().intake[0], daysRemaining: 30 }] };
  const initial = await rpc(app, 'plan', args); assert.ok(initial);
  const op = await operation(app, args.idempotencyKey); assert.equal(op.status, 'queued'); assert.equal(op.revision, 2);
  const abort = new AbortController();
  const stream = await planCompletionResponse({ request: new Request('https://dev.example/api/mcp',
    { method: 'POST', headers: { accept: 'text/event-stream' }, signal: abort.signal }), initial, runtime: app });
  assert.ok(stream);
  try {
    const rejected = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id });
    assert.ok(isAgenticErrorResult(rejected)); assert.equal(rejected.error.category, 'INVALID_ARGUMENT');
    const failed = await operation(app, args.idempotencyKey); assert.equal(failed.status, 'failed');
    signalPlanOperationChange({ operationId: op.id, version: failed.version });
    const delivered = await message(stream);
    const read = await rpc(app, 'plan', { planHandle: first.planHandle }), replay = await rpc(app, 'plan', args);
    assert.deepEqual(delivered, read); assert.deepEqual(delivered, replay);
    assert.equal(delivered.result?.isError, true); assert.equal(delivered.id, initial.id);
    const result = resultContent === 'structured' ? delivered.result?.structuredContent
      : JSON.parse(String((delivered.result?.content as Array<{ text: string }>)[0].text));
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, result), []);
    assert.ok(isAgenticErrorResult(result)); assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
    assert.equal(result.error.category, 'INVALID_ARGUMENT'); assert.equal(result.error.reasonCode, 'invalid_request');
    assert.equal(result.error.retryable, false); assert.equal(result.error.fieldPath, 'intake[0].daysRemaining');
    assert.equal(result.error.currentRevision, 2); assert.equal(result.error.requestedRevision, 2);
    assert.deepEqual(result.error.issues, [{ fieldPath: 'intake[0].daysRemaining', reasonCode: 'out_of_range',
      messageKey: 'mcp.errors.out_of_range', permittedLimit: 'omit for diet', actual: 30 }]);
    assert.deepEqual(await operation(app, args.idempotencyKey), failed, 'Stream and read observers never retry a validation failure');
    assert.equal((await app.store.getPlan(op.planId))?.currentRevision, 1);
  } finally { abort.abort(); }
});
