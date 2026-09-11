import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTIC_CONTRACT_VERSION } from '../../lib/agentic/config.ts';
import { PLAN_REQUEST, PLAN_BRANCH_SCHEMAS } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { toCanonicalRequest } from '../../lib/agentic/plan/matching.ts';
import { planRematchFingerprint } from '../../lib/agentic/plan/normalize.ts';
import { aug25PlanState } from '../../lib/agentic/plan/mode-d.ts';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { resolvePracticalProfile } from '../../lib/matcher/practical-scoring.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { validateContractPin } from '../../lib/agentic/contract/version-pin.ts';
import type { PlanRequest } from '../../lib/agentic/plan/types.ts';
import type { ProductCandidate, ProductRecommendationNeed } from '../../lib/product-recommendation-types.ts';

const wire = (): PlanRequest => ({ locale: 'en', destinationCountry: 'TH', optimization: 'balanced', profile: {},
  requirements: { maxDailyPills: 3, preferenceImportance: { maxDailyPills: 'strong' } },
  medicationCodes: ['apixaban'], targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }] });
const need: ProductRecommendationNeed = { id: 'a', sourceId: 'a', displayName: 'A', normalizedName: 'a', category: 'Supplement', itemType: 'supplement', weight: 1,
  targetComparableAmount: 100000, targetText: '100 mg/day', targetDose: { amount: 100, unit: 'mg', originalText: '100 mg/day' } };
const candidate = (pack: number | null): ProductCandidate => ({ id: 'a', title: 'Controlled A', currency: 'THB', priceAmount: 600,
  productUrl: 'https://example.test/a', region: 'TH', status: 'approved', platform: 'manual', availabilityStatus: 'in_stock',
  availableCountryCodes: ['TH'], automatedSafetyPassed: false, labelStatus: 'parsed', selectedRetailerOrganisationId: 'seller',
  administration: { route: 'oral', physicalUnit: 'tablet', unitsPerServing: 1, doseIncrement: 1, packQuantity: pack,
    provenance: { status: 'verified', sourceUrl: 'https://example.test/label', sourceText: 'Fixture label: one tablet per serving.', verifiedAt: '2026-09-10' } },
  facts: [{ name: 'A', normalizedName: 'a', amount: 100, comparableAmount: 100000, unit: 'mg', itemType: 'supplement', confidence: 'high' }] });

test('PRACTICAL-API-01 internal web importance remains valid while MCP uses bounded weights', () => {
  assert.deepEqual(validateToolIssues(PLAN_REQUEST, wire()), []);
  assert.ok(validateToolIssues(PLAN_REQUEST, { ...wire(), requirements: { preferenceImportance: { maxDailyPills: 'hard' } } }).length > 0);
  assert.deepEqual(validateToolIssues(PLAN_BRANCH_SCHEMAS.create, { locale: 'en', destinationCountry: 'TH', targets: wire().targets, scoring: { weights: { pills: 2 } }, idempotencyKey: 'practical-create-test-01' }), []);
});

test('PRACTICAL-API-02 sparse refinement preserves weights, targets and medication context', () => {
  const original = prepareSimpleRequest({ locale: 'en', destinationCountry: 'TH', targets: wire().targets, medicationCodes: ['apixaban'], requirements: { maxDailyPills: 3 }, scoring: { weights: { pills: 2 } } }, fixtureSnapshot());
  assert.ok(!('ok' in original));
  const result = prepareSimpleRequest({ requirements: { maxDailyPills: null } }, fixtureSnapshot(), original);
  assert.ok(!('ok' in result)); assert.equal(result.requirements.maxDailyPills, null); assert.equal(result.scoring?.weights.pills, 2);
  assert.deepEqual(result.targets, original.targets); assert.deepEqual(result.medicationCodes, ['apixaban']);
  const reset = prepareSimpleRequest({ scoring: { profile: 'lowest_cost' } }, fixtureSnapshot(), result);
  assert.ok(!('ok' in reset)); assert.deepEqual(reset.scoring?.weights, {});
});

