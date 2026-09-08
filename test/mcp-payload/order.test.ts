import assert from "node:assert/strict";
import { test } from "node:test";
import { runtime, rpc } from "../ax-refinement/helpers.ts";
import { issueCapability } from "../../lib/agentic/capabilities.ts";
import { baseline, bytes } from "./fixtures.ts";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
import type { OrderRecord } from "../../lib/agentic/store/types.ts";

test("PAY-POLL-02 order status avoids frozen projection and histories while details preserve frozen prices and events", async () => {
  const app = runtime("payload-order"), plan = baseline.cases[0].plan;
  const frozenPlan = { items: plan.basket!, channel: "agentic", currency: "THB", subtotalMinor: plan.stackSummary!.totalPriceMinor, shippingMinor: plan.shippingMinor, totalPriceMinor: plan.estimatedOrderTotalMinor };
  const order: OrderRecord = { id: "payload-order-01", planId: "payload-order-plan", planRevision: 1, environment: "dev", tenantScope: "mattanutra", principalScope: app.scope.principalScope,
    createdAt: app.now!, updatedAt: app.now!, cancelledAt: null, completedAt: null, expiredAt: null,
    checkoutAccessHash: null, checkoutExpiresAt: "2099-01-01T00:00:00Z", checkoutUrl: "https://example.test/checkout", currency: "THB", destinationCountry: "TH", frozenPlan,
    fulfilmentStatus: "not_started", latestPaymentAttempt: null, latestPaymentReason: null, orderStatus: "open", paymentStatus: "unpaid", providerSessionId: "fixture-session", reference: "MN-PAYLOAD-01", stateVersion: 1, totalPriceMinor: plan.estimatedOrderTotalMinor! };
  await app.store.insertOrder(order);
  const { handle } = await issueCapability({ allowedActions: ["order.read"], config: app.config, now: app.now!, resourceId: order.id, resourceType: "order", scope: app.scope, store: app.store });
  const full = await rpc(app, "order", { orderHandle: handle }); assert.equal(full.ok, true);
  let itemReads = 0;
  const readItems = app.store.getOrderItems;
  app.store.getOrderItems = async id => { itemReads++; return readItems(id); };
  const concise = await rpc(app, "order", { orderHandle: handle, responseView: "conversation" });
  assert.equal(concise.ok, true); assert.equal(concise.responseView, "conversation"); assert.ok(!("frozenOrder" in concise));
  assert.equal(concise.totalPriceMinor, order.totalPriceMinor);
  const first = await rpc(app, "order", { orderHandle: handle, responseView: "status" });
  const same = await rpc(app, "order", { orderHandle: handle, responseView: "status", knownResultVersion: first.resultVersion });
  assert.equal(same.unchanged, true); assert.equal(itemReads, 0);
  assert.ok(bytes(toolResult(same)) <= 4096); assert.ok(bytes(toolResult(same)) < bytes(toolResult(full)) * .1);
  const detail = await rpc(app, "order", { orderHandle: handle, responseView: "details", sections: ["frozen_order", "events"] });
  assert.equal(detail.ok, true); assert.deepEqual(detail.frozenOrder, full.frozenOrder); assert.deepEqual(detail.events, full.events);
  await app.store.insertFulfilmentEvent({ id: "event-1", orderId: order.id, createdAt: app.now!, status: "shipped", reasonCode: null, payload: { trackingNumber: "TRACK-1", trackingUrl: "https://example.test/track/1" } });
  const changed = await rpc(app, "order", { orderHandle: handle, responseView: "status", knownResultVersion: first.resultVersion });
  assert.equal(changed.unchanged, false, "New fulfilment data changes the version even when stateVersion has not changed");
  assert.deepEqual((await app.store.getOrder(order.id))?.frozenPlan, frozenPlan);
  const stranger = runtime("payload-order-other", app.store);
  assert.equal((await rpc(stranger, "order", { orderHandle: handle, responseView: "status", knownResultVersion: first.resultVersion })).ok, false);
});
