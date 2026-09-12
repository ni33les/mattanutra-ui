import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { PlanResult } from '../../lib/agentic/plan/types.ts';
import { frozen, install, cleanup, runtime, plan } from '../mcp-evidence-images/helpers.ts';
const fixtures = JSON.parse(readFileSync(new URL('./refinement-fixture.json', import.meta.url), 'utf8')).rows as Record<string, PlanResult>;
beforeEach(install); afterEach(cleanup);
const decision = (name: string, locale = 'en') => {
  const result = structuredClone(fixtures[name]); result.requestSnapshot.locale = locale as 'en';
  const value = presentDecision(result, 'cap_summary_fixture', 1); assert.ok('choices' in value); return value;
};
test('REF-SUM-01 Daniel ready summary states exact first-order budget deviation without blocking purchase', () => {
  const value = decision('daniel-create'); assert.equal(value.choices[0].summary.goodsPrice, 2594);
  assert.match(value.summary, /2,?594/); assert.match(value.summary, /2,?000/); assert.match(value.summary, /594/); assert.match(value.summary, /29\.7%/);
  assert.match(value.summary, /goods|delivery/i); assert.equal(value.status, 'ready'); assert.equal(value.nextAction, 'execute');
});
test('REF-SUM-02 Maya summary distinguishes missing product contributions from unknown existing intake', () => {
  const value = decision('maya-create'); assert.match(value.summary, /B12/); assert.match(value.summary, /Omega-3/);
  assert.match(value.summary, /D3/); assert.match(value.summary, /unknown/i); assert.doesNotMatch(value.summary, /deficien|cleared|approved/i);
  assert.equal(value.choices[0].ingredients.find(row => row.name === 'Vitamin B12')!.existing, null);
});
test('REF-SUM-03 completed refinement persists its price, product and dose comparison for later reads', async () => {
  const app = runtime(), before = fixtures['daniel-create'], after = fixtures['daniel-refine'];
  const requirements = (result: PlanResult) => ({ ...result.requestSnapshot.requirements,
    productDoses: result.selected!.basket.map(row => ({ productId: row.productId, servingsPerDay: row.servingsPerDay })),
    excludeProductIds: [...new Set(frozen.snapshot.products.map(row => row.productId))].filter(id => !result.selected!.basket.some(row => row.productId === id)) });
  const first = await plan(app, { locale: 'en', destinationCountry: 'TH', idempotencyKey: 'summary-daniel-create',
    targets: before.requestSnapshot.originalRequest!.targets.map(({ name, amount, unit, basis }) => ({ name, amount, unit, basis })), requirements: requirements(before) });
  assert.equal(first.choices[0].summary.goodsPrice, 2594, 'Original captured prices are a prerequisite');
  const refined = await plan(app, { planHandle: first.planHandle, expectedRevision: first.revision, idempotencyKey: 'summary-daniel-refine', requirements: requirements(after) });
  assert.equal(refined.choices[0].summary.goodsPrice, 2126);
  assert.match(refined.summary, /6\.3%/);
  const comparison = refined.choices[0].summary.text;
  assert.match(comparison, /468/); assert.match(comparison, /1 fewer product|one fewer product/i);
  assert.match(comparison, /202\.5.*150.*mg/);
  assert.deepEqual(await plan(app, { planHandle: first.planHandle }), refined, 'Reads reuse the saved comparison');
});
test('REF-SUM-04 zero budget stays finite and absent budget produces no invented preference', () => {
  const result = structuredClone(fixtures['daniel-create']); result.requestSnapshot.requirements.maxPriceMinor = 0;
  let value = presentDecision(result, 'cap_zero_budget', 1); assert.match(value.summary, /budget/i); assert.doesNotMatch(value.summary, /Infinity|NaN/);
  delete result.requestSnapshot.requirements.maxPriceMinor;
  value = presentDecision(result, 'cap_no_budget', 1); assert.doesNotMatch(value.summary, /over budget|budget of/i);
});
for (const locale of ['en', 'th', 'zh-CN']) test(`REF-SUM-05 ${locale} summaries stay concise and preserve numeric trade-offs`, () => {
  const value = decision('daniel-create', locale); assert.ok(value.summary.length <= 600); assert.match(value.summary, /29\.7%/);
  if (locale === 'th') assert.match(value.summary, /[\u0e00-\u0e7f]/);
  if (locale === 'zh-CN') assert.match(value.summary, /[\u4e00-\u9fff]/);
  assert.ok(value.choices[0].summary.text.length <= 600);
});
