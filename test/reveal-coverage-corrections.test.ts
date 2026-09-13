import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalogueCorrectionState, type CatalogueCorrectionManifest } from '../lib/catalogue-corrections.ts';
import { administrationDailyPills, parseProductAdministration } from '../lib/product-administration.ts';
import { monthlyGoodsPrice } from '../lib/matcher/practical-scoring.ts';
import { product } from './matcher/flexible-v5-fixtures.ts';
import { recommendWithMatcher } from '../lib/matcher/adapters/web.ts';
import type { ProductCandidate, ProductRecommendationNeed } from '../lib/product-recommendation-types.ts';

const d3 = '617d8373-80b3-4ada-99c0-769d502b5b1c';
const magnesium = '52b0c7fd-e344-49a2-9cf6-c65d8616b789';
for (const environment of ['dev', 'uat']) {
  const manifest = JSON.parse(readFileSync(`data/catalogue-corrections/${environment}-coverage-serving-20260913.json`, 'utf8')) as CatalogueCorrectionManifest;
  test(`REVEAL-COVERAGE-DATA-01 ${environment}: dedicated D3 has the manufacturer-identified capsule and pack basis`, () => {
    const row = manifest.corrections.find(c => c.entityId === d3);
    assert.ok(row);
    const administration = parseProductAdministration(row.after.administration);
    assert.ok(administration);
    assert.equal(administration.physicalUnit, 'capsule');
    assert.equal(administration.unitsPerServing, 1);
    assert.equal(administration.doseIncrement, 1);
    assert.equal(administration.packQuantity, 200);
    assert.equal(administrationDailyPills(administration), 1);
    assert.match(administration.provenance.sourceText!, /9300807243763/);
    const candidate = product(d3, { d3: 1000 }, 48500, { administration });
    assert.equal(monthlyGoodsPrice(candidate, 2), 48500);
    assert.equal(200 / (2 * administration.unitsPerServing!), 100);
  });
  test(`REVEAL-COVERAGE-DATA-02 ${environment}: Nat Mag uses one tablet per labelled serving and 30 tablets per pack`, () => {
    const row = manifest.corrections.find(c => c.entityId === magnesium);
    assert.ok(row);
    const administration = parseProductAdministration(row.after.administration);
    assert.ok(administration);
    assert.equal(administration.physicalUnit, 'tablet');
    assert.equal(administration.unitsPerServing, 1);
    assert.equal(administration.packQuantity, 30);
    assert.equal(administrationDailyPills(administration), 1);
    assert.equal(monthlyGoodsPrice(product(magnesium, { magnesium: 350 }, 34700, { administration }), 1), 34700);
  });
  test(`REVEAL-COVERAGE-DATA-03 ${environment}: corrections preserve price and nutrient facts and reject stale records`, () => {
    assert.equal(manifest.environment, environment);
    assert.equal(manifest.corrections.length, 2);
    for (const row of manifest.corrections) {
      assert.equal(row.entityTable, 'products');
      assert.equal(catalogueCorrectionState(row, row.before), 'pending');
      assert.equal(catalogueCorrectionState(row, row.after), 'already_applied');
      const unchanged = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'administration'));
      assert.deepEqual(unchanged(row.before), unchanged(row.after));
      assert.throws(() => catalogueCorrectionState(row, { ...row.before, title: 'Different product' }), /changed since review/);
    }
  });
  test(`REVEAL-COVERAGE-DATA-04 ${environment}: the retail adapter matches 2000 IU with two known D3 capsules`, () => {
    const fixture = JSON.parse(readFileSync('test/fixtures/reveal-d3-magnesium.json', 'utf8')) as { needs: ProductRecommendationNeed[]; candidates: ProductCandidate[] };
    assert.equal(fixture.needs.length, 1);
    assert.equal(fixture.candidates.length, 2);
    const originals = structuredClone(fixture.candidates);
    for (const candidate of fixture.candidates) {
      const correction = manifest.corrections.find(c => c.entityId === candidate.id);
      assert.ok(correction);
      candidate.administration = parseProductAdministration(correction.after.administration);
    }
    const result = recommendWithMatcher({ needs: fixture.needs, candidates: fixture.candidates, countryCode: 'TH', stackPreference: 'balanced', clientContext: { pillLimit: '1-3', currentSupplements: 'none' } });
    const selected = result.diagnostics.matching?.options.find(o => o.candidateKey === result.diagnostics.matching?.selectedCandidateKey);
    assert.ok(selected);
    assert.equal(selected.dailyPills, 2);
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0].product.id, d3);
    assert.equal(result.recommendations[0].servingMultiplier, 2);
    assert.equal(selected.doseFit.perTarget[0].exposure, 2000);
    assert.equal(selected.doseFit.perTarget[0].under, 0);
    assert.deepEqual(fixture.candidates.map(c => [c.id, c.facts, c.unitPriceAmount]), originals.map(c => [c.id, c.facts, c.unitPriceAmount]));
  });
}
