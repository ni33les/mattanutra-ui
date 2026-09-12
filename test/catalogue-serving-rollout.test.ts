import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalogueCorrectionState, validateCatalogueCorrectionTarget, type CatalogueCorrectionManifest } from '../lib/catalogue-corrections.ts';
import { recommendWithMatcher } from '../lib/matcher/adapters/web.ts';
import { parseProductAdministration } from '../lib/product-administration.ts';
import type { ProductCandidate, ProductRecommendationNeed } from '../lib/product-recommendation-types.ts';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const dev = read('data/catalogue-corrections/dev-serving-20260912.json') as CatalogueCorrectionManifest;
const uat = read('data/catalogue-corrections/uat-serving-20260912.json') as CatalogueCorrectionManifest;
const fixture = read('test/fixtures/collagen-serving.json') as { needs: ProductRecommendationNeed[]; candidates: ProductCandidate[] };

test('SERVING-ROLLOUT-01 UAT has its own reviewed originals and the same verified serving corrections', () => {
  assert.equal(uat.environment, 'uat');
  assert.equal(uat.corrections.length, 11);
  assert.equal(new Set(uat.corrections.map(c => c.entityId)).size, 11);
  for (const row of uat.corrections) {
    const reviewed = dev.corrections.find(c => c.entityId === row.entityId);
    assert.ok(reviewed);
    assert.deepEqual(row.after.administration, reviewed.after.administration);
    assert.equal(catalogueCorrectionState(row, row.before), 'pending');
    assert.equal(catalogueCorrectionState(row, row.after), 'already_applied');
    assert.equal(row.after.title, row.before.title);
    assert.equal(row.after.product_url, row.before.product_url);
  }
  assert.throws(() => validateCatalogueCorrectionTarget(uat, 'dev', 'postgresql://fixture@db.test/mattanutra-dev'));
  assert.throws(() => validateCatalogueCorrectionTarget(uat, 'uat', 'postgresql://fixture@db.test/mattanutra-prd'));
});

for (const manifest of [dev, uat]) test(`SERVING-ROLLOUT-02 ${manifest.environment}: real retail collagen supplies 5000 mg without adding daily pills`, () => {
  assert.equal(fixture.candidates.length, 2);
  assert.equal(fixture.needs.length, 2);
  const candidates = structuredClone(fixture.candidates);
  for (const candidate of candidates) {
    const correction = manifest.corrections.find(c => c.entityId === candidate.id);
    if (correction) candidate.administration = parseProductAdministration(correction.after.administration);
  }
  const result = recommendWithMatcher({ needs: fixture.needs, candidates, stackPreference: 'balanced', countryCode: 'TH', clientContext: { pillLimit: '1-3', currentSupplements: 'none', dietaryPreference: 'any' } });
  const selected = result.diagnostics.matching?.options.find(o => o.candidateKey === result.diagnostics.matching?.selectedCandidateKey);
  assert.ok(selected);
  const collagen = selected.doseFit.perTarget.find(t => t.subjectId === 'collagen');
  assert.ok(collagen);
  assert.equal(collagen.exposure, 5000);
  assert.equal(collagen.under, 0);
  assert.equal(selected.dailyPills, 1);
  const product = result.recommendations.find(p => p.product.id === '8e72318a-5355-4333-8607-6108d997177c');
  assert.ok(product);
  assert.equal(product.servingMultiplier, 2);
  assert.equal(product.product.administration?.physicalUnit, 'sachet');
  assert.equal(product.product.administration?.packQuantity, 30);
  assert.deepEqual(candidates.map(p => [p.id, p.facts, p.priceAmount, p.unitPriceAmount]), fixture.candidates.map(p => [p.id, p.facts, p.priceAmount, p.unitPriceAmount]));
});
