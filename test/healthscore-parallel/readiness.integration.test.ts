import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomUUID } from 'node:crypto';
import { getSql, closeSqlPool } from '../../lib/db.ts';
import { captureAssessment, retryAssessmentHealthScore } from '../../lib/assessment-capture.ts';
import { getFunnelReadiness } from '../../lib/funnel-readiness.ts';
import { getHealthScoreCopySnapshot } from '../../lib/nutrition-journey-read.ts';
import { FUNNEL_GENERATOR_VERSION, getRevisionHealthScore } from '../../lib/assessment-revisions.ts';
import { completeHealthScoreFixture } from '../fixtures/healthscore.ts';
assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required');
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);
after(closeSqlPool);
const previousJourneyFlag = process.env.WEB_PRODUCT_JOURNEY_ENABLED;
// These readiness regressions exercise the historical HealthScore-first journey.
before(() => { process.env.WEB_PRODUCT_JOURNEY_ENABLED = '0'; });
after(() => {
  if (previousJourneyFlag === undefined) delete process.env.WEB_PRODUCT_JOURNEY_ENABLED;
  else process.env.WEB_PRODUCT_JOURNEY_ENABLED = previousJourneyFlag;
});
const sql = getSql()!;
const answers = { firstName: 'Parallel Fixture', age: '36-45', sex: 'male', goals: ['energy'] };

test('HS-PAR-PG-01 advice opens HealthScore before formula; paid reveal still waits for formula and products', async () => {
  const receipt = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en', intent: 'capture' }, { idempotencyKey: randomUUID() });
  const id = receipt.planId;
  const tasks = await sql`select id,task_type,payload->>'dependsOnTaskId' as depends_on_task_id,status from tasks where plan_id=${id}::uuid`;
  const copy = tasks.find(t => t.task_type === 'analyze_healthscore'), formula = tasks.find(t => t.task_type === 'generate_supplement_guidance'), product = tasks.find(t => t.task_type === 'generate_product_recommendations');
  assert.ok(copy && formula && product); assert.equal(copy.depends_on_task_id, null); assert.equal(formula.depends_on_task_id, null); assert.equal(product.depends_on_task_id, formula.id);
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  const read = () => getFunnelReadiness(id, 'en');
  const adviceOnly = await read();
  assert.equal(adviceOnly?.readyForHealthScore, true);
  assert.equal(adviceOnly?.healthScorePageFailed, false);
  assert.equal(adviceOnly?.preparedNutrientCount, null);
  assert.equal(adviceOnly?.preparedFormulaFailed, false);
  assert.equal(adviceOnly?.readyForReveal, false);
  const copySnapshot = await getHealthScoreCopySnapshot(id, 'en');
  assert.equal(copySnapshot?.readyForHealthScore, true);
  assert.equal(copySnapshot?.preparedNutrientCount, null);
  assert.equal(copySnapshot?.preparedFormulaFailed, false);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation) values(${id}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"target"}]}')`;
  assert.equal((await read())?.readyForHealthScore, true);
  assert.equal((await read())?.preparedNutrientCount, 1);
  assert.notEqual((await read())?.resultVersion, adviceOnly?.resultVersion);
  assert.equal((await read())?.readyForReveal, false);
  await sql`update assessments set selected_plan='precision' where plan_id=${id}::uuid`;
  assert.equal((await read())?.readyForReveal, false);
  await sql`update tasks set status='failed' where plan_id=${id}::uuid and task_type='generate_product_recommendations'`;
  const failedProducts = await read();
  assert.equal(failedProducts?.readyForHealthScore, true);
  assert.equal(failedProducts?.healthScorePageFailed, false);
  assert.equal(failedProducts?.readyForReveal, false);
  assert.equal(failedProducts?.failed, true);
  await sql`update tasks set status='queued' where plan_id=${id}::uuid and task_type='generate_product_recommendations'`;
  await sql`insert into product_recommendation_runs(plan_id,assessment_revision,generation_locale,generator_version,catalogue_revision) values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},(select revision from catalogue_runtime_revision where singleton=true))`;
  const ready = await read(); assert.equal(ready?.readyForHealthScore, true); assert.equal(ready?.readyForReveal, true);
  assert.equal((await getFunnelReadiness(id, 'th'))?.readyForHealthScore, false);
  assert.equal((await getFunnelReadiness(id, 'th'))?.preparedNutrientCount, null);
  await sql`update assessments set input_revision=2 where plan_id=${id}::uuid`;
  assert.equal((await read())?.readyForHealthScore, false);
  assert.equal((await read())?.preparedNutrientCount, null);
});

