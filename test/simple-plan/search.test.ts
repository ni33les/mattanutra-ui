import assert from 'node:assert/strict';
import test from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalTargetSetHash, canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { catalog, product, request } from '../matcher/flexible-v5-fixtures.ts';
import type { CanonicalRequest } from '../../lib/matcher/types.ts';
import { createMatchCursor, advanceMatchCursor, matchCursorAttempts } from '../../lib/matcher/match-cursor.ts';
import { DEFAULT_MATCHER_CONFIG } from '../../lib/matcher/config.ts';

const admin = { route: 'oral', physicalUnit: 'tablet', unitsPerServing: 10, doseIncrement: 1, packQuantity: 60,
  provenance: { status: 'verified', sourceUrl: 'https://example.test/controlled-label', sourceText: 'Controlled ten tablet serving.', verifiedAt: '2026-09-10' } } as const;
const shelf = catalog([product('interior', { a: 125 }, 10000, { administration: admin, dailyPillsPerServing: 10, pillCountKnown: true })]);
const input = (weight: number) => ({ ...request({ maxDailyPills: 5 }), scoring: { profile: 'balanced', weights: { pills: weight } } }) as CanonicalRequest;
test('SPLAN-WGT-06/07 independent finite oracle agrees on weighted interior quantities and retained dose alternative', () => {
  for (const weight of [0, 0.543, 1, 2]) {
    const candidates = Array.from({ length: 31 }, (_, ticks) => {
      const q = ticks / 10, pills = ticks;
      return { q, score: Math.abs(125 * q - 100) / 100 + weight * Math.max(0, pills - 5) ** 2 / 100 + (ticks ? 0.055 : 0) + Math.max(0, q - 1) ** 2 / 20 };
    }).sort((a, b) => a.score - b.score);
    assert.equal(candidates.length, 31);
    const result = match(input(weight), shelf); assert.ok(result.selected?.overallScore);
    assert.equal(result.selected.variantDoses?.[0]?.dailyUnits ?? 0, candidates[0].q);
    assert.ok(Math.abs(result.selected.overallScore.overallPenalty - candidates[0].score) < 1e-12);
    assert.ok([result.selected, ...result.alternatives].some(row => row.roles?.includes('closest_dose')));
    assert.ok(result.searchSummary.expansionAttempts <= 8000);
  }
});
test('SPLAN-WGT-11 effective settings fence cache/cursor identities and checkpoint continuation preserves exact results', () => {
  assert.notEqual(canonicalTargetSetHash(input(0)), canonicalTargetSetHash(input(2)));
  const value = input(0.5); let cursor = createMatchCursor(value, shelf, DEFAULT_MATCHER_CONFIG);
  while (!cursor.done) { const before = matchCursorAttempts(cursor); advanceMatchCursor(cursor, value, 1);
    assert.ok(matchCursorAttempts(cursor) - before <= 1); assert.ok(matchCursorAttempts(cursor) <= 8000); cursor = structuredClone(cursor); }
  assert.deepEqual(match(value, shelf, DEFAULT_MATCHER_CONFIG, undefined, undefined, cursor), match(value, shelf));
});
test('SPLAN-WGT-12 ingredient priorities have no hidden core veto while categorical exclusions still apply', () => {
  const targets = canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg', basis: 'supplemental', importance: 'core' },
    { subjectId: 'b', name: 'B', amount: 100, unit: 'mg', basis: 'supplemental', importance: 'optional' }] }).targets;
  const products = catalog([product('core', { a: 100 }, 10000), product('trade', { a: 90, b: 100 }, 10000)]);
  const value = { ...request({ targets }), scoring: { profile: 'balanced', weights: { nutrients: { a: 0, b: 2 } } } } as CanonicalRequest;
  const result = match(value, products); assert.ok(result.selected?.productIds.includes('trade'));
  assert.ok(!match({ ...value, excludeProductIds: ['trade'] }, products).selected?.productIds.includes('trade'));
});
test('IMP-09/10 worker checkpoints reject different resolved importance before resuming calculations', async () => {
  const { installGoldCatalogue, uninstallGoldCatalogue } = await import('../helpers/gold-catalogue.ts');
  const { fixtureSnapshot } = await import('../../lib/agentic/catalogue/fixtures.ts');
  const { normalizePlanRequest } = await import('../../lib/agentic/plan/normalize.ts');
  const { loadAgenticConfig } = await import('../../lib/agentic/config.ts');
  const { matchPlanChunk, planCheckpointInputIdentity } = await import('../../lib/agentic/plan/matching.ts');
  installGoldCatalogue();
  try {
    const snapshot=fixtureSnapshot();
    const value=await normalizePlanRequest({snapshot,config:loadAgenticConfig(),request:{locale:'en',destinationCountry:'TH',optimization:'balanced',profile:{},requirements:{maxDailyPills:3},
      scoring:{profile:'balanced',weights:{pills:.543}},targets:[{name:'Vitamin D3',amount:2000,unit:'IU',basis:'supplemental'}]}});
    assert.ok('state' in value); const input={snapshot,state:value.state};
    const started=matchPlanChunk(input,{chunkBudget:1}); assert.equal(started.done,false);
    const changed={...input,state:{...value.state,scoring:{profile:'balanced',weights:{pills:1}}}};
    assert.notEqual(planCheckpointInputIdentity(input),planCheckpointInputIdentity(changed));
    assert.throws(()=>matchPlanChunk(changed,{checkpoint:started.checkpoint,chunkBudget:1}),/identity changed/);
  } finally { uninstallGoldCatalogue(); }
});
