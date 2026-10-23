import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it, mock } from "node:test";
import type Stripe from "stripe";
import { cleanupFixtureRelationships, fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import * as financeFx from "../lib/finance-fx.ts";
import { recordRetailProviderSession, type RetailSessionPayment } from "../lib/retail-checkout-provider-session.ts";

// Synchronize concurrent returns after each has read the same paid snapshot.
// No real FX/provider network requests are made by this fixture.
let fxBarrier: (() => Promise<void>) | null = null;
mock.module("../lib/finance-fx.ts", { namedExports: {
  ...financeFx,
  resolveUsdRateForCurrency: async (currency: string) => {
    await fxBarrier?.();
    return { currency, fallbackUsed: false, fxRateId: null, provider: null, source: null, usdRate: 1 };
  }
} });
const { fulfillRetailCheckoutSession, getTrackingOrderByReference } = await import("../lib/retail-product-checkout.ts");

fixtureDatabaseUrl();
describe("retail fulfillment is atomic and replayable", () => {
  const planId = randomUUID(), organisationId = randomUUID();
  const paymentIds: string[] = [];
  let productId: string;
  before(async () => {
    process.env.DB_URL = process.env.TEST_DB_URL;
    const sql = getSql()!;
    await sql`insert into public.assessments (plan_id, locale, answers, answer_summary, health_score)
      values (${planId}::uuid, 'en', '{}', '{}', '{}')`;
    await sql`insert into public.organisations (id, slug, name, organisation_type, currency)
      values (${organisationId}::uuid, ${`fulfillment-${organisationId}`}, 'Fixture pharmacy', 'tenant', 'USD')`;
    const [product] = await sql`select id::text from public.products order by id limit 1`;
    assert.ok(product, "An isolated catalogue fixture is required");
    productId = product.id;
  });
  after(async () => {
    fxBarrier = null;
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role = replica`;
      const orders = await sql`select id::text from public.retail_customer_orders where organisation_id=${organisationId}::uuid`;
      const orderIds = orders.map(row => row.id);
      const sourceIds = [...paymentIds, ...orderIds];
      const tasks = await sql`select id::text from public.tasks where plan_id=${planId}::uuid
        or source_entity_id::text=any(${sourceIds}::text[]) or organisation_id=${organisationId}::uuid`;
      const taskIds = tasks.map(row => row.id);
      await cleanupFixtureRelationships(sql, { planIds: [planId], taskIds });
      await sql`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await sql`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await sql`delete from public.cron where plan_id=${planId}::uuid`;
      await sql`delete from public.bpm where properties->>'checkoutPaymentId'=any(${paymentIds}::text[])
        or properties->>'paymentId'=any(${paymentIds}::text[]) or properties->>'orderId'=any(${orderIds}::text[])`;
      await sql`delete from public.retail_order_settlements where organisation_id=${organisationId}::uuid`;
      await sql`delete from public.finance_transactions where metadata->>'checkoutPaymentId'=any(${paymentIds}::text[])
        or metadata->>'orderId'=any(${orderIds}::text[])`;
      await sql`delete from public.retail_checkout_payment_versions where payment_id=any(${paymentIds}::uuid[])`;
      await sql`delete from public.retail_checkout_payments where plan_id=${planId}::uuid`;
      await sql`delete from public.retail_customer_order_lines where organisation_id=${organisationId}::uuid`;
      await sql`delete from public.retail_customer_orders where organisation_id=${organisationId}::uuid`;
      await sql`delete from public.organisations where id=${organisationId}::uuid`;
      await sql`delete from public.assessments where plan_id=${planId}::uuid`;
    });
    await closeSqlPool();
  });
  async function seed(status = "paid", lineProductId = productId) {
    const sql = getSql()!, id = randomUUID(); paymentIds.push(id);
    const [payment] = await sql<RetailSessionPayment[]>`insert into public.retail_checkout_payments
      (id,plan_id,selected_retailer_organisation_id,status,amount,currency,stripe_mode,idempotency_key,
       paid_at,quote_lines,customer_email,metadata)
      values (${id}::uuid,${planId}::uuid,${organisationId}::uuid,${status},250000000,'USD','test',${id},
        ${status === "paid" ? new Date() : null},${sql.json([{
          currency: "USD", etaDate: null, imageUrl: null, productId: lineProductId, productTitle: "Fixture supplement",
          quantity: 1, retailerPayableAmount: 100, retailerPayableSource: "rrp", retailSellableProductId: null, unitPriceAmount: 250
        }])},'fixture@example.invalid','{"internal_test":true,"channel":"web"}') returning *`;
    return payment!;
  }
  function session(payment: RetailSessionPayment, paid: boolean) {
    return { id: `cs_fixture_${payment.id}`, status: "complete", payment_status: paid ? "paid" : "unpaid",
      amount_total: 25000, currency: "usd", metadata: { paymentId: payment.id }, customer: null,
      payment_intent: null, livemode: false } as Stripe.Checkout.Session;
  }
  it("concurrent browser/webhook returns create one order, settlement and tracking destination", async () => {
    const payment = await seed(), sql = getSql()!;
    let arrivals = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    fxBarrier = async () => { if (++arrivals === 3) release(); await barrier; };
    const results = await Promise.all(Array.from({ length: 3 }, () => fulfillRetailCheckoutSession({ paymentId: payment.id })));
    fxBarrier = null;
    assert.equal(arrivals, 3, "All return handlers started from the same paid snapshot");
    assert.ok(results.every(result => result?.status === "fulfilled"));
    assert.equal(new Set(results.map(result => result?.orderId)).size, 1);
    assert.equal(new Set(results.map(result => result?.destination)).size, 1);
    const [orderCount] = await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'checkoutPaymentId'=${payment.id}`;
    const [settlementCount] = await sql`select count(*)::int as n from public.retail_order_settlements where retail_checkout_payment_id=${payment.id}::uuid`;
    const [versionCount] = await sql`select count(*)::int as n from public.retail_checkout_payment_versions where payment_id=${payment.id}::uuid and action='retail_checkout_fulfilled'`;
    const [revenueCount] = await sql`select count(*)::int as n from public.finance_transactions where source_ref=${`retail-checkout:${payment.id}:customer-inflow`}`;
    const [allocationCount] = await sql`select count(*)::int as n from public.tasks where source_entity_id=${results[0]!.orderId}::uuid and task_type='retail_customer_order_allocate'`;
    assert.equal(orderCount.n, 1); assert.equal(settlementCount.n, 1); assert.equal(versionCount.n, 1);
    assert.equal(revenueCount.n, 1); assert.equal(allocationCount.n, 1);
    const destination = results[0]!.destination;
    const reference = decodeURIComponent(destination.split("/").at(-1)!);
    assert.equal((await getTrackingOrderByReference(reference, "en"))?.orderId, results[0]!.orderId);
    const [beforeReplay] = await sql`select tracking_token_hash,fulfilled_at from public.retail_checkout_payments where id=${payment.id}::uuid`;
    // A delayed unpaid observation must not clear fulfillment or change tracking.
    await recordRetailProviderSession(sql, payment, session(payment, false));
    assert.equal((await fulfillRetailCheckoutSession({ paymentId: payment.id }))?.destination, destination);
    const [afterReplay] = await sql`select tracking_token_hash,fulfilled_at from public.retail_checkout_payments where id=${payment.id}::uuid`;
    assert.deepEqual(afterReplay, beforeReplay);
  });
  it("complete but unpaid async checkout creates no order until provider payment confirmation", async () => {
    const payment = await seed("created"), sql = getSql()!;
    const processing = await recordRetailProviderSession(sql, payment, session(payment, false));
    assert.equal(processing.status, "processing");
    assert.equal((await fulfillRetailCheckoutSession({ paymentId: payment.id }))?.status, "processing");
    assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'checkoutPaymentId'=${payment.id}`)[0].n, 0);
    await recordRetailProviderSession(sql, payment, session(payment, true));
    assert.equal((await fulfillRetailCheckoutSession({ paymentId: payment.id }))?.status, "fulfilled");
    assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'checkoutPaymentId'=${payment.id}`)[0].n, 1);
  });
  it("rolls back an order if a line cannot be created, then retries cleanly", async () => {
    const payment = await seed("paid", randomUUID()), sql = getSql()!;
    await assert.rejects(fulfillRetailCheckoutSession({ paymentId: payment.id }), { code: "23503" });
    assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'checkoutPaymentId'=${payment.id}`)[0].n, 0);
    const [failed] = await sql`select status,retail_customer_order_id,tracking_token_hash from public.retail_checkout_payments where id=${payment.id}::uuid`;
    assert.deepEqual(failed, { status: "paid", retail_customer_order_id: null, tracking_token_hash: null });
    await sql`update public.retail_checkout_payments set quote_lines=jsonb_set(quote_lines,'{0,productId}',to_jsonb(${productId}::text)) where id=${payment.id}::uuid`;
    assert.equal((await fulfillRetailCheckoutSession({ paymentId: payment.id }))?.status, "fulfilled");
    assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'checkoutPaymentId'=${payment.id}`)[0].n, 1);
  });
});
