import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { issueCapability } from "../../lib/agentic/capabilities.ts";
import { readPlanStatus } from "../../lib/agentic/presentation/plan-read.ts";
import { internalFixture } from "../mcp-conversation-pack/helpers.ts";
import { runtime } from "../ax-refinement/helpers.ts";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is mandatory");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/); assert.notEqual(url.port, "5432");
const queries: string[] = [];
const sql = postgres(url.href, { max: 3, prepare: false, connection: { lock_timeout: "250ms", statement_timeout: "2000ms" },
  debug: (_connection, query) => { queries.push(query); } });
const store = createPostgresStore(sql);
after(() => sql.end());
async function fixture() {
  const app = runtime("eff-read-pg", store), id = randomUUID(), now = app.now!, result = internalFixture();
  await store.insertPlan({ id, currentRevision: 1, ...app.scope, createdAt: now, updatedAt: now });
  await store.insertPlanRevision({ planId: id, revision: 1, result, requestSnapshot: result.requestSnapshot,
    status: result.status, createdAt: now, availabilityAsOf: now, catalogueVersion: "fixture", guidanceRulesVersion: "unchanged" });
  const { handle } = await issueCapability({ config: app.config, store, scope: app.scope, now, resourceId: id,
    resourceType: "plan", allowedActions: ["plan.read"] });
  const orderId = randomUUID();
  await store.insertOrder({ id: orderId, planId: id, planRevision: 1, ...app.scope, createdAt: now, updatedAt: now,
    reference: `EFF-${orderId}`, currency: "THB", destinationCountry: "TH", totalPriceMinor: 100, frozenPlan: result,
    orderStatus: "open", paymentStatus: "unpaid", fulfilmentStatus: "not_started", stateVersion: 1,
    cancelledAt: null, expiredAt: null, completedAt: null, checkoutAccessHash: null, checkoutExpiresAt: null,
    checkoutUrl: null, latestPaymentAttempt: null, latestPaymentReason: null, providerSessionId: null });
  return { app, id, handle, orderId };
}

test("EFF-READ-PG-01 ordinary status reads complete behind held updates while mutation locks remain effective", async () => {
  const { app, id, handle, orderId } = await fixture();
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>(resolve => { ready = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const writer = sql.begin(async tx => {
    await tx`update public.agentic_orders set state_version=state_version+1 where id=${orderId}::uuid`;
    await tx`update public.catalogue_runtime_revision set revision=revision+1 where singleton`;
    ready(); await released;
    throw new Error("rollback isolated lock probe");
  }).catch(error => { assert.match(error.message, /rollback isolated lock probe/); });
  await held;
  try {
    const status = await readPlanStatus(app, handle);
    assert.ok(status.ok && "responseView" in status && status.responseView === "status");
    await assert.rejects(store.transaction(tx => tx.getActiveOrderForPlanRevision(id, 1)), (error: { code?: string }) => error.code === "55P03");
    await assert.rejects(store.transaction(tx => tx.isCatalogueRevisionCurrent!(1)), (error: { code?: string }) => error.code === "55P03");
  } finally { release(); await writer; }
});

test("EFF-READ-PG-02 warm status uses two SELECTs and the read state contains no large result or command", async () => {
  const { app, id, handle } = await fixture();
  const first = await readPlanStatus(app, handle); assert.ok(first.ok && "resultVersion" in first);
  queries.length = 0;
  const result = await readPlanStatus(app, handle, first.resultVersion);
  assert.ok(result.ok && "unchanged" in result && result.unchanged);
  assert.equal(queries.length, 2); assert.ok(queries.every(query => /^\s*select/i.test(query)));
  const state = await store.getPlanReadState(id); assert.ok(state?.projection);
  assert.equal(state.result, null); assert.equal(state.operation, null);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 2500);
});

test("EFF-ORDER-PG-01 expired order status stays read-only behind a held checkout write", async () => {
  const { app, orderId } = await fixture();
  const order = await store.getOrder(orderId); assert.ok(order);
  await store.updateOrder({ ...order, checkoutExpiresAt: new Date(Date.parse(app.now!) - 1000).toISOString() });
  const { handle } = await issueCapability({ config: app.config, store, scope: app.scope, now: app.now!, resourceId: orderId,
    resourceType: "order", allowedActions: ["order.read"] });
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>(resolve => { ready = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
  const writer = sql.begin(async tx => {
    await tx`update public.agentic_orders set state_version=state_version+1 where id=${orderId}::uuid`; ready(); await released;
  });
  await held;
  try {
    const { orderTool } = await import("../../lib/agentic/commerce/order.ts");
    const result = await orderTool({ ...app, now: app.now!, orderHandle: handle, responseView: "status" });
    assert.ok(result.ok); assert.equal(result.orderStatus, "expired");
    assert.equal((await store.getOrder(orderId))!.orderStatus, "open");
  } finally { release(); await writer; }
});

test("EFF-ORDER-PG-02 warm order polls read small facts in two SELECTs and retain frozen full data", async () => {
  const { app, orderId } = await fixture();
  const { handle } = await issueCapability({ config: app.config, store, scope: app.scope, now: app.now!, resourceId: orderId,
    resourceType: "order", allowedActions: ["order.read"] });
  const { orderTool } = await import("../../lib/agentic/commerce/order.ts");
  queries.length = 0;
  const first = await orderTool({ ...app, now: app.now!, orderHandle: handle, responseView: "status" }); assert.ok(first.ok);
  assert.equal(queries.length, 2); assert.ok(queries.every(query => /^\s*select/i.test(query)));
  const state = await store.getOrderReadState(orderId); assert.ok(state);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 2500);
  assert.deepEqual((await store.getOrder(orderId))!.frozenPlan, internalFixture());
  const second = await orderTool({ ...app, now: app.now!, orderHandle: handle, responseView: "status", knownResultVersion: first.resultVersion });
  assert.ok(second.ok && "unchanged" in second && second.unchanged);
});

test("EFF-READ-PG-03 payment transitions invalidate the small plan version without loading frozen contents", async () => {
  const { app, handle, id, orderId } = await fixture();
  const first = await readPlanStatus(app, handle); assert.ok(first.ok && "resultVersion" in first);
  const order = await store.getOrder(orderId); assert.ok(order);
  await store.updateOrder({ ...order, paymentStatus: "paid", stateVersion: 2 });
  const second = await readPlanStatus(app, handle, first.resultVersion);
  assert.ok(second.ok && "unchanged" in second && !second.unchanged);
  const state = await store.getPlanReadState(id); assert.equal(state?.payment?.paymentStatus, "paid");
  assert.equal(state?.result, null); assert.ok(Buffer.byteLength(JSON.stringify(state)) < 2500);
});