test('HS-PAR-PG-04 product and terminal formula failures cannot fail valid HealthScore advice', async () => {
  const { planId } = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid and task_type='generate_product_recommendations'`;
  const waiting = await getFunnelReadiness(planId, 'en');
  assert.equal(waiting?.readyForHealthScore, true);
  assert.equal(waiting?.healthScorePageFailed, false);
  assert.equal(waiting?.preparedFormulaFailed, false);
  for (const terminal of ['failed', 'cancelled', 'completed']) {
    await sql`update tasks set status=${terminal} where plan_id=${planId}::uuid and task_type='generate_supplement_guidance'`;
    const state = await getFunnelReadiness(planId, 'en');
    assert.equal(state?.readyForHealthScore, true, terminal);
    assert.equal(state?.healthScorePageFailed, false, terminal);
    assert.equal(state?.preparedFormulaFailed, true, terminal);
    assert.equal(state?.preparedNutrientCount, null, terminal);
    assert.equal(state?.readyForReveal, false, terminal);
  }
});

test('HS-PAR-PG-02 analysis retry also repairs failed formulation for the saved assessment without recapture', async () => {
  const receipt = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en', intent: 'capture' }, { idempotencyKey: randomUUID() });
  const id = receipt.planId;
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`update tasks set status='failed' where plan_id=${id}::uuid and task_type='generate_supplement_guidance'`;
  assert.equal((await getFunnelReadiness(id, 'en'))?.preparedFormulaFailed, true);
  assert.equal((await getFunnelReadiness(id, 'en'))?.readyForHealthScore, true);
  const before = await sql`select answers,input_revision from assessments where plan_id=${id}::uuid`;
  await retryAssessmentHealthScore(id, 'en');
  assert.ok((await sql`select id from tasks where plan_id=${id}::uuid and task_type='generate_supplement_guidance' and status in ('queued','reserved','running')`).length > 0);
  assert.deepEqual(await sql`select answers,input_revision from assessments where plan_id=${id}::uuid`, before);
  assert.equal((await getFunnelReadiness(id, 'en'))?.preparedFormulaFailed, false);
});

test('HS-PAR-PG-05 formula alone cannot release missing or failed advice; copy readiness is locale-specific', async () => {
  const { planId } = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"target"}]}')`;
  const pending = await getFunnelReadiness(planId, 'en');
  assert.equal(pending?.readyForHealthScore, false);
  assert.equal(pending?.healthScorePageFailed, false);
  assert.equal(pending?.preparedNutrientCount, 1);
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid and task_type='analyze_healthscore'`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.healthScorePageFailed, true);
  for (const locale of ['en', 'th', 'zh-CN'] as const) {
    await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
      values(${planId}::uuid,1,${locale},${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture(locale))})`;
    const ready = await getFunnelReadiness(planId, locale);
    assert.equal(ready?.readyForHealthScore, true, locale);
    assert.equal(ready?.healthScorePageFailed, false, locale);
    assert.equal(ready?.preparedNutrientCount, locale === 'en' ? 1 : null, locale);
  }
});

test('HS-PAR-PG-06 shortlist excludes examples and hidden nutrients, and accepts a real zero-count result', async () => {
  const { planId } = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
    values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,model_version,formulation)
    values(${planId}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'fixture:example','{"supplementBreakdown":[{"id":"example"}]}')`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.preparedNutrientCount, null);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,2,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"hidden","safety":{"visibility":"hidden"}},{"id":"visible"}]}')`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.preparedNutrientCount, 1);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,3,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[]}')`;
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid and task_type='generate_supplement_guidance'`;
  const zero = await getHealthScoreCopySnapshot(planId, 'en');
  assert.equal(zero?.preparedNutrientCount, 0);
  assert.equal(zero?.preparedFormulaFailed, false, 'available current output wins over a terminal task');
  assert.equal(zero?.readyForHealthScore, true);
});

test('HS-PAR-PG-07 stale revisions and generator versions cannot supply copy, counts or failures', async () => {
  const { planId } = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
    values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"old"}]}')`;
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid`;
  await sql`update assessments set input_revision=2 where plan_id=${planId}::uuid`;
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
    values(${planId}::uuid,2,'en','obsolete-generator',${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,2,2,'en','obsolete-generator','{"supplementBreakdown":[{"id":"wrong-generator"}]}')`;
  const current = await getFunnelReadiness(planId, 'en');
  assert.equal(current?.revision, 2);
  assert.equal(current?.readyForHealthScore, false);
  assert.equal(current?.healthScorePageFailed, false);
  assert.equal(current?.preparedNutrientCount, null);
  assert.equal(current?.preparedFormulaFailed, false);
  assert.equal(current?.readyForReveal, false);
});

