import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type Stripe from "stripe";
import { closeSqlPool, getSql } from "../lib/db.ts";
import { ensureRetailProviderSession, recordRetailProviderSession, retailPaymentConfirmed, type RetailSessionPayment, type RetailSessionProvider } from "../lib/retail-checkout-provider-session.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("retail provider session replay on PostgreSQL", { skip: !databaseUrl }, () => {
  const planId = randomUUID();
  before(async () => {
    fixtureDatabaseUrl();
    process.env.DB_URL = databaseUrl;
    await getSql()!`insert into public.assessments (plan_id, locale, answers, answer_summary, health_score)
      values (${planId}::uuid, 'en', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`;
  });
  after(async () => {
    await getSql()!`delete from public.retail_checkout_payments where plan_id = ${planId}::uuid`;
    await getSql()!`delete from public.assessments where plan_id = ${planId}::uuid`;
    await closeSqlPool();
  });
  async function seed() {
    const [payment] = await getSql()!<RetailSessionPayment[]>`insert into public.retail_checkout_payments
      (id, plan_id, amount, currency, stripe_mode, idempotency_key, metadata)
      values (${randomUUID()}::uuid, ${planId}::uuid, 250000000, 'THB', 'test', ${randomUUID()},
        '{"stripeSessionAttemptState":"not_started"}'::jsonb) returning *`;
    return payment!;
  }
  function parameters(payment: RetailSessionPayment): Stripe.Checkout.SessionCreateParams {
    return { mode: "payment", locale: "en", metadata: { paymentId: payment.id },
      line_items: [{ price_data: { currency: "thb", unit_amount: 25000, product_data: { name: "Fixture product" } }, quantity: 1 }] };
  }
  function session(payment: RetailSessionPayment, patch: Partial<Stripe.Checkout.Session> = {}) {
    return { id: `cs_fixture_${payment.id}`, client_secret: "fixture_client_secret", status: "open", payment_status: "unpaid",
      amount_total: 25000, currency: "thb", metadata: { paymentId: payment.id }, customer: null, payment_intent: null,
      ...patch } as Stripe.Checkout.Session;
  }
  function fakeProvider(payment: RetailSessionPayment) {
    const sessions = new Map<string, Stripe.Checkout.Session>();
    const requests: Array<{ parameters: Stripe.Checkout.SessionCreateParams; key: string }> = [];
    let retrieves = 0;
    const provider: RetailSessionProvider = {
      async create(input, options) {
        requests.push({ parameters: input, key: options.idempotencyKey });
        const existing = sessions.get(options.idempotencyKey);
        if (existing) return existing;
        const created = session(payment); sessions.set(options.idempotencyKey, created); return created;
      },
      async retrieve(id) {
        retrieves += 1;
        const found = [...sessions.values()].find(item => item.id === id);
        assert.ok(found); return found;
      }
    };
    return { provider, sessions, requests, get retrieves() { return retrieves; } };
  }
  it("concurrent retries share one provider session and persist identical frozen parameters", async () => {
    const payment = await seed(); const fake = fakeProvider(payment);
    let firstStarted!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { firstStarted = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const provider: RetailSessionProvider = { ...fake.provider, async create(params, options) {
      const created = await fake.provider.create(params, options); firstStarted(); await hold; return created;
    } };
    const first = ensureRetailProviderSession({ sql: getSql()!, payment, provider, parameters: parameters(payment) });
    await started;
    const second = ensureRetailProviderSession({ sql: getSql()!, payment, provider: fake.provider,
      parameters: { ...parameters(payment), locale: "th" } });
    const secondResult = await second; release();
    const firstResult = await first;
    assert.equal(firstResult.session?.id, secondResult.session?.id);
    assert.equal(fake.sessions.size, 1); assert.equal(fake.requests.length, 2);
    assert.equal(fake.requests[0].key, fake.requests[1].key);
    assert.deepEqual(fake.requests[0].parameters, fake.requests[1].parameters);
    assert.equal(fake.requests[1].parameters.locale, "en");
    assert.equal(firstResult.payment.status, "checkout_session_created");
    await ensureRetailProviderSession({ sql: getSql()!, payment, provider: fake.provider, parameters: parameters(payment) });
    assert.equal(fake.requests.length, 2); assert.equal(fake.retrieves, 1);
  });
  it("replays an interrupted provider acknowledgement without creating another payable session", async () => {
    const payment = await seed(); const fake = fakeProvider(payment);
    await assert.rejects(ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: {
      ...fake.provider, async create(params, options) { await fake.provider.create(params, options); throw new Error("Fixture lost provider response"); }
    } }), /lost provider response/);
    const [pending] = await getSql()!`select stripe_checkout_session_id, metadata from public.retail_checkout_payments where id = ${payment.id}::uuid`;
    assert.equal(pending.stripe_checkout_session_id, null);
    assert.equal(typeof pending.metadata.stripeSessionFirstAttemptAtMs, "number");
    const resumed = await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    assert.equal(resumed.session?.id, [...fake.sessions.values()][0].id);
    assert.equal(fake.sessions.size, 1); assert.equal(new Set(fake.requests.map(request => request.key)).size, 1);
    assert.equal((resumed.payment.metadata as Record<string, unknown>).stripeSessionFirstAttemptAtMs, pending.metadata.stripeSessionFirstAttemptAtMs);
  });
  it("requires reconciliation for old ambiguous attempts without reusing a pruned provider key", async () => {
    for (const hours of [23, 25]) {
      const payment = await seed(); const fake = fakeProvider(payment);
      await assert.rejects(ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: {
        ...fake.provider, async create(params, options) { await fake.provider.create(params, options); throw new Error("Fixture lost provider response"); }
      } }), /lost provider response/);
      const [aged] = await getSql()!`update public.retail_checkout_payments
        set metadata = jsonb_set(metadata, '{stripeSessionFirstAttemptAtMs}',
          to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000 - ${hours * 60 * 60 * 1000})::bigint))
        where id = ${payment.id}::uuid returning metadata`;
      // The provider may no longer remember this key; another create would be a new session.
      fake.sessions.clear();
      for (let retry = 0; retry < 2; retry += 1) await assert.rejects(
        ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider }),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "checkout_reconciliation_required"
      );
      assert.equal(fake.requests.length, 1); assert.equal(fake.sessions.size, 0); assert.equal(fake.retrieves, 0);
      const [persisted] = await getSql()!`select metadata, status from public.retail_checkout_payments where id = ${payment.id}::uuid`;
      assert.equal(persisted.metadata.stripeSessionFirstAttemptAtMs, aged.metadata.stripeSessionFirstAttemptAtMs);
      assert.equal(persisted.metadata.stripeSessionAttemptState, "reconciliation_required");
      assert.equal(persisted.status, "created");
    }
  });
  it("requires reconciliation when historical attempt provenance is missing", async () => {
    for (const frozenParameters of [false, true]) {
      const payment = await seed(); const fake = fakeProvider(payment);
      const metadata = frozenParameters ? { stripeSessionParameters: parameters(payment) } : {};
      await getSql()!`update public.retail_checkout_payments set metadata = ${getSql()!.json(JSON.parse(JSON.stringify(metadata)))} where id = ${payment.id}::uuid`;
      await assert.rejects(ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider }), /Payment verification is required/);
      assert.equal(fake.requests.length, 0); assert.equal(fake.retrieves, 0);
    }
  });
  it("retrieves a saved session normally after the idempotency retry window", async () => {
    const payment = await seed(); const fake = fakeProvider(payment);
    await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    await getSql()!`update public.retail_checkout_payments
      set metadata = jsonb_set(metadata, '{stripeSessionFirstAttemptAtMs}',
        to_jsonb(floor(extract(epoch from clock_timestamp() - interval '25 hours') * 1000)::bigint))
      where id = ${payment.id}::uuid`;
    const replay = await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    assert.equal(replay.session?.id, [...fake.sessions.values()][0].id);
    assert.equal(fake.requests.length, 1); assert.equal(fake.retrieves, 1);
  });
  it("a delayed unpaid creation result cannot overwrite concurrent payment confirmation", async () => {
    const payment = await seed(); const fake = fakeProvider(payment);
    let started!: () => void; let release!: () => void;
    const creating = new Promise<void>(resolve => { started = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const inFlight = ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: {
      ...fake.provider, async create(params, options) { const result = await fake.provider.create(params, options); started(); await hold; return result; }
    } });
    await creating;
    const confirmed = await recordRetailProviderSession(getSql()!, payment, session(payment, { status: "complete", payment_status: "paid" }));
    release(); const delayed = await inFlight;
    assert.equal(delayed.payment.status, "paid"); assert.deepEqual(delayed.payment.paid_at, confirmed.paid_at);
    assert.equal(fake.sessions.size, 1);
    const replay = await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    assert.equal(replay.session, null); assert.equal(fake.requests.length, 1); assert.equal(fake.retrieves, 0);
  });
  it("reconciles a completed provider session and keeps fulfilled state on stale observations", async () => {
    const payment = await seed(); const fake = fakeProvider(payment);
    await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    fake.sessions.set(fake.requests[0].key, session(payment, { status: "complete", payment_status: "paid" }));
    const resumed = await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    assert.equal(resumed.payment.status, "paid"); assert.equal(retailPaymentConfirmed(resumed.payment), true);
    await getSql()!`update public.retail_checkout_payments set status = 'fulfilled', fulfilled_at = now() where id = ${payment.id}::uuid`;
    const stale = await recordRetailProviderSession(getSql()!, payment, session(payment));
    assert.equal(stale.status, "fulfilled"); assert.ok(stale.paid_at); assert.ok(stale.fulfilled_at);
    const replay = await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
    assert.equal(replay.session, null); assert.equal(replay.payment.status, "fulfilled");
    assert.equal(fake.requests.length, 1); assert.equal(fake.retrieves, 1);
  });
  it("keeps an asynchronously processing or expired provider session from starting another charge", async () => {
    for (const status of ["complete", "expired"] as const) {
      const payment = await seed(); const fake = fakeProvider(payment);
      await ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
      fake.sessions.set(fake.requests[0].key, session(payment, { status }));
      const retry = () => ensureRetailProviderSession({ sql: getSql()!, payment, parameters: parameters(payment), provider: fake.provider });
      if (status === "expired") await assert.rejects(retry(), /expired or was cancelled/);
      else assert.equal((await retry()).payment.status, "processing");
      assert.equal(fake.requests.length, 1); assert.equal(fake.sessions.size, 1);
    }
  });
  it("rejects mismatched paid amounts or payment identity without confirming access", async () => {
    const payment = await seed();
    await assert.rejects(recordRetailProviderSession(getSql()!, payment, session(payment, { payment_status: "paid", amount_total: 1 })), /amount does not match/);
    await assert.rejects(recordRetailProviderSession(getSql()!, payment, session(payment, { metadata: { paymentId: randomUUID() } })), /does not belong/);
    const [row] = await getSql()!<RetailSessionPayment[]>`select * from public.retail_checkout_payments where id = ${payment.id}::uuid`;
    assert.equal(row.status, "created"); assert.equal(retailPaymentConfirmed(row), false);
  });
});
