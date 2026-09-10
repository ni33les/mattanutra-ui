import { closestDoseOption } from "./flexible-v5-fixtures.ts";
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
it('V5-SEARCH-05: a companion product creates a supported remaining-gap quantity absent from standalone breakpoints', () => {
  const targets = canonicalizeTargets({ targets: ['a', 'b'].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: 'mg' as const })) }).targets;
  const result = match(request({ targets, productDoses: [{ productId: 'companion', servingsPerDay: 1 }] }),
    catalog([product('companion', { a: 40, b: 100 }), product('small', { a: 10 })]));
  const selected = closestDoseOption(result);
  assert.equal(selected?.doseFit?.total, 0);
  assert.deepEqual(selected?.variantIds.slice().sort(), ['seller:companion:x1', 'seller:small:x6']);
  assert.deepEqual(selected?.variantDoses?.find(row => row.productId === 'small'), { productId: 'small', dailyUnits: 6, dailyPills: 6 });
});
