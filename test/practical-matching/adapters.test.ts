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
