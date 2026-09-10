import assert from 'node:assert/strict';
import test from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { catalog, product, request } from '../matcher/flexible-v5-fixtures.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';

type Item = { id: string; dose: number; units: number; price: number; quantities: number[] };
// Independent finite enumeration: no production candidate, loss, priority or selection helpers.
function oracle(items: Item[], preferred: number, importance: 'normal' | 'strong', objective: 'balanced' | 'lowest_cost') {
  const size = items.reduce((n, item) => n * item.quantities.length, 1);
  if (!items.length || !Number.isSafeInteger(size) || size > 65536) throw new Error('Explicit oracle enumeration bound exceeded');
  const baskets: { amounts: number[]; dose: number; pills: number; price: number; score: number; overrun: number }[] = [];
  const visit = (amounts: number[]) => {
    if (amounts.length < items.length) { for (const q of items[amounts.length].quantities) visit([...amounts, q]); return; }
    const dose = items.reduce((n, item, i) => n + amounts[i] * item.dose, 0);
    const pills = items.reduce((n, item, i) => n + amounts[i] * item.units, 0);
    const price = items.reduce((n, item, i) => n + (amounts[i] > 0 ? item.price : 0), 0);
    const count = amounts.filter(n => n > 0).length;
    const servingPenalty = amounts.reduce((n, q) => n + Math.max(0, q - 1) ** 2, 0) / 20;
    const overrun = Math.max(0, pills - preferred) / (preferred || 1);
    const score = Math.abs(dose - 100) / 100 + (importance === 'strong' ? 1 : 1 / 4) * overrun ** 2 + pills / 60 + count / 20 + price / (objective === 'lowest_cost' ? 500000 : 2000000) + servingPenalty;
    baskets.push({ amounts, dose, pills, price, score, overrun });
  };
  visit([]); return baskets.sort((a, b) => a.score - b.score || Math.abs(a.dose - 100) - Math.abs(b.dose - 100) || a.pills - b.pills || a.price - b.price);
}

test('PRACTICAL-ORACLE-01 independent finite arithmetic agrees on a supported interior optimum', () => {
  const items = [{ id: 'interior', dose: 125, units: 10, price: 10000, quantities: Array.from({ length: 11 }, (_, i) => i / 10) }];
  const expected = oracle(items, 5, 'strong', 'balanced')[0]; assert.deepEqual(expected.amounts, [0.6]);
  const row = items[0], p = product(row.id, { a: row.dose }, row.price, { dailyPillsPerServing: row.units, pillCountKnown: true,
    administration: { route: 'oral', physicalUnit: 'tablet', unitsPerServing: row.units, doseIncrement: 1, packQuantity: 60,
      provenance: { status: 'verified', sourceUrl: 'https://example.test/independent-label', sourceText: 'Independent fixture: ten tablets per labelled serving.', verifiedAt: '2026-09-10' } } });
  const input = request({ maxDailyPills: 5, preferenceImportance: { maxDailyPills: 'strong' },
    targets: canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', basis: 'supplemental' }] }).targets });
  const result = match(input, catalog([p])); assert.ok(result.selected?.overallScore);
  assert.deepEqual(result.selected.variantDoses?.map(row => row.dailyUnits), expected.amounts);
  assert.ok(Math.abs(result.selected.overallScore.overallPenalty - expected.score) < 1e-12);
});

test('PRACTICAL-ORACLE-02 stronger importance cannot increase overrun in an unchanged exhaustive pool', () => {
  const items = [{ id: 'one', dose: 125, units: 10, price: 10000, quantities: Array.from({ length: 21 }, (_, i) => i / 10) },
    { id: 'two', dose: 50, units: 1, price: 15000, quantities: [0, 1, 2, 3] }];
  for (const objective of ['balanced', 'lowest_cost'] as const) {
    const normal = oracle(items, 5, 'normal', objective), strong = oracle(items, 5, 'strong', objective);
    assert.equal(normal.length, 84); assert.equal(strong.length, 84); assert.ok(strong[0].overrun <= normal[0].overrun);
  }
});

test('PRACTICAL-ORACLE-03 oversized and empty fixtures fail instead of silently truncating', () => {
  assert.throws(() => oracle([], 3, 'normal', 'balanced'), /bound/);
  assert.throws(() => oracle(Array.from({ length: 17 }, (_, i) => ({ id: String(i), dose: 10, units: 1, price: 1000, quantities: [0, 1] })), 3, 'normal', 'balanced'), /bound/);
});

test('PRACTICAL-ORACLE-04 monthly pack discontinuities retain the independent useful optimum', () => {
  const price = 30000, budget = 30000, dose = 40, pack = 7;
  const pool = Array.from({ length: 101 }, (_, ticks) => {
    const q = ticks / 10, monthly = ticks ? Math.ceil(30 * ticks / (10 * pack)) * price : 0;
    return { q, score: Math.abs(q * dose - 100) / 100 + (ticks ? 0.05 + price / 2000000 : 0) + Math.max(0, q - 1) ** 2 / 20 + (Math.max(0, monthly - budget) / budget) ** 2 };
  }).sort((a, b) => a.score - b.score);
  assert.equal(pool.length, 101); assert.equal(pool[0].q, 0.2);
  const powder = product('monthly', { a: dose }, price, { dailyPillsPerServing: 0, pillCountKnown: true,
    administration: { route: 'oral', physicalUnit: 'g', unitsPerServing: 1, doseIncrement: 0.1, packQuantity: pack,
      provenance: { status: 'verified', sourceUrl: 'https://example.test/independent-powder', sourceText: 'Controlled powder: 1g labelled serving; 0.1g measure; 7g pack.', verifiedAt: '2026-09-10' } } });
  const result = match(request({ maxPriceMinor: budget, pricePreferenceBasis: 'monthly_30_days', preferenceImportance: { maxPriceMinor: 'strong' } }), catalog([powder]));
  assert.ok(result.selected?.overallScore); assert.equal(result.selected.variantDoses?.[0]?.dailyUnits, pool[0].q);
  assert.ok(Math.abs(result.selected.overallScore.overallPenalty - pool[0].score) < 1e-12);
  assert.equal(result.selected.overallScore.preferences.maxPriceMinor.actual, price);
});
