import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getSql, closeSqlPool } from "../../lib/db.ts";
import { getPayment } from "../../lib/stripe-payments.ts";
import { recordPaymentAccountingOnce } from "../../lib/payment-accounting.ts";
import { preparePaymentFulfillment } from "../../lib/payment-fulfillment-evidence.ts";
import { enqueueWebPaymentFulfillment } from "../../lib/web-payment-fulfillment.ts";
import { isolated, paidFixture } from "./helpers.ts";
const uri = new URL(process.env.TEST_DB_URL!); assert.equal(uri.hostname, "127.0.0.1"); assert.match(uri.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = getSql()!; after(closeSqlPool);
const entry = () => ({ amount: 690000000, currency: "THB", category: "revenue" as const, entryType: "nominal" as const,
  provider: "stripe", source: "stripe", sourceRef: `stripe:payment:${randomUUID()}:nominal-revenue`,
  from: "payment:fixture", to: "mattanutra:revenue", description: "Isolated concurrency fixture", usdRate: 0.031 });
test("PAY-RACE-01 concurrent first booking and replay preserve one identical entry", async () => {
  const input = entry();
  try {
    const ids = await Promise.all([recordPaymentAccountingOnce(sql, input), recordPaymentAccountingOnce(sql, input)]);
    assert.equal(new Set(ids).size, 1);
    const rows = await sql`select row_to_json(f)::text as exact from finance_transactions f where source='stripe' and source_ref=${input.sourceRef}`;
    assert.equal(rows.length, 1);
    await Promise.all([recordPaymentAccountingOnce(sql, { ...input, usdRate: 0.04 }), recordPaymentAccountingOnce(sql, input)]);
    assert.deepEqual(await sql`select row_to_json(f)::text as exact from finance_transactions f where source='stripe' and source_ref=${input.sourceRef}`, rows);
  } finally { await sql`delete from finance_transactions where source='stripe' and source_ref=${input.sourceRef}`; }
});
test("PAY-RACE-02 conflicting concurrent first bookings cannot silently overwrite each other", async () => {
  const input = entry();
  try {
    const results = await Promise.allSettled([recordPaymentAccountingOnce(sql, input), recordPaymentAccountingOnce(sql, { ...input, amount: 700000000 })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const failure = results.find(r => r.status === "rejected"); assert.ok(failure && failure.status === "rejected");
    assert.equal(failure.reason.code, "payment_accounting_conflict");
    assert.equal((await sql`select count(*)::int as n from finance_transactions where source_ref=${input.sourceRef}`)[0].n, 1);
  } finally { await sql`delete from finance_transactions where source='stripe' and source_ref=${input.sourceRef}`; }
});
test("PAY-RACE-03 prepared admission does not load history under a mutation transaction", async () => {
  await isolated(async tx => {
    const p = await paidFixture(tx, { receipt: false }); const prepared = await preparePaymentFulfillment(tx, p);
    const statements: string[] = [];
    const traced = Object.assign(((parts: TemplateStringsArray, ...values: unknown[]) => { statements.push(parts.join("?")); return tx(parts, ...values as never[]); }), tx) as typeof tx;
    assert.ok(await enqueueWebPaymentFulfillment(traced, p, prepared));
    assert.ok(statements.length > 0);
    assert.ok(statements.every(s => !/\b(bpm|assessment_versions|formulations|finance_transactions)\b/.test(s)));
  });
});
test("PAY-RACE-04 stale prepared binding is rejected before writes", async () => {
  await isolated(async tx => {
    const p = await paidFixture(tx); const prepared = await preparePaymentFulfillment(tx, p);
    await assert.rejects(enqueueWebPaymentFulfillment(tx, { ...p, plan_id: randomUUID() }, prepared), /Payment changed/);
    assert.equal((await tx`select count(*)::int as n from tasks where payload->>'paymentId'=${p.id}`)[0].n, 0);
  });
});
test("PAY-RACE-05 payment reads complete while the payment row is held by a writer", async () => {
  const id = randomUUID(); let release!: () => void; let acquired!: () => void;
  const held = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { acquired = r; });
  await sql`insert into payments(id,selected_plan,status,fulfillment_status,amount,stripe_mode) values (${id}::uuid,'precision','paid','complete',690000000,'mock')`;
  const writer = sql.begin(async tx => { await tx`select id from payments where id=${id}::uuid for update`; acquired(); await held; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await ready; const result = await Promise.race([getPayment(id), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Ordinary payment read waited on writer")), 1500); })]); assert.equal(result?.fulfillmentStatus, "complete"); }
  finally { if (timer) clearTimeout(timer); release(); await writer; await sql`delete from payment_versions where payment_id=${id}::uuid`; await sql`delete from payments where id=${id}::uuid`; }
});
