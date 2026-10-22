import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { cleanupFixtureRelationships, fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { captureAssessment } from "../lib/assessment-capture.ts";
import { persistAssessmentSubmission } from "../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { FUNNEL_GENERATOR_VERSION, loadGenerationInput } from "../lib/assessment-revisions.ts";
import { insertFormulationVersion } from "../lib/plan-version-writes.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { recoverFunnelWork } from "../lib/funnel-recovery.ts";
import { adoptWebProductJourney } from "../lib/web-product-journey-adoption.ts";
import { WEB_PRODUCT_JOURNEY_VERSION } from "../lib/web-product-journey.ts";
import { completeMockPayment, createStripeCheckoutSession, fulfillCheckoutSession, markPaymentCancelled } from "../lib/stripe-payments.ts";
import { fulfillWebPayment } from "../lib/web-payment-fulfillment.ts";
import { createRetailCheckoutSession } from "../lib/retail-product-checkout.ts";
import { recordWebDeliveryDetailsCompleted } from "../lib/web-checkout-tracking.ts";
import { assessmentCheckoutAttribution } from "../lib/journey-attribution.ts";
import { writeBpmEvent } from "../lib/bpm.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import { loadProductRecommendationFreshnessSnapshot } from "../lib/product-recommendation-freshness.ts";
import { assessmentProductMarket, currentWebProductMarketSql } from "../lib/web-product-market.ts";
import { buildTaskWorkItem } from "../lib/task-work-items.ts";
import { getTaskBundle } from "../lib/task-service.ts";
import { applyTaskCompletionResult } from "../lib/task-result-applier.ts";
import { GET as readFormula } from "../app/api/assessment/[planId]/formulation/route.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Free product journey tests require isolated PostgreSQL");

