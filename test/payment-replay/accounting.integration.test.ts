import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../../lib/db.ts";
import { recordStripePaymentAccounting, type PaymentRow } from "../../lib/stripe-payments.ts";
const uri = new URL(process.env.TEST_DB_URL!);
assert.equal(uri.hostname, "127.0.0.1"); assert.match(uri.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = getSql()!; after(closeSqlPool);
const fx = { currency: "THB", usdRate: 0.031, fxRateId: null, fallbackUsed: false, provider: "fixture", source: "fixture" };
const rollback = new Error("isolated accounting rollback");
const run = async (fn: (tx: typeof sql) => Promise<void>) => { await assert.rejects(withDatabaseTransaction(sql, async tx => { await fn(tx); throw rollback; }), e => e === rollback); };
async function payment(tx: typeof sql) {
  const [p] = await tx<PaymentRow[]>`insert into payments(id,selected_plan,status,amount,stripe_mode) values (${randomUUID()}::uuid,'precision','paid',690000000,'mock') returning *`;
  return p;
}
async function entry(tx: typeof sql, id: string) {
  return (await tx`select row_to_json(f)::text as exact from finance_transactions f where source='stripe' and source_ref=${`stripe:payment:${id}:nominal-revenue`}`)[0]?.exact;
}
test("PRD-COMPAT-02 accounting replay preserves existing amounts, FX, timestamps and metadata", async () => {
  await run(async tx => {
    const p = await payment(tx); await recordStripePaymentAccounting(tx, p, null, fx); const before = await entry(tx, p.id); assert.ok(before);
    await recordStripePaymentAccounting(tx, { ...p, plan_id: randomUUID() }, null, { ...fx, usdRate: 0.029, provider: "new-rate" });
    assert.equal(await entry(tx, p.id), before);
  });
});
test("PAY-ACCOUNT-02 conflicting amount or currency cannot rewrite a booking", async () => {
  for (const change of [{ amount: 790000000 }, { currency: "USD" }]) await run(async tx => {
    const p = await payment(tx); await recordStripePaymentAccounting(tx, p, null, fx); const before = await entry(tx, p.id);
    await assert.rejects(recordStripePaymentAccounting(tx, { ...p, ...change }, null, fx), { code: "payment_accounting_conflict" });
    assert.equal(await entry(tx, p.id), before);
  });
});
test("PAY-ACCOUNT-03 conflicting provider identity cannot rewrite a booking", async () => {
  await run(async tx => {
    const p = { ...await payment(tx), stripe_payment_intent_id: "pi_original" };
    await recordStripePaymentAccounting(tx, p, null, fx); const before = await entry(tx, p.id);
    await assert.rejects(recordStripePaymentAccounting(tx, { ...p, stripe_payment_intent_id: "pi_other" }, null, fx), { code: "payment_accounting_conflict" });
    assert.equal(await entry(tx, p.id), before);
  });
});
test("PAY-ACCOUNT-04 known revenue replays without querying FX", async () => {
  await run(async tx => {
    const p = await payment(tx); await recordStripePaymentAccounting(tx, p, null, fx); const before = await entry(tx, p.id);
    await recordStripePaymentAccounting(tx, p, null);
    assert.equal(await entry(tx, p.id), before);
  });
});
test("PAY-ACCOUNT-05 revenue and a known Stripe fee both retain their original booking", async () => {
  await run(async tx => {
    const p = await payment(tx);
    const session = { id: `cs_${p.id}`, amount_total: 69000, currency: "thb", payment_intent: {
      id: `pi_${p.id}`, latest_charge: { balance_transaction: { id: `txn_${p.id}`, fee: 300 } }
    } } as unknown as import("stripe").default.Checkout.Session;
    await recordStripePaymentAccounting(tx, p, session, fx);
    const before = await tx`select row_to_json(f)::text as exact from finance_transactions f where metadata->>'paymentId'=${p.id} order by id`;
    assert.equal(before.length, 2);
    await recordStripePaymentAccounting(tx, p, session);
    assert.deepEqual(await tx`select row_to_json(f)::text as exact from finance_transactions f where metadata->>'paymentId'=${p.id} order by id`, before);
  });
});
