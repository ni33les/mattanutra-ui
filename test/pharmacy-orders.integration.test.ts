import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, it } from "node:test";
import { getSql, closeSqlPool } from "../lib/db.ts";
import { createPharmacyOrder, readPharmacyOrder, pharmacyOrderQuote } from "../lib/pharmacy-orders.ts";
import { captureAssessment } from "../lib/assessment-capture.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { getStoredHealthScoreAnalysisSnapshot } from "../lib/assessment-store.ts";
import { seedPharmacyFixture } from "./helpers/pharmacy-fixture.ts";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
fixtureDatabaseUrl();
const sql = getSql()!;
before(async () => { const migration = await readFile("db-rollout/pharmacy-orders.sql", "utf8"); await sql.begin(tx => tx.unsafe(migration)); });
after(closeSqlPool);
async function counters() {
  return (await sql`select (select count(*) from public.payments)::int as payments,
    (select count(*) from public.retail_checkout_payments)::int as checkout_payments,
    (select count(*) from public.finance_transactions)::int as finance,
    (select count(*) from public.retail_order_allocations)::int as allocations,
    (select count(*) from public.retail_order_settlements)::int as settlements`)[0];
}
it("PHARM-PG-01 explanation work is durable but never gates reveal or orders", async () => {
  const fixture = await seedPharmacyFixture();
  const tasks = await sql`select task_type,status from public.tasks where plan_id=${fixture.planId}::uuid`;
  assert.equal(tasks.filter(t => t.task_type === "analyze_healthscore").length, 1);
  assert.equal((await getFunnelReadiness(fixture.planId, "en"))?.readyForReveal, true);
  assert.equal((await getStoredHealthScoreAnalysisSnapshot(fixture.planId, "en"))?.generationStatus, "preparing");
  const quote = await pharmacyOrderQuote(fixture.planId, fixture.slug, "en");
  assert.equal(quote.lines[0].unitPrice, 17); assert.equal(quote.lines[0].quantity, 1);
  assert.equal(quote.lines[0].productId, fixture.productIds[0]);
});
it("PHARM-PG-02 concurrent replay saves one unpaid order, notification and no accounting", async () => {
  const fixture = await seedPharmacyFixture();
  const before = await counters(), key = randomUUID();
  const input = { planId: fixture.planId, pharmacy: fixture.slug, locale: "en", expectedRevision: fixture.revision, productIds: fixture.productIds, customerName: "Counter Visitor" };
  const [a,b] = await Promise.all([createPharmacyOrder(input,key),createPharmacyOrder(input,key)]);
  assert.deepEqual(a,b); assert.equal(a.status,"unpaid"); assert.equal(a.total,17);
  assert.deepEqual(await counters(),before);
  assert.deepEqual((await readPharmacyOrder(fixture.planId,fixture.slug,a.id))?.receipt,a);
  assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'planId'=${fixture.planId}`)[0].n,1);
  assert.equal((await sql`select count(*)::int as n from public.tasks where task_type='route_admin_communication' and payload->>'resourceId'=${a.id}`)[0].n,1);
  await assert.rejects(createPharmacyOrder({...input,customerName:"Another"},key), {code:"idempotency_conflict"});
  await sql`update public.assessments set input_revision=input_revision+1 where plan_id=${fixture.planId}::uuid`;
  assert.deepEqual(await createPharmacyOrder(input,key),a,"replay survives a later revision");
});
it("PHARM-PG-03 store rebinding and stale or injected products fail before an order exists", async () => {
  const fixture = await seedPharmacyFixture();
  const input = { planId:fixture.planId,pharmacy:fixture.slug,locale:"en",expectedRevision:fixture.revision,productIds:fixture.productIds,customerName:"V" };
  await assert.rejects(createPharmacyOrder({...input,expectedRevision:99},randomUUID()),{code:"assessment_changed"});
  await assert.rejects(createPharmacyOrder({...input,productIds:[randomUUID()]},randomUUID()),{code:"stale_product_selection"});
  await assert.rejects(pharmacyOrderQuote(fixture.planId,"missing-store","en"),{code:"assessment_not_found"});
  const [other] = await sql`select slug from public.organisations where organisation_type='tenant' and status='active' and id<>${fixture.pharmacyId}::uuid limit 1`;
  assert.ok(other,"Cross-store fixture prerequisite");
  await assert.rejects(captureAssessment({answers:{sex:"male",age:"36-45",goals:["energy"]},locale:"en",pharmacyId:other.slug},
    {planId:fixture.planId,idempotencyKey:randomUUID()}),{code:"pharmacy_conflict"});
  assert.equal((await sql`select count(*)::int as n from public.retail_customer_orders where metadata->>'planId'=${fixture.planId}`)[0].n,0);
});
it("PHARM-PG-04 order reads finish while an order writer is locked and do not change it", async () => {
  const fixture=await seedPharmacyFixture();
  const receipt=await createPharmacyOrder({planId:fixture.planId,pharmacy:fixture.slug,locale:"en",expectedRevision:fixture.revision,productIds:fixture.productIds,customerName:"Reader"},randomUUID());
  const before=await sql`select * from public.retail_customer_orders where id=${receipt.id}::uuid`;
  await sql.begin(async tx=>{
    await tx`select id from public.retail_customer_orders where id=${receipt.id}::uuid for update`;
    const result=await Promise.race([readPharmacyOrder(fixture.planId,fixture.slug,receipt.id),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error("Read blocked")),1500);timer.unref();})]);
    assert.deepEqual(result?.receipt,receipt);
  });
  assert.deepEqual(await sql`select * from public.retail_customer_orders where id=${receipt.id}::uuid`,before);
});
