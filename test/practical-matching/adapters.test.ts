import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTIC_CONTRACT_VERSION } from '../../lib/agentic/config.ts';
import { PLAN_REQUEST, PLAN_OPERATION_SCHEMAS } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { mergeRequestPatch } from '../../lib/agentic/plan/request-patch.ts';
import { toCanonicalRequest } from '../../lib/agentic/plan/matching.ts';
import { planRematchFingerprint } from '../../lib/agentic/plan/normalize.ts';
import { aug25PlanState } from '../../lib/agentic/plan/mode-d.ts';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { resolvePracticalProfile } from '../../lib/matcher/practical-scoring.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { projectPlan } from '../../lib/agentic/presentation/plan.ts';
import { d3Fixture } from '../mcp-conversation-pack/helpers.ts';
import { planResponseView } from '../../lib/agentic/contract/presentation-default.ts';
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

test('PRACTICAL-API-01 published request validates preference importance without a hard mode', () => {
  assert.deepEqual(validateToolIssues(PLAN_REQUEST, wire()), []);
  assert.ok(validateToolIssues(PLAN_REQUEST, { ...wire(), requirements: { preferenceImportance: { maxDailyPills: 'hard' } } }).length > 0);
  assert.deepEqual(validateToolIssues(PLAN_OPERATION_SCHEMAS.create, { operation: 'create', idempotencyKey: 'practical-create-test-01', request: wire() }), []);
});

test('PRACTICAL-API-02 patching objectives preserves importance, targets and medication context', () => {
  const result = mergeRequestPatch(wire(), { optimization: 'lowest_cost' });
  assert.ok(!('ok' in result)); assert.equal(result.requirements.preferenceImportance?.maxDailyPills, 'strong');
  assert.deepEqual(result.targets, wire().targets); assert.deepEqual(result.medicationCodes, ['apixaban']);
  const cleared = mergeRequestPatch(result, { requirements: { maxDailyPills: null } }); assert.ok(!('ok' in cleared));
  assert.equal(cleared.requirements.maxDailyPills, null);
  const reset = mergeRequestPatch(result, { requirements: { preferenceImportance: { maxDailyPills: 'normal' } } }); assert.ok(!('ok' in reset));
  assert.equal(reset.requirements.preferenceImportance?.maxDailyPills, 'normal');
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
      const selected = result.diagnostics.matching?.options.find(row => row.optionId === result.diagnostics.matching?.selectedOptionId);
      assert.ok(selected?.overallScore);
      assert.equal(selected.overallScore.profile.hash, resolvePracticalProfile({ optimization: preference === 'compact' ? 'fewest_pills' : 'balanced', preferenceImportance: { maxDailyPills: 'strong' } }).hash);
      assert.equal(selected.overallScore.preferences.maxDailyPills.preferred, 3);
    }
  } finally { resetMatcherSafetyCeilings(); }
});

test('PRACTICAL-API-05 monthly budget uses verified packs and preserves unknown pack information', () => {
  setMatcherSafetyCeilings([]);
  try {
    for (const pack of [60, null]) {
      const result = recommendWithMatcher({ needs: [need], candidates: [candidate(pack)], clientContext: { budgetPreference: 'u1000', currentSupplements: 'none' } });
      const selected = result.diagnostics.matching?.options.find(row => row.optionId === result.diagnostics.matching?.selectedOptionId);
      assert.ok(selected?.overallScore); const price = selected.overallScore.preferences.maxPriceMinor;
      assert.equal(selected.overallScore.profile.pricePreferenceBasis, 'monthly_30_days');
      assert.equal(price.preferred, 100000); assert.equal(price.actual, pack ? 60000 : null);
      assert.equal(price.complete, pack !== null); assert.equal(selected.priceMinor, 60000);
    }
  } finally { resetMatcherSafetyCeilings(); }
});

test('PRACTICAL-API-06 score details include overall breakdown while conversation stays compact', () => {
  const plan = d3Fixture(); const marker = { profile: { id: 'balanced', hash: 'fixture-profile', version: 'practical-penalties-1' }, overallPenalty: 1.25 };
  const first = plan.options![0]; (first as unknown as { overallScore: unknown }).overallScore = marker;
  const details = projectPlan(plan, { responseView: 'details', expectedRevision: plan.revision, sections: ['score'] });
  assert.ok(details.ok && 'options' in details); assert.deepEqual(details.options[0].overallScore, marker);
  const conversation = projectPlan(plan, { responseView: 'conversation' }); assert.ok(!('overallScore' in conversation.options[0]));
});

test('PRACTICAL-API-07 contract advances intentionally without losing presentation compatibility', () => {
  assert.equal(AGENTIC_CONTRACT_VERSION, '8.0.0');
  assert.equal(planResponseView(undefined), 'conversation');
  assert.equal(planResponseView(undefined, '7.1.0'), 'full');
  assert.equal(planResponseView('status', '7.1.0'), 'status');
});


test('PRACTICAL-API-08 compact changes penalty weights without a second search policy', async () => {
  const { WEB_MATCHER_CONFIG, WEB_COMPACT_MATCHER_CONFIG } = await import('../../lib/matcher/config.ts');
  assert.deepEqual(WEB_COMPACT_MATCHER_CONFIG, WEB_MATCHER_CONFIG);
});

test('PRACTICAL-API-09 web and MCP emit identical complete scores for identical resolved parameters', async () => {
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
      const selected = web.diagnostics.matching?.options.find(option => option.optionId === web.diagnostics.matching?.selectedOptionId);
      assert.ok(mcp.selected?.overallScore); assert.ok(selected?.overallScore);
      assert.deepEqual(selected.overallScore, mcp.selected.overallScore);
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
