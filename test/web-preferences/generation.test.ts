import assert from 'node:assert/strict';
import test from 'node:test';
import { productRecommendationClientContextFromPlan } from '../../lib/task-work-items.ts';
import { analyzeFormulationWithGrok } from '../../lib/formulation-analysis.ts';
import { formulaInput, formulaResponse } from '../healthscore-performance/fixtures.ts';
import { validateCaptureAnswers } from '../../lib/assessment-capture.ts';
import { assessmentInputHash } from '../../lib/assessment-revisions.ts';
import { captureInputProvenance } from '../../lib/assessment-input-provenance.ts';
const old = { budget: 'u1000', maxPills: '1-3', form: 'capsules', meds: 'yes', medTypes: ['statin'], allergies: ['shellfish'] };
test('WEB-PREF-06 capture removes hidden values and provenance before computing effective identity', () => {
  const a = validateCaptureAnswers({ ...old, inputProvenance: captureInputProvenance(old) });
  const remaining = { meds: 'yes', medTypes: ['statin'], allergies: ['shellfish'] };
  const b = validateCaptureAnswers({ ...remaining, inputProvenance: captureInputProvenance(remaining) });
  assert.equal(a.budget, ''); assert.equal(a.maxPills, ''); assert.equal(a.form, '');
  assert.equal(assessmentInputHash(a), assessmentInputHash(b)); assert.deepEqual(a.medTypes, ['statin']);
});
test('WEB-PREF-07 web matcher context has no purchase limits but retains health context', () => {
  const context = productRecommendationClientContextFromPlan(old, [], []);
  assert.equal(context.budgetPreference, null); assert.equal(context.pillLimit, null); assert.equal(context.preferredForm, null);
  assert.deepEqual(context.medicationTypes, ['statin']); assert.deepEqual(context.foodAllergies, ['shellfish']);
});
test('WEB-PREF-08 provider prompt contains no direct or duplicated hidden preference values', async t => {
  const before = process.env.XAI_API_KEY; process.env.XAI_API_KEY = 'offline';
  t.after(() => { if (before === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = before; });
  let context: Record<string, Record<string, unknown>> | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); context = JSON.parse(body.messages[2].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(formulaResponse) } }] });
  });
  await analyzeFormulationWithGrok({ ...formulaInput, answers: { ...old, inputProvenance: captureInputProvenance(old) } });
  assert.ok(context); assert.deepEqual(context.assessment.medTypes, ['statin']);
  for (const row of [context.assessment, context.assessmentSafetyContext]) for (const key of ['budget', 'maxPills', 'form', 'pillCount', 'formPreference']) assert.equal(row[key], undefined, key);
  assert.doesNotMatch(JSON.stringify(context), /u1000|1-3|capsules/);
});