test('HS-PAR-PG-08 pharmacy skips advice but still waits for its current formula and product match', async () => {
  const { planId } = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`update assessments set funnel_skip_healthscore=true,selected_plan='precision' where plan_id=${planId}::uuid`;
  const pharmacy = await getFunnelReadiness(planId, 'en');
  assert.equal(pharmacy?.skipHealthScore, true);
  assert.equal(pharmacy?.copyReady, false, 'Skipping HealthScore does not fabricate a completed copy result');
  assert.equal(pharmacy?.readyForReveal, false);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation)
    values(${planId}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"target"}]}')`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.readyForReveal, false);
  await sql`insert into product_recommendation_runs(plan_id,assessment_revision,generation_locale,generator_version,catalogue_revision)
    values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},(select revision from catalogue_runtime_revision where singleton=true))`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.readyForReveal, true);
  assert.equal((await getFunnelReadiness(planId, 'th'))?.readyForReveal, false);
});

test('HS-PAR-PG-09 an earlier page snapshot cannot combine its answers with newer revision advice', async () => {
  const first = await captureAssessment({ contactEmail: "capture@fixture.test", answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  const original = completeHealthScoreFixture('en');
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
    values(${first.planId}::uuid,${first.revision},'en',${FUNNEL_GENERATOR_VERSION},${sql.json(original)})`;
  assert.deepEqual(await getRevisionHealthScore(first.planId, 'en', first.revision), original);

  // A recapture commits after the page read its answers but before its advice query.
  const second = await captureAssessment({ contactEmail: "capture@fixture.test", answers: { ...answers, activity: 'active' }, locale: 'en', expectedRevision: first.revision },
    { planId: first.planId, idempotencyKey: randomUUID() });
  assert.equal(second.revision, first.revision + 1);
  const revised = { ...original, pageContent: { ...original.pageContent,
    aiCopy: { ...original.pageContent.aiCopy, heroTitle: { en: 'Advice from revised answers' } } } };
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result)
    values(${first.planId}::uuid,${second.revision},'en',${FUNNEL_GENERATOR_VERSION},${sql.json(revised)})`;
  assert.equal(await getRevisionHealthScore(first.planId, 'en', first.revision), null);
  assert.deepEqual(await getRevisionHealthScore(first.planId, 'en', second.revision), revised);
  assert.deepEqual(await getRevisionHealthScore(first.planId, 'en'), revised, 'existing callers still read current advice');
  assert.equal(await getRevisionHealthScore(first.planId, 'th', second.revision), null);
});

test('HS-PAR-PG-03 different submitted lifestyle answers produce distinct stored scores, not a reused 38', async () => {
  const { createInitialState, fastForwardQuestionnaire } = await import('../../lib/questionnaire/engine.ts');
  const { toAssessmentAnswers } = await import('../../lib/questionnaire/normalize.ts');
  const filled = fastForwardQuestionnaire(createInitialState({ locale: 'en', channel: 'web' })); assert.ok(filled.ok);
  const original = toAssessmentAnswers(filled.state.answers);
  const changed = { ...original, sleepHrs: '7-8', energy: 'good', activity: 'active' };
  const first = await captureAssessment({ contactEmail: "capture@fixture.test", answers: original, locale: 'en' }, { idempotencyKey: randomUUID() });
  const second = await captureAssessment({ contactEmail: "capture@fixture.test", answers: changed, locale: 'en' }, { idempotencyKey: randomUUID() });
  const rows = await sql`select plan_id,(health_score->>'score')::int as score from assessments where plan_id=any(${[first.planId, second.planId]}::uuid[])`;
  assert.equal(rows.find(r => r.plan_id === first.planId)?.score, 38);
  assert.equal(rows.find(r => r.plan_id === second.planId)?.score, 66);
  assert.notEqual(first.inputHash, second.inputHash);
});
