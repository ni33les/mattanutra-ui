import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../../lib/db.ts";
import { enqueueWebPaymentFulfillment, fulfillWebPayment } from "../../lib/web-payment-fulfillment.ts";
import { getPayment, type PaymentRow } from "../../lib/stripe-payments.ts";
import { getFunnelReadiness } from "../../lib/funnel-readiness.ts";

const uri = new URL(process.env.TEST_DB_URL!);
assert.equal(uri.hostname, "127.0.0.1");
assert.match(uri.pathname, /^\/mattanutra_lock_review_ax_/);
assert.equal(process.env.PAYMENT_REPLAY_BACKUP_SHA256, "9e3af54fb5274012ca370694d7b4132e72107c777090b5f0639ad6ee2093b335", "Verified restored PRD fixture required");
const sql = getSql()!;
after(closeSqlPool);
const rollback = new Error("rollback isolated replay");
async function completedHistoricalPayments() {
  const rows = await sql<PaymentRow[]>`select p.* from payments p where p.status in ('paid','bound') and exists (
    select 1 from finance_transactions f where f.source='stripe' and f.source_ref='stripe:payment:'||p.id::text||':nominal-revenue'
      and f.amount=p.amount and f.currency=p.currency) order by p.created_at`;
  assert.equal(rows.length, 2, "Frozen corpus must contain both reported payments");
  for (const p of rows) {
    const [proof] = await sql`select
      exists(select 1 from bpm where properties->>'paymentId'=${p.id} and event_name='payment_fulfillment_succeeded') as success,
      exists(select 1 from assessment_versions where plan_id=${p.plan_id}::uuid and action='plan_selection_projection_update') as adoption,
      exists(select 1 from tasks where plan_id=${p.plan_id}::uuid and task_type='generate_supplement_guidance' and status='completed') as work,
      exists(select 1 from formulations where plan_id=${p.plan_id}::uuid and (model_version is null or model_version not like '%:example')) as output`;
    assert.deepEqual(proof, { success: true, adoption: true, work: true, output: true });
  }
  return rows;
}
async function preservedRows() {
  return sql`select 'payment' as kind,p.id::text as id,row_to_json(p)::text as content from payments p
    union all select 'finance',f.id::text,row_to_json(f)::text from finance_transactions f
    union all select 'assessment',a.plan_id::text,row_to_json(a)::text from assessments a order by kind,id`;
}
test("PRD-COMPAT-01 completed historical payments admit no new fulfilment", async () => {
  const before = await preservedRows(); let admitted = 0;
  await assert.rejects(withDatabaseTransaction(sql, async tx => {
    for (const payment of await completedHistoricalPayments()) if (await enqueueWebPaymentFulfillment(tx, payment)) admitted++;
    throw rollback;
  }), error => error === rollback);
  assert.equal(admitted, 0);
  assert.deepEqual(await preservedRows(), before);
});
test("PRD-COMPAT-03 historical worker replay is complete without provider or FX requests", async () => {
  const before = await preservedRows();
  for (const p of await completedHistoricalPayments()) {
    const result = await fulfillWebPayment(p.id, {
      session: async () => { throw new Error("Replay must not fetch Stripe"); },
      rate: async () => { throw new Error("Replay must not fetch FX"); }
    });
    assert.equal(result.fulfillmentStatus, "complete");
  }
  assert.deepEqual(await preservedRows(), before);
});
test("PRD-COMPAT-04 payment and readiness reads expose effective completion in every locale", async () => {
  const before = await preservedRows();
  for (const p of await completedHistoricalPayments()) {
    assert.equal((await getPayment(p.id))!.fulfillmentStatus, "complete");
    for (const locale of ["en", "th", "zh-CN"]) assert.equal((await getFunnelReadiness(p.plan_id!, locale))!.fulfillmentStatus, "complete");
  }
  assert.deepEqual(await preservedRows(), before);
});
