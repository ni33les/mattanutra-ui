import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it, mock } from "node:test";
import Stripe from "stripe";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, setMetaConsent } from "../lib/meta-tracking.ts";
import { metaDiagnostics } from "../lib/meta-diagnostics.ts";
import { createPostgresStore } from "../lib/agentic/store/postgres.ts";
import type { OrderRecord } from "../lib/agentic/store/types.ts";
import { fulfillCheckoutSession, type PaymentRow } from "../lib/stripe-payments.ts";
import { recordRetailProviderSession, type RetailSessionPayment } from "../lib/retail-checkout-provider-session.ts";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";

assert.ok(process.env.TEST_DB_URL, "This integration test requires isolated PostgreSQL");

describe("internal live payments stay out of Meta purchases", () => {
  const contexts: string[] = [], payments: string[] = [], retail: string[] = [], agentic: string[] = [];
  const planId = randomUUID();
  const sessions = new Map<string, Stripe.Checkout.Session>();
  let baseline: { confirmed: number; recorded: number; missing: number };
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "prd", STRIPE_PAYMENT_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_fixture", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fixture",
      STRIPE_PRICE_PRECISION_THB: "price_precision_fixture", STRIPE_PRICE_PRO_THB: "price_pro_fixture",
      STRIPE_WEBHOOK_SECRET_FAT: "whsec_fixture", STRIPE_WEBHOOK_SECRET_THIN: "whsec_fixture",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_PRD: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_PRD: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
    await getSql()!`insert into public.assessments (plan_id,locale,answers,answer_summary,health_score)
      values (${planId}::uuid,'en','{}','{}','{}')`;
    await createPostgresStore(getSql()!).insertPlan({ id: planId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      currentRevision: 1, environment: "prd", principalScope: null, tenantScope: "internal-purchase-fixture" });
    baseline = (await metaDiagnostics(null)).purchases;
    // Every provider read is local; the payment confirmation path itself remains real.
    const stripe = new Stripe("sk_live_fixture");
    mock.method(Object.getPrototypeOf(stripe.checkout.sessions), "retrieve", async (id: string) => {
      assert.ok(sessions.has(id), "Unexpected Stripe request");
      return sessions.get(id)!;
    });
  });
  after(async () => {
    mock.restoreAll();
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const jobs = await tx`select id from public.tasks where payload->>'paymentId'=any(${payments})`;
      const taskIds = [...events.map(row => row.task_id).filter(Boolean), ...jobs.map(row => row.id)];
      await cleanupFixtureRelationships(tx, { taskIds, planIds: [planId] });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.task_comments where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.payment_versions where payment_id=any(${payments}::uuid[])`;
      await tx`delete from public.payments where id=any(${payments}::uuid[])`;
      await tx`delete from public.retail_checkout_payments where id=any(${retail}::uuid[])`;
      await tx`delete from public.agentic_orders where id=any(${agentic}::uuid[])`;
      await tx`delete from public.agentic_plans where id=${planId}::uuid`;
      await tx`delete from public.assessments where plan_id=${planId}::uuid`;
    });
    await closeSqlPool();
  });

  async function bind(type: "payment" | "retail" | "agentic", id: string) {
    const contextId = await setMetaConsent(new Request("https://mattanutra.com/en"), true, "/en");
    contexts.push(contextId);
    const request = new Request("https://mattanutra.com/en", { headers: {
      cookie: `mn_marketing=granted; mn_marketing_context=${contextId}`
    } });
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, type, id, request));
    return contextId;
  }
  async function countPurchases(contextId: string) {
    const [count] = await getSql()!`select count(*)::int as n from public.meta_conversion_events
      where context_id=${contextId}::uuid and event_name='Purchase'`;
    return count.n;
  }
  async function webPayment(metadata: Record<string, unknown> = {}) {
    const id = randomUUID(), sessionId = `cs_fixture_${id}`; payments.push(id);
    const [payment] = await getSql()!<PaymentRow[]>`insert into public.payments
      (id,selected_plan,status,amount,currency,stripe_mode,stripe_checkout_session_id,metadata)
      values (${id}::uuid,'precision','processing',690000000,'THB','live',${sessionId},${getSql()!.json(metadata)}) returning *`;
    return { payment, contextId: await bind("payment", id), sessionId };
  }
  function session(id: string, paymentId: string, amount: number, metadata: Record<string, string> = {}) {
    return { id, payment_status: "paid", status: "complete", amount_total: amount, currency: "thb", livemode: true,
      metadata: { paymentId, ...metadata }, customer: null, payment_intent: null } as Stripe.Checkout.Session;
  }

  it("persists Stripe's live web test marker before capture and preserves it across replay", async () => {
    const p = await webPayment();
    sessions.set(p.sessionId, session(p.sessionId, p.payment.id, 69000, { internal_test: "true" }));
    const confirmed = await fulfillCheckoutSession(p.sessionId, { source: "webhook" });
    assert.equal(confirmed.payment.status, "paid");
    assert.equal(confirmed.payment.metadata.internal_test, true);
    assert.equal(await countPurchases(p.contextId), 0);
    sessions.set(p.sessionId, session(p.sessionId, p.payment.id, 69000, { internal_test: "false" }));
    const replay = await fulfillCheckoutSession(p.sessionId, { source: "return_page" });
    assert.equal(replay.payment.metadata.internal_test, true);
    assert.equal(await countPurchases(p.contextId), 0);
    const [jobs] = await getSql()!`select count(*)::int as n from public.tasks
      where payload->>'paymentId'=${p.payment.id} and task_type='fulfill_web_payment'`;
    assert.equal(jobs.n, 1, "Internal tests still receive normal payment fulfillment");
  });

  it("honours saved web markers and expanded PaymentIntent markers", async () => {
    for (const saved of [true, false]) {
      const p = await webPayment(saved ? { internal_test: true } : {});
      const providerSession = session(p.sessionId, p.payment.id, 69000);
      if (!saved) providerSession.payment_intent = { id: `pi_fixture_${p.payment.id}`, metadata: { internal_test: "true" } } as unknown as Stripe.PaymentIntent;
      sessions.set(p.sessionId, providerSession);
      const confirmed = await fulfillCheckoutSession(p.sessionId, { source: "webhook" });
      assert.equal(confirmed.payment.metadata.internal_test, true);
      assert.equal(await countPurchases(p.contextId), 0);
    }
  });

  it("records one normal live web purchase after confirmation and replay", async () => {
    const p = await webPayment();
    sessions.set(p.sessionId, session(p.sessionId, p.payment.id, 69000, { internal_test: "false" }));
    await fulfillCheckoutSession(p.sessionId, { source: "webhook" });
    await fulfillCheckoutSession(p.sessionId, { source: "return_page" });
    assert.equal(await countPurchases(p.contextId), 1);
  });

  it("persists retail test markers and still records ordinary live product purchases", async () => {
    for (const markerSource of ["session", "payment_intent", "saved", "none"]) {
      const marked = markerSource !== "none";
      const id = randomUUID(); retail.push(id);
      const [payment] = await getSql()!<RetailSessionPayment[]>`insert into public.retail_checkout_payments
        (id,plan_id,amount,currency,stripe_mode,idempotency_key,metadata)
        values (${id}::uuid,${planId}::uuid,250000000,'THB','live',${randomUUID()},
          ${getSql()!.json(markerSource === "saved" ? { internal_test: true } : {})}) returning *`;
      const contextId = await bind("retail", id);
      const providerSession = session(`cs_fixture_${id}`, id, 25000, { internal_test: markerSource === "session" ? "true" : "false" });
      if (markerSource === "payment_intent") providerSession.payment_intent = {
        id: `pi_fixture_${id}`, metadata: { internal_test: "true" }
      } as unknown as Stripe.PaymentIntent;
      const confirmed = await recordRetailProviderSession(getSql()!, payment, providerSession);
      assert.equal(confirmed.status, "paid");
      assert.equal((confirmed.metadata as Record<string, unknown>).internal_test, marked ? true : undefined);
      providerSession.metadata = { paymentId: id, internal_test: "false" };
      const replay = await recordRetailProviderSession(getSql()!, confirmed, providerSession);
      assert.equal((replay.metadata as Record<string, unknown>).internal_test, marked ? true : undefined);
      assert.equal(await countPurchases(contextId), marked ? 0 : 1);
      if (markerSource === "payment_intent") {
        const [row] = await getSql()!`select stripe_payment_intent_id from public.retail_checkout_payments where id=${id}::uuid`;
        assert.equal(row.stripe_payment_intent_id, `pi_fixture_${id}`);
      }
    }
  });

  it("keeps the internal marker when a retail payment is projected onto its MCP order", async () => {
    const orderId = randomUUID(), paymentId = randomUUID(); agentic.push(orderId); retail.push(paymentId);
    const now = new Date().toISOString(), store = createPostgresStore(getSql()!);
    const order: OrderRecord = { id: orderId, reference: `fixture-${orderId}`, planId, planRevision: 1, environment: "prd",
      tenantScope: "internal-purchase-fixture", principalScope: null, destinationCountry: "TH", currency: "THB", totalPriceMinor: 25000,
      orderStatus: "open", paymentStatus: "unpaid", fulfilmentStatus: "not_started", stateVersion: 1,
      providerSessionId: `cs_fixture_${paymentId}`, checkoutUrl: null, checkoutExpiresAt: null, checkoutAccessHash: null,
      frozenPlan: {}, latestPaymentAttempt: null, latestPaymentReason: null, createdAt: now, updatedAt: now,
      completedAt: null, cancelledAt: null, expiredAt: null };
    await store.insertOrder(order);
    const [payment] = await getSql()!<RetailSessionPayment[]>`insert into public.retail_checkout_payments
      (id,plan_id,amount,currency,stripe_mode,idempotency_key,metadata)
      values (${paymentId}::uuid,${planId}::uuid,250000000,'THB','live',${randomUUID()},
        ${getSql()!.json({ agenticOrderId: orderId })}) returning *`;
    const contextId = await bind("retail", paymentId);
    await withDatabaseTransaction(getSql()!, tx => bindMetaContext(tx, "agentic", orderId,
      new Request("https://mattanutra.com/en", { headers: { cookie: `mn_marketing=granted; mn_marketing_context=${contextId}` } })));
    await recordRetailProviderSession(getSql()!, payment, session(order.providerSessionId!, paymentId, 25000, { internal_test: "true" }));
    await store.updateOrder({ ...order, paymentStatus: "paid", orderStatus: "completed", updatedAt: new Date().toISOString() });
    assert.equal(await countPurchases(contextId), 0);

    const standaloneId = randomUUID(); agentic.push(standaloneId);
    const standalone = { ...order, id: standaloneId, planRevision: 2, reference: `fixture-${standaloneId}`, providerSessionId: `cs_test_fixture_${standaloneId}` };
    await store.insertOrder(standalone);
    const standaloneContextId = await bind("agentic", standaloneId);
    await store.updateOrder({ ...standalone, paymentStatus: "paid", orderStatus: "completed", updatedAt: new Date().toISOString() });
    assert.equal(await countPurchases(standaloneContextId), 0, "Runtime configuration cannot turn standalone test evidence into a live purchase");
  });

  it("does not report intentionally excluded internal or test-mode purchases as missing", async () => {
    for (const mode of ["test", "mock"]) {
      const p = await webPayment();
      await getSql()!`update public.payments set stripe_mode=${mode},status='paid',paid_at=now() where id=${p.payment.id}::uuid`;
    }
    const purchases = (await metaDiagnostics(null)).purchases;
    assert.deepEqual(purchases, { confirmed: baseline.confirmed + 2, recorded: baseline.recorded + 2, missing: baseline.missing });
  });
});
