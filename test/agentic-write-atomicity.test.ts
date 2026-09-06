import assert from "node:assert/strict";
import { it } from "node:test";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { applyVerifiedPaymentEvent, expireCheckoutIfDue } from "../lib/agentic/commerce/state.ts";
import { applyFulfilmentEvent, processOmsOutbox } from "../lib/agentic/retail/mock-thailand.ts";
import type { OrderRecord } from "../lib/agentic/store/types.ts";
import type { VerifiedPaymentEvent } from "../lib/agentic/commerce/payment.ts";
const now=new Date().toISOString();
const order: OrderRecord={id:'review-order',planId:'review-plan',planRevision:1,reference:'REVIEW',environment:'dev',tenantScope:'mattanutra',principalScope:null,destinationCountry:'TH',currency:'THB',totalPriceMinor:10000,orderStatus:'open',paymentStatus:'unpaid',fulfilmentStatus:'not_started',stateVersion:1,providerSessionId:'review-session',checkoutUrl:null,checkoutExpiresAt:null,checkoutAccessHash:null,frozenPlan:{},latestPaymentAttempt:null,latestPaymentReason:null,createdAt:now,updatedAt:now,completedAt:null,cancelledAt:null,expiredAt:null};
const event: VerifiedPaymentEvent={amountMinor:10000,currency:'THB',providerEventId:'review-event',providerSessionId:'review-session',reason:null,status:'succeeded'};

for (const method of ["insertPaymentAttempt", "updateOrder", "insertPaymentAudit", "insertOutbox"] as const) {
  it(`rolls back payment failure at ${method} and allows retry`, async () => {
    const store = createMemoryStore();
    await store.insertOrder(order);
    const original = store[method];
    store[method] = async () => { throw new Error("injected_failure"); };
    await assert.rejects(applyVerifiedPaymentEvent({event, now, store}), /injected_failure/);
    Object.assign(store, {[method]: original});
    assert.equal((await store.getOrder(order.id))?.paymentStatus, "unpaid");
    assert.equal((await store.listPaymentAttempts(order.id)).length, 0);
    assert.equal((await store.listPaymentAudits(order.id)).length, 0);
    assert.equal((await store.getOutboxPending()).length, 0);
    const retry = await applyVerifiedPaymentEvent({event, now, store});
    assert.equal(retry?.applied, true);
    assert.equal(retry?.order.paymentStatus, "paid");
    assert.equal((await store.listPaymentAttempts(order.id)).length, 1);
    assert.equal((await store.getOutboxPending()).length, 1);
  });
}

it("applies concurrent payment confirmations only once", async () => {
  const store = createMemoryStore(); await store.insertOrder(order);
  const results = await Promise.all(Array.from({length: 20}, () => applyVerifiedPaymentEvent({event, now, store})));
  assert.equal(results.filter(result => result?.applied).length, 1);
  assert.equal((await store.listPaymentAudits(order.id)).length, 1);
  assert.equal((await store.getOutboxPending()).length, 1);
});

it("does not regress terminal fulfilment during overlapping callbacks", async () => {
  const store = createMemoryStore();
  await store.insertOrder({...order, paymentStatus: "paid", orderStatus: "completed", fulfilmentStatus: "packed", stateVersion: 3});
  await Promise.all(["delivered", "shipped"].map(status => applyFulfilmentEvent({orderId: order.id, status: status as "delivered" | "shipped", now, store})));
  assert.equal((await store.getOrder(order.id))?.fulfilmentStatus, "delivered");
  assert.deepEqual((await store.listFulfilmentEvents(order.id)).map(event => event.status), ["delivered"]);
});

it("does not expire an order paid after the caller read it", async () => {
  const store = createMemoryStore();
  const expired = {...order, checkoutExpiresAt: "2000-01-01T00:00:00Z"};
  await store.insertOrder(expired);
  await applyVerifiedPaymentEvent({event, now, store});
  assert.equal((await expireCheckoutIfDue({order: expired, now, store}))?.paymentStatus, "paid");
});

it("rolls back an outbox failure and safely handles overlapping consumers", async () => {
  const store = createMemoryStore(); await store.insertOrder(order);
  await applyVerifiedPaymentEvent({event, now, store});
  const original = store.markOutboxProcessed;
  store.markOutboxProcessed = async () => { throw new Error("injected_failure"); };
  await assert.rejects(processOmsOutbox({now, store}), /injected_failure/);
  assert.equal(await store.getRetailLink(order.id), null);
  assert.equal((await store.listFulfilmentEvents(order.id)).length, 0);
  store.markOutboxProcessed = original;
  await Promise.all(Array.from({length: 10}, () => processOmsOutbox({now, store})));
  assert.equal((await store.getOutboxPending()).length, 0);
  assert.equal((await store.listFulfilmentEvents(order.id)).length, 1);
});
