import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { cleanup, create, install, plan, rpc, runtime } from "../mcp-evidence-images/helpers.ts";
import { planCompletionResponse } from "../../lib/agentic/mcp/plan-stream.ts";
import { signalPlanOperationChange } from "../../lib/agentic/plan/completion-signals.ts";
import { runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
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
