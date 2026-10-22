import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { after, before, describe, it } from "node:test";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { bindMetaContext, recordMetaPlanMilestone, setMetaConsent } from "../lib/meta-tracking.ts";
import { FUNNEL_GENERATOR_VERSION } from "../lib/assessment-revisions.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import { validateWebProductMilestone } from "../lib/meta-web-product-milestone.ts";
register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { POST } = await import("../app/api/marketing/events/route.ts");

fixtureDatabaseUrl();
describe("free web reveal browser/CAPI identity", () => {
  const planId = randomUUID(), runId = randomUUID(), contexts: string[] = [];
  let owner: string, outsider: string, productIds: string[];
  const request = (context?: string) => new Request("https://dev.mattanutra.com/api/marketing/events", {
    headers: { origin: "https://dev.mattanutra.com", ...(context ? { cookie: `mn_marketing=granted; mn_marketing_context=${context}` } : {}) }
  });
  before(async () => {
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", META_TRACKING_ENABLED: "true",
      FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    const sql = getSql()!;
    await sql.unsafe(readFileSync(new URL("../scripts/meta-tracking-schema.sql", import.meta.url), "utf8"));
    await sql`insert into public.assessments(plan_id,locale,answers,answer_summary,health_score,input_revision,journey_version)
      values(${planId}::uuid,'th','{}','{}','{}',1,'web-products-v1')`;
    owner = await setMetaConsent(request(), true, "/th?campaign_id=123&adset_id=456&ad_id=789"); contexts.push(owner);
    outsider = await setMetaConsent(request(), true, "/th"); contexts.push(outsider);
    await withDatabaseTransaction(sql, tx => bindMetaContext(tx, "plan", planId, request(owner)));
    await sql`insert into public.formulations(plan_id,version,formulation,assessment_revision,generation_locale,generator_version)
      values(${planId}::uuid,1,'{"supplementBreakdown":[]}',1,'th',${FUNNEL_GENERATOR_VERSION})`;
    productIds = (await sql`select id::text from public.products order by id limit 3`).map(row => row.id);
    assert.equal(productIds.length, 3, "Requires the isolated catalogue seed");
    const diagnostics = { algorithmVersion: MATCHER_VERSION, stackPreference: "balanced", matching: {
      selectedCandidateKey: "fixture", options: [{ candidateKey: "fixture", productIds, recommendations: [], advice: [] }]
    } };
    await sql`insert into public.product_recommendation_runs(id,plan_id,assessment_revision,generation_locale,generator_version,catalogue_revision,diagnostics)
      values(${runId}::uuid,${planId}::uuid,1,'th',${FUNNEL_GENERATOR_VERSION},
        (select revision from public.catalogue_runtime_revision where singleton=true),${sql.json(diagnostics)})`;
    for (let i = 0; i < productIds.length; i++) await sql`insert into public.product_recommendation_items(run_id,product_id,rank,price_amount,url_used)
      values(${runId}::uuid,${productIds[i]}::uuid,${i+1},${100*(i+1)},'https://example.test/fixture')`;
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const events = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const taskIds = events.map(row => row.task_id).filter(Boolean);
      await cleanupFixtureRelationships(tx, { taskIds, planIds: [planId] });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await tx`delete from public.product_recommendation_items where run_id=${runId}::uuid`;
      await tx`delete from public.product_recommendation_runs where plan_id=${planId}::uuid`;
      await tx`delete from public.formulations where plan_id=${planId}::uuid`;
      await tx`delete from public.assessments where plan_id=${planId}::uuid`;
    });
    await closeSqlPool();
  });
  async function capture(stage: string, selectedItemIds: string[] = [], context = owner, revision = 1, formulaVersion = 1) {
    const response = await POST(new Request(request().url, { method: "POST", headers: request(context).headers,
      body: JSON.stringify({ name: stage === "basket" ? "AddToCart" : "ViewContent", eventId: randomUUID(), sessionId: randomUUID(),
        sourceUrl: `/th/nutrition/reveal?planId=${planId}`, data: { planId, locale: "th", stage, journey_version: "web-products-v1", value: 1, currency: "USD" },
        webProductMilestone: { revision, formulaVersion, runId, selectedItemIds, candidateKey: "fixture", selectionRevision: 0 } }) }));
    assert.equal(response.status, 200);
    return response.json();
  }
  it("records capture Lead once without HealthScore, paid plan or purchase", async () => {
    const sql = getSql()!;
    assert.ok(await withDatabaseTransaction(sql, tx => recordMetaPlanMilestone(tx, planId, "Lead", "th")));
    assert.equal(await withDatabaseTransaction(sql, tx => recordMetaPlanMilestone(tx, planId, "Lead", "th")), null);
    const rows = await sql`select event_name,custom_data,source_url from public.meta_conversion_events where context_id=${owner}::uuid`;
    assert.equal(rows.length, 1); assert.equal(rows[0].event_name, "Lead");
    assert.equal(rows[0].custom_data.funnel_stage, "assessment");
    assert.equal(rows[0].custom_data.journey_version, "web-products-v1");
    assert.equal(rows[0].custom_data.campaign_id, "123");
    assert.equal(new URL(rows[0].source_url).pathname, "/th/nutrition/quiz");
  });
  it("keeps formula and products distinct and deduplicates reloads and tabs", async () => {
    for (const stage of ["formula", "products"]) {
      const receipts = await Promise.all([capture(stage), capture(stage), capture(stage)]);
      assert.equal(receipts[0].accepted, true);
      assert.deepEqual(receipts[0], receipts[1]); assert.deepEqual(receipts[0], receipts[2]);
      assert.equal(receipts[0].data.funnel_stage, stage);
      assert.equal(receipts[0].data.campaign_id, "123");
      assert.equal(JSON.stringify(receipts[0].data).includes(runId), false);
    }
    const rows = await getSql()!`select event_name from public.meta_conversion_events where context_id=${owner}::uuid`;
    assert.equal(rows.filter(row => row.event_name === "ViewContent").length, 2);
    assert.equal(rows.filter(row => row.event_name === "AddToCart").length, 0);
  });
  it("validates subset confirmation, uses stored subtotal and reuses one event ID", async () => {
    const first = await capture("basket", [productIds[0], productIds[2]]);
    assert.equal(first.accepted, true); assert.equal(first.data.value, 400); assert.equal(first.data.currency, "THB");
    assert.equal(first.data.purchase_type, "products");
    assert.deepEqual(await capture("basket", [productIds[2], productIds[0]]), first);
    for (const ids of [[], [productIds[0], productIds[0]], [randomUUID()]]) assert.equal((await capture("basket", ids)).accepted, false);
    const omittedProof = await POST(new Request(request().url, { method: "POST", headers: request(owner).headers,
      body: JSON.stringify({ name: "AddToCart", eventId: randomUUID(), sessionId: randomUUID(), sourceUrl: "/th/nutrition/reveal",
        data: { planId, locale: "th", stage: "basket", value: 1, currency: "USD" } }) }));
    assert.equal((await omittedProof.json()).accepted, false, "Omitting the new-flow label cannot bypass basket validation");
  });
  it("accepts evidenced historical output but rejects changed provenance", async () => {
    const rollback = new Error("historical fixture rollback");
    await assert.rejects(withDatabaseTransaction(getSql()!, async tx => {
      await tx`update public.assessments set input_revision=0,input_hash=null,status='ready',selected_plan='precision' where plan_id=${planId}::uuid`;
      const [group] = await tx`select t.organisation_id,t.task_group_id from public.tasks t
        join public.meta_conversion_events e on e.task_id=t.id where e.context_id=${owner}::uuid limit 1`;
      await tx`insert into public.tasks(id,organisation_id,task_group_id,task_type,title,status,plan_id,payload,created_at,completed_at)
        values(${randomUUID()}::uuid,${group.organisation_id}::uuid,${group.task_group_id}::uuid,'generate_supplement_guidance',
          'Historical fixture','completed',${planId}::uuid,'{"answers":{},"locale":"th","plan":"precision"}',now()-interval '2 minutes',now())`;
      await tx`insert into public.assessment_versions(plan_id,version,action,reason,snapshot)
        values(${planId}::uuid,999,'healthscore_snapshot_recorded','fixture',
          '{"projectionBefore":{"answers":{},"locale":"th"},"projectionPatch":{"healthScore":{}}}')`;
      await tx`insert into public.formulations(plan_id,version,formulation,generated_at)
        values(${planId}::uuid,2,'{"supplementBreakdown":[]}',now()-interval '1 minute')`;
      const historicalRun = randomUUID();
      await tx`insert into public.product_recommendation_runs(id,plan_id,generated_at)
        values(${historicalRun}::uuid,${planId}::uuid,now()-interval '1 minute')`;
      await tx`insert into public.product_recommendation_items(run_id,product_id,rank,price_amount,url_used)
        values(${historicalRun}::uuid,${productIds[0]}::uuid,1,100,'https://example.test/fixture')`;
      const evidence = { revision: 0, formulaVersion: 2, runId: historicalRun };
      const view = (stage: string) => validateWebProductMilestone(tx, owner, "ViewContent",
        { plan_id: planId, locale: "th", funnel_stage: stage }, evidence);
      assert.ok(await view("formula")); assert.ok(await view("products"));
      await tx`update public.assessments set answers='{"activity":"changed"}' where plan_id=${planId}::uuid`;
      assert.equal(await view("formula"), null); assert.equal(await view("products"), null);
      throw rollback;
    }), error => error === rollback);
  });
  it("rejects another context, stale revisions and withdrawal without disturbing receipts", async () => {
    assert.equal((await capture("formula", [], outsider)).accepted, false);
    assert.equal((await capture("formula", [], owner, 1, 2)).accepted, false);
    assert.equal((await capture("products", [], owner, 2)).accepted, false);
    await getSql()!`update public.assessments set input_revision=2 where plan_id=${planId}::uuid`;
    assert.equal((await capture("formula")).accepted, false);
    assert.equal((await capture("basket", [productIds[0]])).accepted, false);
    await setMetaConsent(request(owner), false);
    assert.equal((await capture("products")).accepted, false);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where context_id=${owner}::uuid`)[0].n, 4);
  });
});
