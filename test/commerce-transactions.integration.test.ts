import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql } from "../lib/db.ts";
import { createPostgresStore } from "../lib/agentic/store/postgres.ts";
import type { AgenticStore, OrderRecord } from "../lib/agentic/store/types.ts";
import { applyVerifiedPaymentEvent } from "../lib/agentic/commerce/state.ts";
import { applyFulfilmentEvent, processOmsOutbox } from "../lib/agentic/retail/mock-thailand.ts";
import { issueCapability } from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { supportTool } from "../lib/agentic/support.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("commerce transactions on PostgreSQL", {skip: !databaseUrl}, () => {
  const now = new Date().toISOString();
  const principalScope = `qa-v3:lock-review:${randomUUID()}`;
  const scope = {environment: "dev" as const, tenantScope: "mattanutra", principalScope};
  let store: AgenticStore;
  before(() => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    store = createPostgresStore(getSql()!);
  });
  after(async () => {
    try { await store.deletePrincipalScope(principalScope); }
    finally { await closeSqlPool(); }
  });
  async function seed() {
    const planId = randomUUID(), id = randomUUID();
    await store.insertPlan({...scope, id: planId, currentRevision: 1, createdAt: now, updatedAt: now});
    const order: OrderRecord = {
      ...scope, id, planId, planRevision: 1, reference: id, destinationCountry: "TH", currency: "THB", totalPriceMinor: 10000,
      orderStatus: "open", paymentStatus: "unpaid", fulfilmentStatus: "not_started", stateVersion: 1,
      providerSessionId: `review-${id}`, checkoutUrl: null, checkoutExpiresAt: null, checkoutAccessHash: null,
      frozenPlan: {}, latestPaymentAttempt: null, latestPaymentReason: null,
      createdAt: now, updatedAt: now, completedAt: null, cancelledAt: null, expiredAt: null
    };
    await store.insertOrder(order);
    return {order, event: {amountMinor: 10000, currency: "THB", providerEventId: `review-event-${id}`, providerSessionId: order.providerSessionId!, reason: null, status: "succeeded" as const}};
  }

  it("rolls back deduplication and state if outbox insertion fails, then accepts concurrent retries once", async () => {
    const {order, event} = await seed();
    let fail = true;
    const failing = (base: AgenticStore): AgenticStore => ({
      ...base,
      transaction: work => base.transaction(tx => work(failing(tx))),
      async insertOutbox(record) {
        if (fail) throw new Error("injected_outbox_failure");
        return base.insertOutbox(record);
      }
    });
    await assert.rejects(applyVerifiedPaymentEvent({store: failing(store), event, now}), /injected_outbox_failure/);
    assert.equal((await store.getOrder(order.id))?.paymentStatus, "unpaid");
    assert.equal((await store.listPaymentAttempts(order.id)).length, 0);
    assert.equal((await store.listPaymentAudits(order.id)).length, 0);
    fail = false;
    const outcomes = await Promise.all(Array.from({length: 6}, () => applyVerifiedPaymentEvent({store: failing(store), event, now})));
    assert.equal(outcomes.filter(result => result?.applied).length, 1);
    assert.equal((await store.listPaymentAudits(order.id)).length, 1);
    await Promise.all(Array.from({length: 6}, () => processOmsOutbox({store, now})));
    assert.equal((await store.listFulfilmentEvents(order.id)).length, 1);
  });

  it("preserves delivered state across racing PostgreSQL fulfilment writers", async () => {
    const {order, event} = await seed();
    await applyVerifiedPaymentEvent({store, event, now});
    await Promise.all(["delivered", "shipped"].map(status => applyFulfilmentEvent({store, now, orderId: order.id, status: status as "delivered" | "shipped"})));
    assert.equal((await store.getOrder(order.id))?.fulfilmentStatus, "delivered");
  });

  it("creates one support case and sequences concurrent replies without collisions", async () => {
    const {order} = await seed();
    const config = loadAgenticConfig();
    const capability = await issueCapability({config, scope, store, now, resourceType: "order", resourceId: order.id, allowedActions: ["support.create", "order.read"]});
    const inputs = Array.from({length: 6}, (_, i) => ({config, scope, store, now, orderHandle: capability.handle, idempotencyKey: `review-support-${order.id}-${i}`, message: `Synthetic reply ${i}`}));
    const results = await Promise.all(inputs.map(input => supportTool(input)));
    assert.ok(results.every(result => result.ok));
    const supportCase = await store.getSupportCaseByOrderId(order.id);
    assert.ok(supportCase);
    const messages = await store.getSupportMessages(supportCase.id);
    assert.equal(messages.filter(message => message.author === "client").length, 6);
    assert.deepEqual(messages.map(message => message.sequence), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(await supportTool(inputs[0]), results[0]);
    const [{count}] = await getSql()!`select count(*)::int as count from public.agentic_support_cases where order_id = ${order.id}`;
    assert.equal(count, 1);
  });
});
