import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePracticalPenalties } from '../../lib/matcher/practical-scoring.ts';
import { request } from '../matcher/flexible-v5-fixtures.ts';

test('WEB-JOURNEY-04 web product burden is material and separate from price or nutrient arithmetic', () => {
  const actual = { dailyPills: 3, pillLowerBound: 3, productCount: 9, priceMinor: 463500, currency: 'THB', servings: Array(9).fill(1), uncertainProductCount: 0 };
  const control = scorePracticalPenalties(request(), actual);
  const web = scorePracticalPenalties(request({ selectorMode: 'web_single' }), actual);
  assert.equal(web.components.products, 2.25);
  assert.equal(control.components.products, 0.45);
  assert.equal(web.components.price, control.components.price);
  assert.notEqual(web.profile.hash, control.profile.hash);
});
