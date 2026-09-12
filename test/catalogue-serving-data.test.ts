import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalogueCorrectionState, validateCatalogueCorrectionTarget, type CatalogueCorrectionManifest } from '../lib/catalogue-corrections.ts';
import { administrationDailyPills, parseProductAdministration } from '../lib/product-administration.ts';
import { administrationBasisKnown, scorePracticalPenalties } from '../lib/matcher/practical-scoring.ts';
import { request, product } from './matcher/flexible-v5-fixtures.ts';

const manifest = JSON.parse(readFileSync(new URL('../data/catalogue-corrections/dev-serving-20260912.json', import.meta.url), 'utf8')) as CatalogueCorrectionManifest;
// Independently reviewed physical units; daily instructions are not nutrient amounts.
const capsules = new Set(['8a023f8f-007f-4f7a-bd84-27a4b6653e2e', 'd4823f19-ff68-4351-9751-50e39f549179', 'b64a615a-3f11-5aff-8cc9-667f60e16a9b', '57669f54-739d-5970-b320-ce4ffbd61fe3']);
const input = request({ selectorMode: 'web_single', maxDailyPills: 3, preferenceImportance: { maxDailyPills: 'strong' } });

for (const row of manifest.corrections) test(`SERVING-DATA-01 ${row.entityId}: labelled serving resolves quantity without altering nutrients`, () => {
  const administration = parseProductAdministration(row.after.administration);
  assert.ok(administration);
  assert.equal(administration.unitsPerServing, 1);
  assert.equal(administration.route, 'oral');
  assert.equal(administration.physicalUnit, capsules.has(row.entityId) ? 'capsule' : 'sachet');
  assert.equal(administration.doseIncrement, 1);
  assert.equal(administration.provenance.status, 'verified');
  const candidate = product(row.entityId, { a: 100 }, 100, { administration });
  assert.equal(administrationBasisKnown(candidate), true);
  assert.equal(administrationDailyPills(administration), capsules.has(row.entityId) ? 1 : 0);
  const facts = structuredClone(candidate.labelledContributions);
  const score = scorePracticalPenalties(input, { dailyPills: administrationDailyPills(administration), pillLowerBound: administrationDailyPills(administration)!, productCount: 1,
    priceMinor: 100, currency: 'THB', servings: [1], uncertainProductCount: administrationBasisKnown(candidate) ? 0 : 1 });
  assert.equal(score.components.uncertainty, 0);
  assert.deepEqual(candidate.labelledContributions, facts);
});

test('SERVING-DATA-02 corrections preserve identity and non-administration fields and reject another environment', () => {
  assert.equal(manifest.corrections.length, 11);
  assert.equal(new Set(manifest.corrections.map(row => row.entityId)).size, 11);
  for (const row of manifest.corrections) {
    assert.equal(row.entityTable, 'products');
    const { administration: _before, ...before } = row.before;
    const { administration: _after, ...after } = row.after;
    assert.deepEqual(after, before);
    assert.equal(catalogueCorrectionState(row, row.after), 'already_applied');
  }
  assert.throws(() => validateCatalogueCorrectionTarget(manifest, 'uat', 'postgresql://fixture@db.test/mattanutra-uat'));
  assert.throws(() => validateCatalogueCorrectionTarget(manifest, 'dev', 'postgresql://fixture@db.test/mattanutra-prd'));
});

test('SERVING-DATA-03 pack counts remain unknown unless the exact manufacturer listing establishes them', () => {
  const packs: Record<string, number> = { 'e69796f5-87f9-4ff5-b5a2-8c7dbdd5335c': 30, '8e72318a-5355-4333-8607-6108d997177c': 30, 'a0c11439-ec98-411d-b1f7-c06b2310433a': 10 };
  for (const row of manifest.corrections) assert.equal(parseProductAdministration(row.after.administration)?.packQuantity, packs[row.entityId] ?? null);
});