describe("free web product journey on PostgreSQL", { concurrency: false }, () => {
  const plans: string[] = [], payments: string[] = [], keys: string[] = [];
  const answers = { firstName: "Free Journey Fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
  const oldFlag = process.env.WEB_PRODUCT_JOURNEY_ENABLED;
  const dependencies = {
    session: async () => null,
    rate: async () => ({ currency: "THB", fallbackUsed: false, fxRateId: null, provider: "fixture", source: "fixture", usdRate: 0.03 })
  };
  function key() { const value = randomUUID(); keys.push(value); return value; }
  before(async () => {
    process.env.DB_URL = databaseUrl;
    fixtureDatabaseUrl();
    process.env.MATTANUTRA_ENV = "dev";
    process.env.STRIPE_PAYMENT_MODE = "mock";
    for (const locale of ["en", "th", "zh-CN"]) await getSql()!`insert into public.site_locales (code,label,native_label,html_lang)
      values (${locale},${locale},${locale},${locale}) on conflict (code) do nothing`;
    await getSql()!`insert into public.organisations (slug,name,organisation_type)
      values ('mattanutra','MattaNutra','platform') on conflict do nothing`;
  });
  beforeEach(() => { process.env.WEB_PRODUCT_JOURNEY_ENABLED = "1"; });
  after(async () => {
    const sql = getSql()!;
    await withDatabaseTransaction(sql, async tx => {
      await tx`set local session_replication_role = replica`;
      const tasks = await tx`select id from public.tasks where plan_id=any(${plans}::uuid[]) or payload->>'paymentId'=any(${payments})`;
      const taskIds = tasks.map(row => row.id);
      await cleanupFixtureRelationships(tx, { planIds: plans, taskIds });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.task_comments where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.funnel_requests where request_key=any(${keys}) or resource_id=any(${[...plans, ...payments]}::uuid[])`;
      for (const paymentId of payments) {
        await tx`delete from public.stripe_webhook_events where payment_id=${paymentId}::uuid`;
        await tx`delete from public.finance_transactions where source_ref=${`stripe:payment:${paymentId}:nominal-revenue`}`;
        await tx`delete from public.payment_versions where payment_id=${paymentId}::uuid`;
        await tx`delete from public.payments where id=${paymentId}::uuid`;
      }
      await tx`delete from public.retail_checkout_payment_versions where payment_id in (select id from public.retail_checkout_payments where plan_id=any(${plans}::uuid[]))`;
      await tx`delete from public.retail_checkout_payments where plan_id=any(${plans}::uuid[])`;
      await tx`delete from public.product_recommendation_items where run_id in (select id from public.product_recommendation_runs where plan_id=any(${plans}::uuid[]))`;
      for (const table of ["product_recommendation_runs", "recommendations", "formulations", "food_guidance", "nutrition_reports", "assessment_healthscore_results",
        "assessment_product_preferences", "assessment_inputs", "assessment_versions", "assessment_version_counters", "assessments"]) {
        await tx.unsafe(`delete from public.${table} where plan_id=any($1::uuid[])`, [plans]);
      }
    });
    await closeSqlPool();
    if (oldFlag === undefined) delete process.env.WEB_PRODUCT_JOURNEY_ENABLED;
    else process.env.WEB_PRODUCT_JOURNEY_ENABLED = oldFlag;
  });
  async function capture(answerOverrides: Record<string, unknown> = {}) {
    const options = { idempotencyKey: key() };
    const body = { answers: { ...answers, ...answerOverrides }, locale: "en", intent: "capture", sessionId: randomUUID() };
    const receipt = await captureAssessment(body, options); plans.push(receipt.planId);
    return { receipt, body, options };
  }
  async function legacyPlan() {
    const planId = randomUUID(); plans.push(planId);
    await persistAssessmentSubmission({ answers, locale: "en", selectedPlan: null, status: "captured",
      snapshot: createAssessmentSnapshot({ planId, healthScore: computeHealthScore(answers, "en") }) });
    return planId;
  }
  async function formula(planId: string) {
    const generation = await loadGenerationInput(getSql()!, planId, "en"); assert.ok(generation);
    await insertFormulationVersion(getSql()!, { planId, generation, modelVersion: "free-journey-fixture", formulation: {
      supplementBreakdown: [
        { id: "vitamin-d", category: "vitamin", dailyDose: { en: "1000 IU" }, effectivenessRank: 1, rationale: { en: "Fixture rationale" }, status: "add", supplement: { en: "Vitamin D" } },
        { id: "magnesium", category: "mineral", dailyDose: { en: "200 mg" }, effectivenessRank: 2, rationale: { en: "Fixture rationale" }, status: "add", supplement: { en: "Magnesium" } }
      ], sectionStatuses: { supplements: "ready", foods: "pending" }
    } });
    await getSql()!`update public.tasks set status='completed' where plan_id=${planId}::uuid and task_type='generate_supplement_guidance'`;
  }
  function response(planId: string, products = false, locale = "en") {
    return readFormula(new Request(`http://localhost/api/assessment/${planId}/formulation?locale=${locale}&products=${products ? 1 : 0}`), { params: Promise.resolve({ planId }) });
  }
  async function waitFor(predicate: () => Promise<boolean>, message: string) {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(message);
  }

  it("captures free access once without a paid plan, payment, revenue, or a purchase milestone", async () => {
    const { receipt, body, options } = await capture();
    assert.equal(receipt.journeyVersion, WEB_PRODUCT_JOURNEY_VERSION);
    assert.equal(receipt.hasFullPlanAccess, true);
    assert.equal(receipt.hasConfirmedPlanPayment, false);
    assert.equal(receipt.skipHealthScore, true);
    assert.equal(receipt.paymentId, null);
    const sql = getSql()!;
    const before = await sql`select id from public.tasks where plan_id=${receipt.planId}::uuid order by id`;
    assert.deepEqual(await captureAssessment(body, options), receipt);
    assert.deepEqual(await sql`select id from public.tasks where plan_id=${receipt.planId}::uuid order by id`, before);
    const [stored] = await sql`select selected_plan,plan_selected_at,journey_version,funnel_skip_healthscore from public.assessments where plan_id=${receipt.planId}::uuid`;
    assert.equal(stored.selected_plan, null); assert.equal(stored.plan_selected_at, null);
    assert.equal(stored.journey_version, WEB_PRODUCT_JOURNEY_VERSION); assert.equal(stored.funnel_skip_healthscore, true);
    assert.equal((await sql`select count(*)::int as n from public.payments where plan_id=${receipt.planId}::uuid`)[0].n, 0);
    assert.equal((await sql`select count(*)::int as n from public.bpm where plan_id=${receipt.planId}::uuid and event_name in ('plan_paid','payment_fulfillment_succeeded')`)[0].n, 0);
    const types = await sql`select task_type from public.tasks where plan_id=${receipt.planId}::uuid`;
    assert.ok(types.some(row => row.task_type === "generate_supplement_guidance"));
    assert.ok(types.some(row => row.task_type === "generate_product_recommendations"));
    assert.equal((await response(receipt.planId)).status, 202);
  });

  it("preserves existing free access when a saved session resolves after new enrollment is paused", async () => {
    const { receipt, body } = await capture();
    process.env.WEB_PRODUCT_JOURNEY_ENABLED = "0";
    const resumed = await captureAssessment(body, { idempotencyKey: key() });
    assert.equal(resumed.planId, receipt.planId);
    assert.equal(resumed.journeyVersion, WEB_PRODUCT_JOURNEY_VERSION);
    assert.equal(resumed.hasFullPlanAccess, true);
    assert.equal(resumed.skipHealthScore, true);
    assert.equal(resumed.hasConfirmedPlanPayment, false);
    const [stored] = await getSql()!`select selected_plan, journey_version from public.assessments where plan_id=${resumed.planId}::uuid`;
    assert.equal(stored.selected_plan, null);
    assert.equal(stored.journey_version, WEB_PRODUCT_JOURNEY_VERSION);
  });

  it("serves the complete formula before products without waiting for HealthScore", async () => {
    const { receipt } = await capture(); await formula(receipt.planId);
    const readiness = await getFunnelReadiness(receipt.planId, "en");
    assert.equal(readiness?.copyReady, false);
    assert.equal(readiness?.hasPaidPlan, false);
    assert.equal(readiness?.hasConfirmedPlanPayment, false);
    assert.equal(readiness?.formulationStatus, "ready");
    assert.equal(readiness?.status, "product_matching_pending");
    assert.equal(readiness?.readyForReveal, false, "a completed ingredient section is not evidence of completed matching");
    assert.equal(readiness?.productRunId, null);
    assert.equal(readiness?.stages.products, "active");
    for (const products of [false, true]) {
      const result = await response(receipt.planId, products);
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.access, "full");
      assert.equal(body.supplementBreakdown.length, 2);
      assert.equal(body.recommendations.length, 0);
    }
    assert.equal((await response(receipt.planId, false, "th")).status, 202);
    const edited = await captureAssessment({ answers: { ...answers, activity: "active" }, locale: "en", expectedRevision: receipt.revision },
      { planId: receipt.planId, idempotencyKey: key() });
    assert.equal(edited.revision, receipt.revision + 1);
    assert.equal((await response(receipt.planId)).status, 202, "old formula must not leak across an edited assessment");
  });

  it("adopts an old unpaid web plan on recovery without rewriting its answers or fabricating payment", async () => {
    const planId = await legacyPlan(); await formula(planId);
    const sql = getSql()!;
    const [before] = await sql`select answers,input_revision,input_hash from public.assessments where plan_id=${planId}::uuid`;
    assert.equal((await getFunnelReadiness(planId))?.hasFullPlanAccess, false);
    const recovered = await recoverFunnelWork(planId, "en");
    assert.equal(recovered?.hasFullPlanAccess, true);
    assert.equal(recovered?.hasConfirmedPlanPayment, false);
    assert.equal((await response(planId)).status, 200);
    await recoverFunnelWork(planId, "en");
    assert.deepEqual((await sql`select answers,input_revision,input_hash from public.assessments where plan_id=${planId}::uuid`)[0], before);
    assert.equal((await sql`select selected_plan from public.assessments where plan_id=${planId}::uuid`)[0].selected_plan, null);
    assert.equal((await sql`select count(*)::int as n from public.assessment_versions where plan_id=${planId}::uuid and reason='free_product_journey_adopted'`)[0].n, 1);
    assert.equal((await sql`select count(*)::int as n from public.payments where plan_id=${planId}::uuid`)[0].n, 0);
    process.env.WEB_PRODUCT_JOURNEY_ENABLED = "0";
    assert.equal((await getFunnelReadiness(planId))?.hasFullPlanAccess, true, "rollback stops enrollment but retains granted access");
    const oldFlow = await capture();
    assert.equal(oldFlow.receipt.journeyVersion, null);
    assert.equal(oldFlow.receipt.hasFullPlanAccess, false);
  });

  async function matchingRun(planId: string, status: "completed" | "partial" | "failed", preference = "balanced", ageSeconds = 0, market = "TH") {
    const id = randomUUID(), sql = getSql()!;
    await sql`insert into public.product_recommendation_runs(id,plan_id,status,assessment_revision,generation_locale,generator_version,market_region,catalogue_revision,diagnostics,generated_at)
      values(${id}::uuid,${planId}::uuid,${status},1,'en',${FUNNEL_GENERATOR_VERSION},${market},
        (select revision from public.catalogue_runtime_revision where singleton=true),
        ${sql.json({ algorithmVersion: MATCHER_VERSION, stackPreference: preference })},now()-${ageSeconds}*interval '1 second')`;
    return id;
  }

  it("recovers a saved Singapore-resident web assessment into a fresh Thailand matching task without changing health inputs", async () => {
    const { receipt } = await capture({ country: "Singapore" });
    const planId = receipt.planId, sql = getSql()!;
    await formula(planId);
    const [before] = await sql`select answers,input_revision,input_hash from public.assessments where plan_id=${planId}::uuid`;
    const oldRuns = [await matchingRun(planId, "partial", "balanced", 2, "SG"), await matchingRun(planId, "partial", "compact", 1, "SG")];
    const legacyProduct = { id: "old-residence-market-product", covers: ["Vitamin D"], description: "Legacy fixture",
      marketplace: "Imported product", name: "Legacy residence-market product", priority: 1, tag: "Fixture", url: "https://fixture.invalid/sg" };
    await sql`insert into public.recommendations(plan_id,version,assessment_revision,generation_locale,generator_version,recommendations)
      values(${planId}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json([legacyProduct])})`;
    // Reproduce a task persisted before public-web sourcing was separated from residence.
    const oldTasks = await sql`update public.tasks set status='completed',
      payload=jsonb_set(payload,'{row,countryCode}','"SG"'::jsonb)
      where plan_id=${planId}::uuid and task_type='generate_product_recommendations' returning id::text`;
    assert.equal(oldTasks.length, 1);
    const oldTask = (await getTaskBundle({ taskId: oldTasks[0].id })).task;
    assert.equal((await buildTaskWorkItem(oldTask)).taskType, "superseded_generation");
    assert.equal((await applyTaskCompletionResult({ task: oldTask, taskId: oldTask.id, resultPayload: {}, sql }) as { superseded: boolean }).superseded, true);
    const stale = await loadProductRecommendationFreshnessSnapshot(sql, { planId, algorithmVersion: MATCHER_VERSION, stackPreference: "balanced" });
    assert.equal(stale?.countryCode, "TH");
    assert.equal(stale?.reason, "missing_run");
    assert.equal(stale?.runId, null);
    const compact = await loadProductRecommendationFreshnessSnapshot(sql, { planId, algorithmVersion: MATCHER_VERSION, stackPreference: "compact" });
    assert.equal(compact?.runId, null, "an old residence-market run must not suppress recovery");
    assert.equal((await getFunnelReadiness(planId, "en"))?.readyForReveal, false);
    const body = await (await response(planId, true)).json();
    assert.equal(body.productsReady, false);
    assert.deepEqual(body.recommendations, [], "legacy recommendations cannot bypass the current public-web market");
    for (const id of oldRuns) assert.equal(JSON.stringify(body).includes(id), false);

    await recoverFunnelWork(planId, "en", true);
    const currentTasks = await sql`select id::text,payload from public.tasks where plan_id=${planId}::uuid
      and task_type='generate_product_recommendations' and payload #>> '{row,countryCode}'='TH'`;
    assert.equal(currentTasks.length, 1, "native refresh must enqueue a new task for the public shop's market");
    assert.notEqual(currentTasks[0].id, oldTask.id);
    assert.equal(currentTasks[0].payload.generation.answers.country, "Singapore");
    await recoverFunnelWork(planId, "en", true);
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id=${planId}::uuid
      and task_type='generate_product_recommendations' and payload #>> '{row,countryCode}'='TH'`)[0].n, 1,
      "repeated refresh must reuse the matching market task");
    assert.deepEqual((await sql`select answers,input_revision,input_hash from public.assessments where plan_id=${planId}::uuid`)[0], before);
    const currentRun = await matchingRun(planId, "completed");
    assert.equal((await getFunnelReadiness(planId, "en"))?.productRunId, currentRun);
    assert.equal((await (await response(planId, true)).json()).productRecommendations.runId, currentRun);
  });

  it("uses the same validated pharmacy exception in SQL and server market selection", async () => {
    const sql = getSql()!, valid = { organisationId: "6052e03e-6619-409b-8767-02806b3df016", slug: "fixture", countryCode: "SG" };
    for (const pharmacy of [undefined, null, {}, [], { ...valid, organisationId: "invalid" }, { ...valid, slug: " " }, valid]) {
      const input = { country: "Singapore", ...(pharmacy === undefined ? {} : { inStorePharmacy: pharmacy }) };
      for (const journey of [null, WEB_PRODUCT_JOURNEY_VERSION]) {
        for (const market of ["SG", null]) {
          const rows = await sql`select 1 from (values (${sql.json(input)}::jsonb,${journey}::text)) as a(answers,journey_version)
            cross join (values (${market}::text)) as r(market_region) where ${currentWebProductMarketSql(sql, "a", "r")}`;
          assert.equal(rows.length, assessmentProductMarket(input, journey) === "SG" ? 1 : 0);
        }
      }
    }
  });

  it("keeps a failed matching run recoverable instead of publishing it as completed empty results", async () => {
    const { receipt } = await capture(); await formula(receipt.planId);
    const failedRun = await matchingRun(receipt.planId, "failed");
    await getSql()!`update public.tasks set status='failed' where plan_id=${receipt.planId}::uuid and task_type='generate_product_recommendations'`;
    const readiness = await getFunnelReadiness(receipt.planId, "en");
    assert.equal(readiness?.readyForReveal, false);
    assert.equal(readiness?.failed, true);
    assert.equal(readiness?.productRunId, null);
    const result = await (await response(receipt.planId, true)).json();
    assert.equal(result.productsReady, false);
    assert.equal(JSON.stringify(result).includes(failedRun), false);
  });

  it("publishes completed zero-item matching results as a terminal no-purchase result", async () => {
    for (const status of ["completed", "partial"] as const) {
      const { receipt } = await capture(); await formula(receipt.planId);
      const runId = await matchingRun(receipt.planId, status);
      await getSql()!`update public.tasks set status='completed' where plan_id=${receipt.planId}::uuid and task_type='generate_product_recommendations'`;
      const readiness = await getFunnelReadiness(receipt.planId, "en");
      assert.equal(readiness?.readyForReveal, true);
      assert.equal(readiness?.status, "formulation_ready");
      assert.equal(readiness?.productRunId, runId);
      const result = await (await response(receipt.planId, true)).json();
      assert.equal(result.productsReady, true);
      assert.equal(result.productRecommendations.runId, runId);
      assert.equal(result.recommendations.length, 0);
    }
  });

  it("uses the same matching run in readiness and results across preferences and failed retries", async () => {
    const { receipt } = await capture(); await formula(receipt.planId);
    const balanced = await matchingRun(receipt.planId, "completed", "balanced", 20);
    const compact = await matchingRun(receipt.planId, "partial", "compact", 10);
    const failed = await matchingRun(receipt.planId, "failed", "balanced");
    const unsupported = await matchingRun(receipt.planId, "completed", "unsupported");
    const readiness = await getFunnelReadiness(receipt.planId, "en");
    const result = await (await response(receipt.planId, true)).json();
    assert.equal(readiness?.productRunId, balanced);
    assert.equal(result.productRecommendations.runId, balanced);
    assert.equal(result.productRunId, balanced);
    assert.ok(JSON.stringify(result).includes(compact), "the valid compact option remains available");
    assert.equal(JSON.stringify(result).includes(failed), false);
    assert.equal(JSON.stringify(result).includes(unsupported), false);
  });

  it("keeps retail and MCP assessments out of web adoption", async () => {
    for (const provenance of [{ inStorePharmacy: { id: randomUUID(), slug: "fixture" } }, { channel: "mcp" }, { source: "mcp" }]) {
      const planId = await legacyPlan();
      await getSql()!`update public.assessments set answers=answers || ${getSql()!.json(provenance)}::jsonb where plan_id=${planId}::uuid`;
      await adoptWebProductJourney(planId);
      assert.equal((await getSql()!`select journey_version from public.assessments where plan_id=${planId}::uuid`)[0].journey_version, null);
    }
  });

  it("retires the reveal checkout service before creating a payment", async () => {
    const planId = await legacyPlan();
    await assert.rejects(createStripeCheckoutSession({ locale: "en", planId, selectedPlan: "precision", sourceSurface: "healthscore", idempotencyKey: key() }), { code: "reveal_offer_retired", status: 410 });
    assert.equal((await getSql()!`select count(*)::int as n from public.payments where plan_id=${planId}::uuid`)[0].n, 0);
  });

  it("reports payment evidence separately from selected-plan access on recapture", async () => {
    const planId = await legacyPlan();
    const sql = getSql()!;
    await sql`update public.assessments set selected_plan='precision' where plan_id=${planId}::uuid`;
    const noPayment = await captureAssessment({ answers, locale: "en" }, { planId, idempotencyKey: key() });
    assert.equal(noPayment.hasFullPlanAccess, true);
    assert.equal(noPayment.hasConfirmedPlanPayment, false);
    const paymentId = randomUUID(); payments.push(paymentId);
    await sql`insert into public.payments (id,plan_id,selected_plan,status,amount,paid_at,stripe_mode,fulfillment_status)
      values (${paymentId}::uuid,${planId}::uuid,'precision','paid',690000000,now(),'test','complete')`;
    const paid = await captureAssessment({ answers, locale: "en" }, { planId, idempotencyKey: key() });
    assert.equal(paid.hasConfirmedPlanPayment, true, "persisted paid evidence survives a recapture with no browser payment ID");
  });

  it("freezes original acquisition into a real subset checkout and its BPM events", async () => {
    const sql = getSql()!;
    const acquisition = { ray: randomUUID(), attribution: { utmSource: "meta", utmMedium: "paid_social", utmCampaign: "fixture_products", campaignId: "123456", adId: "234567", trafficSource: "meta" } };
    const captured = await captureAssessment({ answers, locale: "en", bpm: acquisition }, { idempotencyKey: key() }); plans.push(captured.planId);
    await captureAssessment({ answers, locale: "en", bpm: { ray: randomUUID(), attribution: { utmSource: "direct", utmCampaign: "later_visit" } } }, { planId: captured.planId, idempotencyKey: key() });
    const [stored] = await sql`select acquisition_attribution from public.assessments where plan_id=${captured.planId}::uuid`;
    assert.deepEqual(stored.acquisition_attribution, acquisition);
    const items = await sql`select s.product_id::text,s.rrp_price_amount from public.retail_sellable_products s
      join public.organisations o on o.id=s.organisation_id join public.products p on p.id=s.product_id
      where o.organisation_type='tenant' and o.status='active' and o.country_code='TH' and s.status='active' and p.status='approved'
      order by s.product_id limit 2`;
    assert.equal(items.length, 2, "isolated catalogue requires two sellable references");
    const runId = randomUUID(), productIds = items.map(row => row.product_id);
    const matching = { selectedCandidateKey: "fixture-subset", options: [{ candidateKey: "fixture-subset", productIds, recommendations: [] }] };
    await sql`insert into public.product_recommendation_runs (id,plan_id,assessment_revision,generation_locale,generator_version,market_region,selection_revision,catalogue_revision,diagnostics)
      values (${runId}::uuid,${captured.planId}::uuid,${captured.revision},'en',${FUNNEL_GENERATOR_VERSION},'TH',0,
        (select revision from public.catalogue_runtime_revision where singleton=true),${sql.json({ algorithmVersion: MATCHER_VERSION, stackPreference: "balanced", matching })})`;
    for (const [rank, item] of items.entries()) await sql`insert into public.product_recommendation_items (run_id,product_id,rank,url_used,price_amount)
      values (${runId}::uuid,${item.product_id}::uuid,${rank + 1},'https://fixture.invalid/product',${item.rrp_price_amount})`;
    const input = { planId: captured.planId, locale: "en" as const, selectedItemIds: [productIds[0]], removedItemIds: [productIds[1]],
      recommendationRunId: runId, candidateKey: "fixture-subset", assessmentRevision: captured.revision, selectionRevision: 0,
      address: { addressLine1: "1 Fixture Road", addressLine2: "", city: "Bangkok", country: "TH", customerEmail: "checkout@fixture.test", customerName: "Fixture", phone: "0800000000", postalCode: "10110", province: "Bangkok", notes: "" } };
    // Address completion is a server checkout boundary, even when the browser
    // already has a cached quote and makes no availability request on submit.
    await assert.rejects(createRetailCheckoutSession({ ...input, address: { ...input.address, postalCode: "" } }));
    await assert.rejects(createRetailCheckoutSession({ ...input, billingSameAsShipping: false,
      billingAddress: { ...input.address, addressLine1: "" } }));
    await assert.rejects(createRetailCheckoutSession({ ...input, selectedItemIds: [randomUUID()] }));
    assert.equal((await sql`select count(*)::int as n from public.bpm where plan_id=${captured.planId}::uuid and event_name='web_delivery_details_completed'`)[0].n, 0);
    const checkout = await createRetailCheckoutSession(input);
    assert.equal((await createRetailCheckoutSession(input)).paymentId, checkout.paymentId);
    await Promise.all([recordWebDeliveryDetailsCompleted(sql, checkout.paymentId), recordWebDeliveryDetailsCompleted(sql, checkout.paymentId)]);
    const completionEvents = await sql`select id,ray,utm_campaign,properties from public.bpm
      where event_name='web_delivery_details_completed' and properties->>'checkoutPaymentId'=${checkout.paymentId}`;
    assert.equal(completionEvents.length, 1, "the cached/retried payment has one durable delivery completion");
    assert.equal(completionEvents[0].ray, acquisition.ray);
    assert.equal(completionEvents[0].utm_campaign, acquisition.attribution.utmCampaign);
    assert.deepEqual(completionEvents[0].properties, { journeyVersion: WEB_PRODUCT_JOURNEY_VERSION, channel: "web",
      stripeMode: "mock", internal_test: false, checkoutPaymentId: checkout.paymentId, lineCount: 1 });
    const [payment] = await sql`select selected_item_ids,removed_item_ids,quote_lines,metadata from public.retail_checkout_payments where id=${checkout.paymentId}::uuid`;
    assert.deepEqual(payment.selected_item_ids, [productIds[0]]);
    assert.deepEqual(payment.removed_item_ids, [productIds[1]]);
    assert.equal(payment.quote_lines.length, 1);
    assert.deepEqual(payment.metadata.acquisitionAttribution, acquisition);
    assert.equal(payment.metadata.journeyVersion, WEB_PRODUCT_JOURNEY_VERSION);
    assert.equal(payment.metadata.webDeliveryDetailsCompletedEventId, completionEvents[0].id);
    assert.equal((await sql`select count(*)::int as n from public.retail_checkout_payments where plan_id=${captured.planId}::uuid`)[0].n, 1);
    await waitFor(async () => (await sql`select count(*)::int as n from public.bpm where event_name='retail_product_checkout_session_created' and properties->>'checkoutPaymentId'=${checkout.paymentId}`)[0].n > 0, "checkout BPM event did not persist");
    const events = await sql`select ray,utm_campaign,campaign_id,properties from public.bpm where event_name in ('retail_product_checkout_requested','retail_product_checkout_session_created') and properties->>'checkoutPaymentId'=${checkout.paymentId}`;
    assert.ok(events.length >= 2);
    for (const event of events) {
      assert.equal(event.ray, acquisition.ray);
      assert.equal(event.utm_campaign, acquisition.attribution.utmCampaign);
      assert.equal(event.campaign_id, acquisition.attribution.campaignId);
      assert.equal(event.properties.journeyVersion, WEB_PRODUCT_JOURNEY_VERSION);
      assert.equal(event.properties.stripeMode, "mock");
    }
  });

  it("recovers acquisition for older captures from the existing BPM table", async () => {
    const planId = await legacyPlan(), ray = randomUUID();
    await writeBpmEvent({ planId, ray, eventName: "assessment_captured", eventType: "funnel", attribution: { utmSource: "meta", utmCampaign: "legacy_fixture" } });
    const recovered = await assessmentCheckoutAttribution(getSql()!, planId);
    assert.equal(recovered.acquisitionAttribution?.attribution.utmCampaign, "legacy_fixture");
    assert.equal(recovered.acquisitionAttribution?.ray, ray);
    assert.equal(recovered.journeyVersion, null);
  });

  it("delivery milestones retain live/test markers and exclude MCP and legacy intents", async () => {
    const sql = getSql()!, planId = await legacyPlan();
    for (const [channel, journeyVersion, stripeMode, internalTest, expected] of [
      ["web", WEB_PRODUCT_JOURNEY_VERSION, "live", false, true],
      ["web", WEB_PRODUCT_JOURNEY_VERSION, "test", false, true],
      ["web", WEB_PRODUCT_JOURNEY_VERSION, "mock", false, true],
      ["web", WEB_PRODUCT_JOURNEY_VERSION, "live", true, true],
      ["mcp", WEB_PRODUCT_JOURNEY_VERSION, "live", false, false],
      ["web", null, "live", false, false]
    ] as const) {
      const paymentId = randomUUID();
      await sql`insert into public.retail_checkout_payments (id,plan_id,amount,currency,stripe_mode,idempotency_key,selected_item_ids,metadata)
        values (${paymentId}::uuid,${planId}::uuid,100000000,'THB',${stripeMode},${randomUUID()},${[randomUUID()]}::text[],
          ${sql.json({ channel, journeyVersion, internal_test: internalTest, customerEmail: "never-in-analytics@fixture.test", address: "private fixture address" })})`;
      await Promise.all([recordWebDeliveryDetailsCompleted(sql, paymentId), recordWebDeliveryDetailsCompleted(sql, paymentId)]);
      const events = await sql`select properties from public.bpm where event_name='web_delivery_details_completed' and properties->>'checkoutPaymentId'=${paymentId}`;
      assert.equal(events.length, expected ? 1 : 0);
      if (expected) assert.deepEqual(events[0].properties, { journeyVersion, channel, stripeMode,
        internal_test: internalTest, checkoutPaymentId: paymentId, lineCount: 1 });
    }
  });

  it("fulfills an existing pre-rollout payment once and retires only its unpaid counterpart", async () => {
    const planId = await legacyPlan(), unpaidPlanId = await legacyPlan();
    process.env.WEB_PRODUCT_JOURNEY_ENABLED = "0";
    const paid = await createStripeCheckoutSession({ locale: "en", planId, selectedPlan: "precision", sourceSurface: "healthscore", idempotencyKey: key() });
    const unpaid = await createStripeCheckoutSession({ locale: "en", planId: unpaidPlanId, selectedPlan: "precision", sourceSurface: "healthscore", idempotencyKey: key() });
    payments.push(paid.paymentId, unpaid.paymentId);
    process.env.WEB_PRODUCT_JOURNEY_ENABLED = "1";
    assert.ok(await completeMockPayment({ paymentId: paid.paymentId }));
    await fulfillWebPayment(paid.paymentId, dependencies);
    await fulfillWebPayment(paid.paymentId, dependencies);
    const [payment] = await getSql()!`select status,paid_at,stripe_checkout_session_id from public.payments where id=${paid.paymentId}::uuid`;
    assert.ok(payment.paid_at);
    assert.equal((await fulfillCheckoutSession(payment.stripe_checkout_session_id, { source: "return_page" })).status, "paid_with_plan");
    assert.equal((await markPaymentCancelled({ paymentId: paid.paymentId, retirement: true }))?.status, "paid");
    assert.equal((await markPaymentCancelled({ paymentId: unpaid.paymentId, retirement: true }))?.status, "cancelled");
    assert.equal((await getSql()!`select count(*)::int as n from public.finance_transactions where source_ref=${`stripe:payment:${paid.paymentId}:nominal-revenue`}`)[0].n, 1);
    assert.equal((await getSql()!`select selected_plan from public.assessments where plan_id=${planId}::uuid`)[0].selected_plan, "precision");
    assert.equal((await getSql()!`select selected_plan from public.assessments where plan_id=${unpaidPlanId}::uuid`)[0].selected_plan, null);
    // Fulfillment schedules optional mock notifications. Wait for their terminal
    // persisted event so fixture deletion cannot race their foreign-key writes.
    await waitFor(async () => (await getSql()!`select count(*)::int as n from public.bpm where properties->>'paymentId'=${paid.paymentId}
      and event_name='payment_webhook_ignored' and properties->>'eventType'='payout.paid'`)[0].n > 0, "mock payout lifecycle did not finish");
  });
});
