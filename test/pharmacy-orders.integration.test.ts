import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, it } from "node:test";
import { getSql, closeSqlPool } from "../lib/db.ts";
import { createPharmacyOrder, readPharmacyOrder, pharmacyOrderQuote, readPharmacyAnalysis } from "../lib/pharmacy-orders.ts";
import { captureAssessment } from "../lib/assessment-capture.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { getStoredHealthScoreAnalysisSnapshot } from "../lib/assessment-store.ts";
import { seedPharmacyFixture } from "./helpers/pharmacy-fixture.ts";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { markRetailOrderSettlementDue } from "../lib/admin-retail-financials.ts";
import { createAssessmentResumeDraft, getAssessmentResumeDraft } from "../lib/assessment-resume-store.ts";
import { buildAssessmentResumeUrl } from "../lib/assessment-resume-email.ts";
import { inStorePharmacyFromAnswers } from "../lib/pharmacy-in-store.ts";
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
  const [stored] = await sql`select i.selected_retailer_organisation_id::text, i.unit_price_amount, i.retail_sellable_product_id::text
    from public.product_recommendation_items i join public.product_recommendation_runs r on r.id=i.run_id where r.plan_id=${fixture.planId}::uuid limit 1`;
  assert.equal(stored.selected_retailer_organisation_id,fixture.pharmacyId);
  assert.equal(Number(stored.unit_price_amount),17);
  assert.ok(stored.retail_sellable_product_id,"The captured seller offer survives completion");
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
  const analysis = await readPharmacyAnalysis(fixture.planId,fixture.slug,a.id);
  assert.equal(analysis.revision,fixture.revision);
  assert.equal(analysis.retryAllowed,false,"A frozen order cannot regenerate the later assessment");
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
it("PHARM-PG-05 pharmacy orders never enter online settlement during later workflow replay", async () => {
  const fixture=await seedPharmacyFixture();
  const receipt=await createPharmacyOrder({planId:fixture.planId,pharmacy:fixture.slug,locale:"en",expectedRevision:fixture.revision,productIds:fixture.productIds,customerName:"Till"},randomUUID());
  const before=await counters();
  assert.equal(await markRetailOrderSettlementDue(sql,{orderId:receipt.id}),null);
  assert.deepEqual(await counters(),before);
});
it("PHARM-PG-06 schema replay preserves every existing order and line", async () => {
  const before=await sql`select id, to_jsonb(o) as value from public.retail_customer_orders o order by id`;
  assert.ok(before.length);
  const lines=await sql`select id,to_jsonb(l) as value from public.retail_customer_order_lines l order by id`;
  assert.ok(lines.length);
  const migration=await readFile("db-rollout/pharmacy-orders.sql","utf8");
  await sql.begin(tx=>tx.unsafe(migration));
  assert.deepEqual(await sql`select id,to_jsonb(o) as value from public.retail_customer_orders o order by id`,before);
  assert.deepEqual(await sql`select id,to_jsonb(l) as value from public.retail_customer_order_lines l order by id`,lines);
});
it("PHARM-PG-07 a fresh resume link retains its pharmacy and cannot capture into another store", async () => {
  const fixture = await seedPharmacyFixture();
  const draft = await createAssessmentResumeDraft({ answers: {sex:"male",age:"36-45",goals:["energy"]}, contactEmail:"resume@example.test", locale:"th", pharmacyId:fixture.slug });
  const saved = await getAssessmentResumeDraft(draft.token);
  assert.equal(inStorePharmacyFromAnswers(saved?.answers)?.id, fixture.pharmacyId);
  assert.ok(buildAssessmentResumeUrl("th", draft.token, draft.pharmacySlug).includes(`/th/retail/${fixture.slug}/quiz?resume=`));
  const [other] = await sql`select slug from public.organisations where organisation_type='tenant' and status='active' and id<>${fixture.pharmacyId}::uuid limit 1`;
  assert.ok(other,"Cross-store resume fixture prerequisite");
  await assert.rejects(captureAssessment({answers:saved!.answers,locale:"th",pharmacyId:other.slug,resumeToken:draft.token}, {idempotencyKey:randomUUID()}), {code:"pharmacy_conflict"});
  assert.equal((await sql`select count(*)::int as n from public.assessments where plan_id=${draft.planId}::uuid`)[0].n,0);
  assert.ok(buildAssessmentResumeUrl("en",draft.token).includes('/en/nutrition/quiz?resume='),"ordinary web resume URL stays unchanged");
});