test('PRACTICAL-API-03 canonical MCP and task identities retain the selected preference weight', () => {
  const base = aug25PlanState({ requirements: { maxDailyPills: 3 } });
  const strong = { ...base, requirements: { ...base.requirements, preferenceImportance: { maxDailyPills: 'strong' as const } } };
  const canonical = toCanonicalRequest(strong); assert.ok(!('error' in canonical));
  assert.equal(canonical.preferenceImportance?.maxDailyPills, 'strong');
  assert.notEqual(planRematchFingerprint(base), planRematchFingerprint(strong));
});

test('PRACTICAL-API-04 web balanced and compact use shared profiles and strong explicit pill preferences', () => {
  setMatcherSafetyCeilings([]);
  try {
    for (const preference of ['balanced', 'compact'] as const) {
      const result = recommendWithMatcher({ needs: [need], candidates: [candidate(60)], stackPreference: preference, clientContext: { pillLimit: '1-3', currentSupplements: 'none' } });
      const selected = result.diagnostics.matching?.options.find(row => row.candidateKey === result.diagnostics.matching?.selectedCandidateKey);
      assert.ok(selected?.overallScore);
      assert.equal(selected.overallScore.profile.hash, resolvePracticalProfile({ selectorMode: 'web_single', optimization: preference === 'compact' ? 'fewest_pills' : 'balanced', preferenceImportance: { maxDailyPills: 'strong' } }).hash);
      assert.equal(selected.overallScore.preferences.maxDailyPills.preferred, 3);
    }
  } finally { resetMatcherSafetyCeilings(); }
});

test('PRACTICAL-API-05 monthly budget uses verified packs and preserves unknown pack information', () => {
  setMatcherSafetyCeilings([]);
  try {
    for (const pack of [60, null]) {
      const result = recommendWithMatcher({ needs: [need], candidates: [candidate(pack)], clientContext: { budgetPreference: 'u1000', currentSupplements: 'none' } });
      const selected = result.diagnostics.matching?.options.find(row => row.candidateKey === result.diagnostics.matching?.selectedCandidateKey);
      assert.ok(selected?.overallScore); const price = selected.overallScore.preferences.maxPriceMinor;
      assert.equal(selected.overallScore.profile.pricePreferenceBasis, 'monthly_30_days');
      assert.equal(price.preferred, 100000); assert.equal(price.actual, pack ? 60000 : null);
      assert.equal(price.complete, pack !== null); assert.equal(selected.priceMinor, 60000);
    }
  } finally { resetMatcherSafetyCeilings(); }
});

test('PRACTICAL-API-06 internal scores remain inspectable without adding public arithmetic trees', () => {
  const result = internalFixture(); const marker = { overallPenalty: 1.25 };
  (result.selected as unknown as { overallScore: unknown }).overallScore = marker;
  const decision = presentDecision(result, 'cap_current_returned_fixture_handle', 1);
  assert.ok('choices' in decision && decision.choices.length); assert.ok(!('overallScore' in decision.choices[0]));
  assert.equal(result.selected?.overallScore?.overallPenalty, 1.25);
});

test('PRACTICAL-API-07 contract supports v10 only without changing stored web settings', () => {
  assert.equal(AGENTIC_CONTRACT_VERSION, '11.0.0'); assert.equal(validateContractPin(undefined), null);
  assert.equal(validateContractPin('11.0.0'), null); assert.equal(validateContractPin('8.0.0')?.ok, false);
});

