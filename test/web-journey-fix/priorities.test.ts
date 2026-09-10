import assert from 'node:assert/strict';
import test from 'node:test';
import * as adapter from '../../lib/matcher/adapters/web.ts';
import type { ProductRecommendationNeed } from '../../lib/product-recommendation-types.ts';
import type { CanonicalTarget } from '../../lib/matcher/types.ts';
import frozen from './fixtures/reported.json' with { type: 'json' };

test('WEB-JOURNEY-06 web target categories preserve foundation and optional add-on priority', () => {
  const resolve = (adapter as unknown as { webTargetsForNeeds?: (needs: ProductRecommendationNeed[]) => { targets: CanonicalTarget[] } }).webTargetsForNeeds;
  assert.equal(typeof resolve, 'function'); assert.ok(resolve);
  const targets = resolve(frozen.needs as ProductRecommendationNeed[]).targets;
  assert.equal(targets.find(t => t.subjectId === 'magnesium')?.importance, 'core');
  assert.equal(targets.find(t => t.subjectId === 'theanine')?.importance, 'required');
  assert.equal(targets.find(t => t.subjectId === 'coq10')?.importance, 'optional');
  assert.equal(targets.find(t => t.subjectId === 'vitamin_b12')?.importance, 'optional');
  assert.equal(targets.length, 10);
  assert.equal(targets.find(t => t.subjectId === 'vitamin_d3')?.requestedAmount, 2000);
});
