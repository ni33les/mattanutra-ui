import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { getSql, closeSqlPool } from "../../lib/db.ts";
import { fixtureDatabaseUrl } from "../helpers/fixture-teardown.ts";
import { seedPharmacyFixture } from "../helpers/pharmacy-fixture.ts";
import { captureAssessment } from "../../lib/assessment-capture.ts";
import { buildTaskWorkItem } from "../../lib/task-work-items.ts";
import { getTaskBundle } from "../../lib/task-service.ts";
import { loadAdminSafetyReferenceSnapshot } from "../../lib/agentic/catalogue/load-safety-ceilings.ts";
import { loadProductRecommendationFreshnessSnapshot } from "../../lib/product-recommendation-freshness.ts";
import { prepareTaskCompletionResult } from "../../lib/task-result-applier.ts";
import { recommendWithMatcher } from "../../lib/matcher/adapters/web.ts";
import { pharmacyOrderQuote } from "../../lib/pharmacy-orders.ts";
fixtureDatabaseUrl();
const sql = getSql()!;
after(closeSqlPool);

test("PHARM-FOLLOWUP-MARKET visiting customer uses pharmacy catalogue through preparation, publication and checkout", async () => {
  const [pharmacy] = await sql`select id::text,slug from organisations where slug='matcher-v5-isolated-fixture-retailer'`;
  assert.ok(pharmacy, "A real controlled retailer is required");
  const captured = await captureAssessment({ pharmacyId: pharmacy.slug, locale: "en", answers: { country: "Philippines", age: "36-45", sex: "male", goals: ["energy"] } }, {idempotencyKey: randomUUID()});
  const saved = await seedPharmacyFixture("en", true, captured);
  const [row] = await sql`select id::text from tasks where plan_id=${saved.planId}::uuid and task_type='generate_product_recommendations'`;
  const original = (await getTaskBundle({taskId: row.id})).task;
  const {runtimeRevision,fingerprint} = await loadAdminSafetyReferenceSnapshot(sql);
  const task = {...original, payload: {...original.payload as Record<string,unknown>, catalogueRevision: runtimeRevision, safetyReferenceIdentity: {runtimeRevision,fingerprint}}};
  const freshness = await loadProductRecommendationFreshnessSnapshot(sql, {planId:saved.planId,algorithmVersion:"importance-matching-4",stackPreference:"balanced"});
  assert.equal(freshness?.countryCode,"TH");
  // Exercise the actual immutable catalogue loader, not its empty unit-test stub.
  const marker = process.env.NODE_TEST_CONTEXT;
  let work;
  try {
    delete process.env.NODE_TEST_CONTEXT;
    work = await buildTaskWorkItem(task);
  } finally {
    if (marker === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = marker;
  }
  assert.equal(work.taskType, "generate_product_recommendations");
  if (work.taskType !== "generate_product_recommendations") throw new Error("Matching work was not prepared");
  assert.equal(work.countryCode, "TH", "The shop country owns product eligibility, not the visitor's residence");
  const candidates = work.retailerCandidateSets.flatMap(set => set.candidates);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(c => c.selectedRetailerOrganisationId === pharmacy.id));
  const result = recommendWithMatcher({candidates, needs: work.needs, countryCode: work.countryCode, clientContext: work.clientContext, clientSex: work.clientSex, stackPreference: work.stackPreference});
  assert.ok(result.recommendations.length > 0);
  const prepared = await prepareTaskCompletionResult({task,sql,resultPayload:{recommendations:result}});
  assert.equal(prepared.products?.countryCode, "TH");
  const quote = await pharmacyOrderQuote(saved.planId,saved.slug,"en");
  assert.equal(quote.lines.length,1); assert.equal(quote.lines[0].unitPrice,17);
  assert.ok(freshness?.runId, "The original TH recommendation is current");
  const wrongRun = randomUUID();
  await sql`insert into product_recommendation_runs
    select (jsonb_populate_record(null::product_recommendation_runs,
      to_jsonb(r) || jsonb_build_object('id',${wrongRun}::uuid,'market_region','PH','generated_at',now()))).*
    from product_recommendation_runs r where id=${freshness!.runId}::uuid`;
  const stale = await loadProductRecommendationFreshnessSnapshot(sql, {planId:saved.planId,algorithmVersion:result.diagnostics.algorithmVersion,stackPreference:"balanced"});
  assert.equal(stale?.runId,freshness!.runId,"A newer result from the wrong market cannot replace the last correct recommendation");
  assert.equal((await sql`select answers->>'country' as country from assessments where plan_id=${saved.planId}::uuid`)[0].country,"Philippines");
});
