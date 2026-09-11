import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { getSql, closeSqlPool } from '../../lib/db.ts';
import { captureAssessment, retryAssessmentHealthScore } from '../../lib/assessment-capture.ts';
import { getFunnelReadiness } from '../../lib/funnel-readiness.ts';
import { FUNNEL_GENERATOR_VERSION } from '../../lib/assessment-revisions.ts';
import { completeHealthScoreFixture } from '../fixtures/healthscore.ts';
assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required');
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);
after(closeSqlPool);
const sql = getSql()!;
const answers = { firstName: 'Parallel Fixture', age: '36-45', sex: 'male', goals: ['energy'] };

test('HS-PAR-PG-01 HealthScore waits for advice and formula only; reveal also waits for product matching', async () => {
  const receipt = await captureAssessment({ answers, locale: 'en', intent: 'capture' }, { idempotencyKey: randomUUID() });
  const id = receipt.planId;
  const tasks = await sql`select id,task_type,payload->>'dependsOnTaskId' as depends_on_task_id,status from tasks where plan_id=${id}::uuid`;
  const copy = tasks.find(t => t.task_type === 'analyze_healthscore'), formula = tasks.find(t => t.task_type === 'generate_supplement_guidance'), product = tasks.find(t => t.task_type === 'generate_product_recommendations');
  assert.ok(copy && formula && product); assert.equal(copy.depends_on_task_id, null); assert.equal(formula.depends_on_task_id, null); assert.equal(product.depends_on_task_id, formula.id);
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  const read = () => getFunnelReadiness(id, 'en');
  assert.equal((await read())?.readyForHealthScore, false);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation) values(${id}::uuid,1,1,'en',${FUNNEL_GENERATOR_VERSION},'{"supplementBreakdown":[{"id":"target"}]}')`;
  assert.equal((await read())?.readyForHealthScore, true);
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
  await sql`update assessments set input_revision=2 where plan_id=${id}::uuid`;
  assert.equal((await read())?.readyForHealthScore, false);
});

test('HS-PAR-PG-04 product failure cannot fail HealthScore while its formula is still running', async () => {
  const { planId } = await captureAssessment({ answers, locale: 'en' }, { idempotencyKey: randomUUID() });
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid and task_type='generate_product_recommendations'`;
  const waiting = await getFunnelReadiness(planId, 'en');
  assert.equal(waiting?.readyForHealthScore, false);
  assert.equal(waiting?.healthScorePageFailed, false);
  await sql`update tasks set status='failed' where plan_id=${planId}::uuid and task_type='generate_supplement_guidance'`;
  assert.equal((await getFunnelReadiness(planId, 'en'))?.healthScorePageFailed, true);
});

test('HS-PAR-PG-02 analysis retry also repairs failed formulation for the saved assessment without recapture', async () => {
  const receipt = await captureAssessment({ answers, locale: 'en', intent: 'capture' }, { idempotencyKey: randomUUID() });
  const id = receipt.planId;
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture('en'))})`;
  await sql`update tasks set status='failed' where plan_id=${id}::uuid and task_type='generate_supplement_guidance'`;
  const before = await sql`select answers,input_revision from assessments where plan_id=${id}::uuid`;
  await retryAssessmentHealthScore(id, 'en');
  assert.ok((await sql`select id from tasks where plan_id=${id}::uuid and task_type='generate_supplement_guidance' and status in ('queued','reserved','running')`).length > 0);
  assert.deepEqual(await sql`select answers,input_revision from assessments where plan_id=${id}::uuid`, before);
});

test('HS-PAR-PG-03 different submitted lifestyle answers produce distinct stored scores, not a reused 38', async () => {
  const { createInitialState, fastForwardQuestionnaire } = await import('../../lib/questionnaire/engine.ts');
  const { toAssessmentAnswers } = await import('../../lib/questionnaire/normalize.ts');
  const filled = fastForwardQuestionnaire(createInitialState({ locale: 'en', channel: 'web' })); assert.ok(filled.ok);
  const original = toAssessmentAnswers(filled.state.answers);
  const changed = { ...original, sleepHrs: '7-8', energy: 'good', activity: 'active' };
  const first = await captureAssessment({ answers: original, locale: 'en' }, { idempotencyKey: randomUUID() });
  const second = await captureAssessment({ answers: changed, locale: 'en' }, { idempotencyKey: randomUUID() });
  const rows = await sql`select plan_id,(health_score->>'score')::int as score from assessments where plan_id=any(${[first.planId, second.planId]}::uuid[])`;
  assert.equal(rows.find(r => r.plan_id === first.planId)?.score, 38);
  assert.equal(rows.find(r => r.plan_id === second.planId)?.score, 66);
  assert.notEqual(first.inputHash, second.inputHash);
});
