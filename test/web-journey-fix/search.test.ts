import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { createSearchCursor, advanceSearchCursor, archivedSearchStates } from '../../lib/matcher/search-cursor.ts';
import { compareSearchStates, seedState, tryAddVariant } from '../../lib/matcher/search.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';
import { request, product, catalog } from '../matcher/flexible-v5-fixtures.ts';

test('WEB-JOURNEY-05 a bounded repair consolidates duplicate routines and survives one-attempt checkpoints', () => {
  const targets = canonicalizeTargets({ targets: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(subjectId => ({ subjectId, name: subjectId, amount: 100, unit: 'mg' as const })) }).targets;
  const input = request({ selectorMode: 'web_single', targets });
  const administration = { route: 'oral', physicalUnit: 'capsule', unitsPerServing: 1, doseIncrement: 1, packQuantity: 60,
    provenance: { status: 'verified', sourceUrl: 'https://fixture.example/label', sourceText: 'Controlled capsule fixture', verifiedAt: '2026-09-10' } } as const;
  const shelf = catalog([product('duplicate-a', { a: 50 }, 31700, { administration }), product('duplicate-b', { a: 50 }, 30800, { administration }),
    ...['b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => product(id, { [id]: 100 }, 10000, { administration }))]);
  const groups = compileGroups(input, shelf);
  let leader = seedState(input);
  for (const group of groups) {
    const variant = group.variants.find(v => v.dailyUnits === 1);
    assert.ok(variant); const next = tryAddVariant(leader, variant, group, input); assert.ok(next); leader = next;
  }
  assert.equal(leader.count, 9);
  const cursor = createSearchCursor(groups, input, DEFAULT_MATCHER_CONFIG);
  Object.assign(cursor, { phase: 'pairs', review: [leader], unreviewed: [], expansionAttempts: 7900, exact: false });
  const run = (chunks: number) => {
    let current = structuredClone(cursor);
    while (!current.done) { const before = current.expansionAttempts; advanceSearchCursor(current, input, chunks); assert.ok(current.expansionAttempts - before <= chunks); current = structuredClone(current); }
    assert.ok(current.expansionAttempts <= 8000);
    const best = [...archivedSearchStates(current)].sort((a,b) => compareSearchStates(a,b,input))[0]; assert.ok(best);
    return { best, attempts: current.expansionAttempts };
  };
  const direct = run(100), resumed = run(1);
  assert.deepEqual(resumed, direct);
  assert.equal(direct.best.count, 8);
  assert.ok(direct.best.selectedVariantIds.includes('seller:duplicate-b:x2'));
  assert.ok(!direct.best.selectedProductIds?.includes('duplicate-a'));
  assert.ok(compareSearchStates(direct.best, leader, input) < 0);
});
