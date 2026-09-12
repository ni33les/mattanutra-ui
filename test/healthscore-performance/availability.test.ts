import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFormulationWithGrok } from '../../lib/formulation-analysis.ts';
import { formulaInput, formulaResponse } from './fixtures.ts';

test('AVAIL-WEB-01 AI may only return permitted ingredients and dependent copy is removed', async t => {
  const prior = process.env.XAI_API_KEY; process.env.XAI_API_KEY = 'offline';
  t.after(() => { if (prior === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = prior; });
  const unwanted = { ...formulaResponse.supplementBreakdown[0], id: 'psyllium', supplement: 'Psyllium', effectivenessRank: 2 };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    assert.ok(init?.signal);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...formulaResponse,
      supplementBreakdown: [...formulaResponse.supplementBreakdown, unwanted],
      cautions: [{ id: 'psyllium-warning', severity: 'info', title: 'Psyllium', body: 'Psyllium advice.', relatedAnswerKeys: [] }] }) } }], request: body });
  });
  const result = await analyzeFormulationWithGrok(formulaInput);
  assert.equal(calls, 1); assert.equal(result.formulation.supplementBreakdown.length, 1);
  assert.equal(result.formulation.cautions.length, 0);
  assert.equal(result.formulation.supplementBreakdown[0].id, formulaResponse.supplementBreakdown[0].id);
});
test('AVAIL-WEB-02 empty permitted catalogue completes without calling AI or requiring a supplement', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Empty catalogue must not call AI'); });
  const result = await analyzeFormulationWithGrok({ ...formulaInput, canonicalSupplements: [] });
  assert.deepEqual(result.formulation.supplementBreakdown, []); assert.equal(result.attempts, 0);
});
test('AVAIL-WEB-03 a valid empty AI answer is terminal with no forced replacement', async t => {
  const prior = process.env.XAI_API_KEY; process.env.XAI_API_KEY = 'offline';
  t.after(() => { if (prior === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = prior; });
  let calls=0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ ...formulaResponse, supplementBreakdown: [] }) } }] }); });
  const result = await analyzeFormulationWithGrok(formulaInput);
  assert.equal(calls, 1); assert.deepEqual(result.formulation.supplementBreakdown, []);
});
