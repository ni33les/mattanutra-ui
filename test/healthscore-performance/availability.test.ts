import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFormulationWithGrok } from '../../lib/formulation-analysis.ts';
import { formulaInput, formulaResponse } from './fixtures.ts';
import { constrainFormulation, formulationAvailabilityIdentity, publishedFormulation } from '../../lib/formulation-availability.ts';

const rankedOptions = Array.from({ length: 10 }, (_, i) => ({ ...formulaInput.canonicalSupplements[0], id: `ingredient-${i+1}`, name: `Ingredient ${i+1}`, aliases: [], normalizedName: `ingredient-${i+1}` }));
const rankedFormula = { ...formulaResponse, supplementBreakdown: rankedOptions.map((row,i) => ({ ...formulaResponse.supplementBreakdown[0], id: row.id, supplement: row.name, effectivenessRank: i+1 })).reverse(),
  marketingPoints: [{ id: 'removed-benefit', title: 'Ingredient 9', body: 'Ingredient 9 supports this goal.' }],
  cautions: [{ id: 'retained-caution', severity: 'info' as const, title: 'Ingredient 2', body: 'Ingredient 2 caution.', relatedAnswerKeys: [] },
    { id: 'removed-caution', severity: 'info' as const, title: 'Ingredient 10', body: 'Ingredient 10 caution.', relatedAnswerKeys: [] }] };

test('AVAIL-WEB-10 web publication keeps the eight highest-impact eligible ingredients and their copy', () => {
  const original = structuredClone(rankedFormula);
  const permitted = rankedOptions.filter(row => row.id !== 'ingredient-1');
  const expected = rankedOptions.slice(1,9).map(row => row.id);
  const result = constrainFormulation(rankedFormula, permitted);
  assert.deepEqual(result.supplementBreakdown.map(row => row.id), expected);
  assert.deepEqual(result.supplementBreakdown.map(row => row.effectivenessRank), [1,2,3,4,5,6,7,8]);
  assert.deepEqual(result.cautions.map(row => row.id), ['retained-caution']);
  assert.equal(result.marketingPoints.length, 1, 'Kept ingredient 9 retains its copy');
  const frozen = formulationAvailabilityIdentity('frozen-catalogue', {}, rankedOptions);
  const published = publishedFormulation(rankedFormula, { formulationAvailability: frozen }, { formulationAvailabilityIdentity: frozen.inputIdentity });
  assert.deepEqual(published.supplementBreakdown.map(row => row.id), rankedOptions.slice(0,8).map(row => row.id));
  assert.equal(published.marketingPoints.length, 0);
  assert.deepEqual(rankedFormula, original, 'Never rewrite a historical formula');
  assert.deepEqual(constrainFormulation(formulaResponse, formulaInput.canonicalSupplements), formulaResponse, 'Never pad a smaller formula');
});

test('AVAIL-WEB-11 provider prompt/schema and generated result enforce the web top-eight rule without retrying', async t => {
  const prior = process.env.XAI_API_KEY; process.env.XAI_API_KEY = 'offline';
  t.after(() => { if (prior === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = prior; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++; const request = JSON.parse(String(init?.body));
    assert.equal(request.response_format.json_schema.schema.properties.supplementBreakdown.maxItems, 8);
    const instructions = JSON.parse(request.messages[1].content).instructions.join(' ');
    assert.match(instructions, /at most 8/);
    assert.doesNotMatch(instructions, /6 to 12|top 12|fewer or more/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...rankedFormula, marketingPoints: formulaResponse.marketingPoints }) } }] });
  });
  const result = await analyzeFormulationWithGrok({ ...formulaInput, canonicalSupplements: rankedOptions });
  assert.equal(calls, 1);
  assert.deepEqual(result.formulation.supplementBreakdown.map(row => row.id), rankedOptions.slice(0,8).map(row => row.id));
});

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
