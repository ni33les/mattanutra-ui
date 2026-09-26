import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import type { ProductCandidate, ProductRecommendationNeed, ProductRecommendationClientContext, ProductRecommendationInput } from '../../lib/product-recommendation-types.ts';
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
    const input: ProductRecommendationInput = { needs: frozen.needs as ProductRecommendationNeed[], candidates,
      clientContext: frozen.clientContext as ProductRecommendationClientContext, clientSex: 'male', countryCode: 'TH', stackPreference: 'balanced', catalogueFingerprint: `${frozen.catalogueVersion}:active-b12-corrected` };
    const result = recommendWithMatcher(input);
    const matching = result.diagnostics.matching;
    assert.ok(matching);
    const selected = matching.options.find(o => o.candidateKey === matching.selectedCandidateKey);
    assert.ok(selected?.overallScore);
    assert.ok(selected.productIds.length > 0 && selected.productIds.length <= 6);
    assert.ok(selected.priceMinor < frozen.original.priceMinor);
    assert.equal(selected.doseFit?.perTarget.length, 10);
    const coverage = selected.doseFit!.perTarget;
    for (const name of ['omega_3', 'theanine']) {
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

    // WM-09 subsequently priced unknown administration at one point for this
    // strong pill preference. Preserve the actual unmet target and prove the
    // supported creatine alternatives remain purchasable at their real score.
    const creatine = candidates.find(p => p.facts.some(f => f.normalizedName === 'creatine')); assert.ok(creatine);
    assert.equal(creatine.administration, null, 'The frozen administration evidence remains unknown');
    const missing = coverage.find(t => t.subjectId === 'creatine'); assert.ok(missing);
    assert.equal(missing.target, 5); assert.equal(missing.exposure, 0); assert.equal(missing.under, 1);
    assert.equal(selected.priceMinor, 179000);
    assert.equal(selected.overallScore.overallPenalty, 6.415277777777778);
    const fixed = selected.productIds.map((productId, i) => ({ productId, servingsPerDay: selected.dailyServings[i]! }));
    for (const [quantity, exposure, under, over, doseImprovement, servingPenalty] of [[1, 3, .4, 0, .6, 0], [2, 6, 0, .2, .8, .05]] as const) {
      const productDoses = [...fixed, { productId: creatine.id, servingsPerDay: quantity }];
      const proposed = recommendWithMatcher({ ...input, productDoses,
        candidates: candidates.filter(p => productDoses.some(row => row.productId === p.id)) });
      const m = proposed.diagnostics.matching; assert.ok(m);
      const option = m.options.find(row => row.candidateKey === m.selectedCandidateKey); assert.ok(option?.overallScore);
      const target = option.doseFit?.perTarget.find(row => row.subjectId === 'creatine'); assert.ok(target);
      assert.deepEqual([target.exposure, target.under, target.over], [exposure, under, over]);
      if (quantity === 2) assert.ok(target.under <= .1, 'The supported six-gram proposal retains at least 90% creatine coverage');
      assert.equal(option.productIds.length, 6);
      assert.equal(option.priceMinor, 295600); assert.ok(option.priceMinor < frozen.original.priceMinor);
      assert.equal(option.purchaseEligible, true);
      assert.equal(option.dailyServings[option.productIds.indexOf(creatine.id)], quantity);
      assert.equal(option.overallScore.components.uncertainty, 1);
      assert.equal(option.overallScore.preferences.maxDailyPills.actual, null);
      assert.equal(option.overallScore.preferences.maxDailyPills.actualLowerBound, 8);
      // Independent arithmetic: dose improvement, one extra product (.25),
      // known added first-order price (116600*.05/100000), repeated servings,
      // and the reviewed one-point administration uncertainty term.
      const expected = selected.overallScore.overallPenalty - doseImprovement + .25 + 116600 * .05 / 100000 + servingPenalty + 1;
      assert.ok(Math.abs(option.overallScore.overallPenalty - expected) < 1e-12);
      assert.ok(option.overallScore.overallPenalty > selected.overallScore.overallPenalty);
      assert.ok(m.searchSummary!.expansionAttempts <= 8000);
    }
  } finally { resetMatcherSafetyCeilings(); }
});
