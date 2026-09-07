import assert from 'node:assert/strict';
import { it } from 'node:test';
import { match } from '../../lib/matcher/index.ts';
import { compileGroups } from '../../lib/matcher/candidates.ts';
import type { ProductAdministration } from '../../lib/product-administration.ts';
import { catalog, product, request } from './flexible-v5-fixtures.ts';
const verified = (unitsPerServing: number, physicalUnit: ProductAdministration['physicalUnit'] = 'capsule', doseIncrement = 1) => ({ route: 'oral', physicalUnit, unitsPerServing, doseIncrement, packQuantity: 60,
  provenance: { status: 'verified', sourceUrl: 'https://example.test/label', sourceText: 'Verified test label', verifiedAt: '2026-09-07T00:00:00Z' } }) as const;
it('V5-DOSE-01: four supported units reach the target without a three-serving ceiling', () => {
  const result = match(request(), catalog([product('quarter', { a: 25 }, 100, { administration: verified(1) })]));
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.deepEqual(result.selected?.variantIds, ['seller:quarter:x4']);
  assert.equal(result.selected?.dailyPills, 4);
});
it('V5-DOSE-02: verified physical units allow one capsule of a two-capsule serving', () => {
  const result = match(request(), catalog([product('double', { a: 200 }, 100, { administration: verified(2), dailyPillsPerServing: 2 })]));
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.deepEqual(result.selected?.variantIds, ['seller:double:x0.5']);
  assert.equal(result.selected?.dailyPills, 1);
});
it('V5-DOSE-03: measurable powder and repeating serving fractions preserve exact dose arithmetic', () => {
  for (const [id, amount, units, physicalUnit, expected] of [['powder', 400, 4, 'g', 0.25], ['triple', 300, 3, 'capsule', 1 / 3]] as const) {
    const p = product(id, { a: amount }, 100, { administration: verified(units, physicalUnit), form: physicalUnit === 'g' ? 'powder' : 'capsule' });
    const result = match(request(), catalog([p]));
    assert.equal(result.selected?.doseFit?.perTarget[0]?.exposure, 100);
    assert.equal(result.selected?.doseFit?.total, 0);
    const group = compileGroups(request(), catalog([p]))[0]!;
    assert.ok(group.variants.some(row => Math.abs(row.dailyUnits - expected) < 1e-12));
  }
});
it('V5-DOSE-04: explicit quantities are mandatory while other products remain optimisable', () => {
  const r = request({ productDoses: [{ productId: 'quarter', servingsPerDay: 2 }] });
  const result = match(r, catalog([product('quarter', { a: 25 }), product('half', { a: 50 }, 200)]));
  assert.deepEqual(result.selected?.variantIds.slice().sort(), ['seller:half:x1', 'seller:quarter:x2']);
  assert.equal(result.selected?.doseFit?.total, 0);
});
it('V5-DOSE-05: invalid splitting and excluded proposals fail while numeric preferences remain advisory', () => {
  const p = product('capsule', { a: 100 }, 100, { administration: verified(1) });
  for (const r of [request({ productDoses: [{ productId: 'capsule', servingsPerDay: 0.5 }] }),
    request({ excludeProductIds: ['capsule'], productDoses: [{ productId: 'capsule', servingsPerDay: 1 }] })]) {
    assert.throws(() => match(r, catalog([p])), /productDoses|product dose/i);
  }
  const proposed = match(request({ maxProductCount: 0, productDoses: [{ productId: 'capsule', servingsPerDay: 1 }] }), catalog([p]));
  assert.deepEqual(proposed.selected?.variantIds, ['seller:capsule:x1']);
  assert.equal(proposed.selected?.doseFit?.total, 0);
});
it('V5-DOSE-06: health-limit excess stays evaluable when explicitly proposed', () => {
  const r = request({ productDoses: [{ productId: 'large', servingsPerDay: 4 }], safetyCeilings: [{ subjectId: 'a', name: 'A', maxAmount: 150, maxUnit: 'mg' }] });
  const result = match(r, catalog([product('large', { a: 100 }, 100, { administration: verified(1) })]));
  assert.deepEqual(result.selected?.variantIds, ['seller:large:x4']);
  assert.equal(result.selected?.safety.hardBlocked, false);
  assert.equal(result.selected?.safety.requiresAck, false);
  assert.ok(result.selected!.doseFit!.weightedLimit > 0);
});
