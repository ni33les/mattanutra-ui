import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";
import { captureAssessment } from "../../lib/assessment-capture.ts";
import { getSql, closeSqlPool } from "../../lib/db.ts";
import { loadGenerationInput } from "../../lib/assessment-revisions.ts";
import { createPharmacyOrder } from "../../lib/pharmacy-orders.ts";
import { getAdminFlowData } from "../../lib/admin-flow-data.ts";
import { emptyAdminDashboardFilters } from "../../lib/admin-dashboard-filters.ts";
import { createAssessmentResumeDraft, getAssessmentResumeDraft } from "../../lib/assessment-resume-store.ts";
import { seedPharmacyFixture } from "../helpers/pharmacy-fixture.ts";
import { fixtureDatabaseUrl } from "../helpers/fixture-teardown.ts";
fixtureDatabaseUrl(); const sql = getSql()!; after(closeSqlPool);
const answers = { firstName: "Source Fixture", sex: "male", age: "36-45", goals: ["energy"] };
function bpm(source: string, ray: string) { return { ray, attribution: { trafficSource: "pharmacy", sourceDetail: source } }; }
it("PHARM-SRC-PG-01 capture and resume preserve acquisition independently of generated input", async () => {
  const fixture = await seedPharmacyFixture("en", false), ray = randomUUID();
  const draft = await createAssessmentResumeDraft({ answers, locale: "en", contactEmail: "source@example.test", pharmacyId: fixture.slug, bpm: bpm("business_card", ray) } as Parameters<typeof createAssessmentResumeDraft>[0]);
  const storedDraft = await getAssessmentResumeDraft(draft.token);
  assert.ok(storedDraft);
  assert.deepEqual((storedDraft.answers as typeof answers & {inStorePharmacy: {acquisition: unknown}}).inStorePharmacy.acquisition, {source: "business_card", ray});
  const captured = await captureAssessment({ answers, locale: "en", pharmacyId: fixture.slug, resumeToken: draft.token, bpm: bpm("in_store", randomUUID()) }, {idempotencyKey: randomUUID()});
  const [stored] = await sql`select answers from public.assessments where plan_id=${captured.planId}::uuid`;
  assert.deepEqual(stored.answers.inStorePharmacy.acquisition, {source: "business_card", ray});
  const input = await loadGenerationInput(sql, captured.planId);
  assert.ok(input); assert.equal((input.answers.inStorePharmacy as Record<string, unknown>).acquisition, undefined);
});
it("PHARM-SRC-PG-02 unpaid order retains source and funnel deduplicates retries without paid conversions", async () => {
  const fixture = await seedPharmacyFixture(), ray = randomUUID();
  // Tracking metadata is independent of the already-completed fixture result.
  await sql`update public.assessments set answers=jsonb_set(answers,'{inStorePharmacy,acquisition}',${sql.json({source:"business_card",ray})}) where plan_id=${fixture.planId}::uuid`;
  const input = {planId: fixture.planId, pharmacy: fixture.slug, locale: "en", expectedRevision: fixture.revision, productIds: fixture.productIds, customerName: "Source Fixture"};
  const key = randomUUID(); const receipt = await createPharmacyOrder(input,key);
  assert.deepEqual(await createPharmacyOrder(input,key), receipt);
  const [order] = await sql`select metadata from public.retail_customer_orders where id=${receipt.id}::uuid`;
  assert.deepEqual(order.metadata.acquisition, {source:"business_card",ray});
  const flow = await getAdminFlowData("all", {...emptyAdminDashboardFilters, planId: fixture.planId});
  const rows = (flow as typeof flow & {pharmacySources?: Array<{source:string; orders:number}>}).pharmacySources;
  assert.ok(rows, "Pharmacy sources must be visible in the funnel");
  assert.equal(rows.find(row=>row.source==="business_card")?.orders,1);
  assert.equal(flow.nodes.find(row=>row.id==="precisionPaid")?.count,0);
});
