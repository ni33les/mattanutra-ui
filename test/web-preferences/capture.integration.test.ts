import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { getSql, closeSqlPool } from '../../lib/db.ts';
import { captureAssessment, updateAssessmentContact } from '../../lib/assessment-capture.ts';
import { loadGenerationInput, generationTaskId } from '../../lib/assessment-revisions.ts';
import { createInitialState, fastForwardQuestionnaire } from '../../lib/questionnaire/engine.ts';
import { buildCapturePayload } from '../../lib/questionnaire/agents/capture-agent.ts';
import { productRecommendationClientContextFromPlan } from '../../lib/task-work-items.ts';
import { fixtureDatabaseUrl } from '../helpers/fixture-teardown.ts';

test('WEB-PREF-PG-01 capture, replay, legacy regeneration and agent generation preserve their distinct inputs', async t => {
  fixtureDatabaseUrl(); const sql = getSql(); assert.ok(sql); t.after(closeSqlPool);
  for (const locale of ['en', 'th', 'zh-CN'] as const) {
    for (const channel of ['web', 'agent'] as const) {
      const completed = fastForwardQuestionnaire(createInitialState({ locale, channel })); assert.equal(completed.ok, true);
      const state = { ...completed.state, answers: { ...completed.state.answers, budget: 'u1000', maxPills: '1-3', form: 'capsules' } };
      const body = { answers: buildCapturePayload(state).answers, questionnaireState: state, locale, sessionId: state.sessionId };
      const options = { idempotencyKey: randomUUID() };
      const receipt = await captureAssessment(body, options);
      assert.deepEqual(await captureAssessment(body, options), receipt);
      const [saved] = await sql`select answers, input_hash, questionnaire_state from assessments where plan_id=${receipt.planId}::uuid`;
      const original = await loadGenerationInput(sql, receipt.planId, locale); assert.ok(original);
      assert.equal(original.channel, channel);
      assert.equal(original.answers.budget, channel === 'web' ? undefined : 'u1000');
      const context = productRecommendationClientContextFromPlan(original.answers, [], [], original.channel);
      assert.equal(context.pillLimit, channel === 'web' ? null : '1-3');
      const [jobs] = await sql`select count(*)::int as n from tasks where plan_id=${receipt.planId}::uuid`;
      assert.ok(jobs.n > 0);
      if (channel === 'web') {
        await sql`update assessments set answers=answers || '{"budget":"u1000","maxPills":"1-3","form":"capsules"}'::jsonb where plan_id=${receipt.planId}::uuid`;
        const [historical] = await sql`select answers, input_hash from assessments where plan_id=${receipt.planId}::uuid`;
        const regenerated = await loadGenerationInput(sql, receipt.planId, locale); assert.ok(regenerated);
        assert.equal(regenerated.answers.budget, undefined); assert.equal(regenerated.answers.form, undefined);
        assert.equal(regenerated.inputHash, saved.input_hash, 'Publication ownership still fences the stored revision');
        assert.deepEqual((await sql`select answers, input_hash from assessments where plan_id=${receipt.planId}::uuid`)[0], historical, 'Preparation is read-only');
        assert.equal(generationTaskId('same-task', regenerated), generationTaskId('same-task', original));
        await updateAssessmentContact(receipt.planId, 'web-preferences@example.test');
        assert.deepEqual((await sql`select answers, input_hash from assessments where plan_id=${receipt.planId}::uuid`)[0], historical);
      }
      assert.deepEqual((await sql`select count(*)::int as n from tasks where plan_id=${receipt.planId}::uuid`)[0], jobs);
    }
  }
});

test('WEB-PREF-PG-02 classic capture without chat state ignores saved preferences and keeps replay stable', async t => {
  fixtureDatabaseUrl(); const sql = getSql(); assert.ok(sql); t.after(closeSqlPool);
  const body = { locale: 'en', answers: { firstName: 'Classic', age: '36-45', sex: 'male', goals: ['energy'],
    meds: 'yes', medTypes: ['statin'], budget: 'u1000', maxPills: '1-3', form: 'capsules' } };
  const options = { idempotencyKey: randomUUID() };
  const receipt = await captureAssessment(body, options);
  assert.deepEqual(await captureAssessment(body, options), receipt);
  const [row] = await sql`select answers, questionnaire_state from assessments where plan_id=${receipt.planId}::uuid`;
  assert.equal(row.questionnaire_state, null);
  for (const key of ['budget', 'maxPills', 'form']) assert.equal(row.answers[key], '');
  assert.deepEqual(row.answers.medTypes, ['statin']);
  const generation = await loadGenerationInput(sql, receipt.planId, 'en'); assert.ok(generation);
  assert.equal(generation.channel, 'web'); assert.equal(generation.answers.budget, undefined);
});