test('PRACTICAL-API-08 compact changes penalty weights without a second search policy', async () => {
  const { WEB_MATCHER_CONFIG, WEB_COMPACT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  assert.deepEqual(WEB_COMPACT_MATCHER_CONFIG, WEB_MATCHER_CONFIG);
});

test('PRACTICAL-API-09 web and MCP share arithmetic with the explicit web product-weight adjustment', async () => {
  const { matchPlan } = await import('../../lib/agentic/plan/matching.ts');
  const { sampleRetailProduct } = await import('../agentic/value/sample-catalogue.ts');
  const row = sampleRetailProduct({ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeea09', title: 'Controlled A', name: 'A', supplementId: 'sup_a',
    amount: 100, unit: 'mg', unitPriceMinor: 60000, form: 'capsule', servingLabel: '1 capsule; 60 capsules per bottle' });
  setMatcherSafetyCeilings([]);
  try {
    for (const compact of [false, true]) {
      const optimization = compact ? 'fewest_pills' : 'balanced';
      const state = aug25PlanState({ optimization, targets: [{ name: 'A', supplementId: 'sup_a', amount: 100, unit: 'mg', basis: 'supplemental' }],
        requirements: { maxDailyPills: 3, maxProductCount: 1, maxPriceMinor: 60000, preferenceImportance: { maxDailyPills: 'strong' }, productDoses: [{ productId: row.productId, servingsPerDay: 4 }] },
        currentSupplements: [], medicationCodes: [], conditionCodes: [] });
      const mcp = matchPlan({ state, snapshot: { availabilityAsOf: '2026-09-10T00:00:00Z', catalogueVersion: 'same-score-fixture', products: [row], supplements: [] } });
      const web = recommendWithMatcher({ needs: [need], candidates: [{ ...row.candidate, priceAmount: 600, selectedRetailerOrganisationId: row.sellerId }],
        stackPreference: compact ? 'compact' : 'balanced', maxProducts: 1, budgetAmount: 600,
        productDoses: [{ productId: row.candidate.id, servingsPerDay: 4 }], clientContext: { ageYears: 38, lifestage: 'adult', pillLimit: '1-3', currentSupplements: 'none' } });
      const selected = web.diagnostics.matching?.options.find(option => option.candidateKey === web.diagnostics.matching?.selectedCandidateKey);
      assert.ok(mcp.selected?.overallScore); assert.ok(selected?.overallScore);
      const { profile: webProfile, ...webScore } = selected.overallScore;
      const { profile: mcpProfile, ...mcpScore } = mcp.selected.overallScore;
      const { maxProductCount: webPreference, ...webPreferences } = webScore.preferences;
      const { maxProductCount: mcpPreference, ...mcpPreferences } = mcpScore.preferences;
      assert.equal(webProfile.multipliers.products, mcpProfile.multipliers.products * 5);
      assert.equal(webPreference.multiplier, mcpPreference.multiplier * 5);
      assert.deepEqual({ ...webPreference, multiplier: mcpPreference.multiplier }, mcpPreference);
      assert.deepEqual({ ...webScore, preferences: webPreferences }, { ...mcpScore, preferences: mcpPreferences });
      assert.equal(selected.dailyPills, 4); assert.equal(selected.purchaseEligible, true);
    }
  } finally { resetMatcherSafetyCeilings(); }
});

test('PRACTICAL-API-10 per-product dose explanations remain stable when requested coverage display order changes', async () => {
  const { internalFixture } = await import('../mcp-conversation-pack/helpers.ts');
  const { publicBasketItem } = await import('../../lib/agentic/public-mapper.ts');
  const fixture = internalFixture(), item = fixture.selected!.basket[0]; assert.ok(item);
  const rows = ['A', 'B'].map((name, i) => ({ ...fixture.coverage[0], name, supplementId: `sup_${name.toLowerCase()}`, unit: 'mg' as const, remainingGap: 0,
    contributors: [{ productId: item.productId, productName: item.productName, amount: (i + 1) * 25, unit: 'mg' as const }] }));
  for (const locale of ['en', 'th', 'zh-CN']) {
    const forward = publicBasketItem(item, locale, undefined, rows);
    assert.deepEqual(publicBasketItem(item, locale, undefined, [...rows].reverse()), forward);
    assert.deepEqual(forward.requestedNutrients, [{ name: 'A', amount: 25, unit: 'mg' }, { name: 'B', amount: 50, unit: 'mg' }]);
    assert.deepEqual(forward.selectionReason?.requestedSupplementIds, ['sup_a', 'sup_b']);
  }
});
