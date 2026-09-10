import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import type { ProductCandidate, ProductRecommendationNeed, ProductRecommendationClientContext } from '../../lib/product-recommendation-types.ts';
import type { SafetyCeiling } from '../../lib/matcher/types.ts';
import frozen from './fixtures/reported.json' with { type: 'json' };

test('WEB-JOURNEY-08 corrected frozen journey chooses a smaller useful routine without dropping requested targets', () => {
  assert.deepEqual(frozen.original, { score: 38, shortlistCount: 8, formulaCount: 10, productCount: 9, priceMinor: 463500, overallPenalty: 4.758667777777778 });
  let candidates = structuredClone(frozen.candidates).filter(p => p.selectedRetailerOrganisationId === '6052e03e-6619-409b-8767-02806b3df016') as ProductCandidate[];
  assert.equal(candidates.length, 79);
  const bad = candidates.find(p => p.id === frozen.factBefore.product_id)!;
  assert.ok(bad);
  const correction = bad.facts.find(f => f.normalizedName === 'vitamin_b12')!;
  assert.ok(correction); assert.equal(correction.unit, 'mg');
  // Apply only the separately reviewed active-amount correction to a clone.
  candidates = candidates.map(p => p === bad ? { ...p, facts: p.facts.map(f => f === correction ? { ...f, unit: 'mcg', comparableAmount: 1 } : f) } : p);
  setMatcherSafetyCeilings(frozen.ceilings as SafetyCeiling[]);
  try {
    const result = recommendWithMatcher({ needs: frozen.needs as ProductRecommendationNeed[], candidates,
      clientContext: frozen.clientContext as ProductRecommendationClientContext, clientSex: 'male', countryCode: 'TH', stackPreference: 'balanced', catalogueFingerprint: `${frozen.catalogueVersion}:active-b12-corrected` });
    const matching = result.diagnostics.matching;
    assert.ok(matching);
    const selected = matching.options.find(o => o.optionId === matching.selectedOptionId);
    assert.ok(selected?.overallScore);
    assert.ok(selected.productIds.length > 0 && selected.productIds.length <= 6);
    assert.ok(selected.priceMinor < frozen.original.priceMinor);
    assert.equal(selected.doseFit?.perTarget.length, 10);
    const coverage = selected.doseFit!.perTarget;
    for (const name of ['omega_3', 'theanine', 'creatine']) {
      const target = coverage.find(t => t.subjectId === name); assert.ok(target);
      assert.ok(target.under <= 0.1, `${name} retains at least 90% coverage`);
    }
    // Whole D3 capsules trade 70% coverage against overshoot at the next
    // supported quantity. This is disclosed coverage, not a 90% guarantee.
    const d3 = coverage.find(t => t.subjectId === 'vitamin_d3'); assert.ok(d3);
    assert.equal(d3.target, 2000); assert.equal(d3.exposure, 1400);
    assert.equal(d3.under, 0.3);
    assert.equal(selected.purchaseEligible, true);
    assert.ok(selected.dailyServings.every(n => n <= 4));
    assert.ok(matching.searchSummary!.expansionAttempts <= 8000);
  } finally { resetMatcherSafetyCeilings(); }
});
