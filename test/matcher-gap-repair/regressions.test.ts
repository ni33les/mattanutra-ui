import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { match } from '../../lib/matcher/index.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { product, request, catalog } from '../matcher/flexible-v5-fixtures.ts';
import { input, recorded, relacza } from './fixtures.ts';
afterEach(resetMatcherSafetyCeilings);
function selected(result: ReturnType<typeof recommendWithMatcher>) {
  const m=result.diagnostics.matching; assert.ok(m); const o=m.options.find(o=>o.candidateKey===m.selectedCandidateKey); assert.ok(o?.overallScore); return o;
}
test('GAP-01 frozen saved basket reproduces its exact score and a better feasible addition exists', () => {
  const original=input(); const base=recorded.productIds.map((productId,i)=>({productId,servingsPerDay:recorded.servings[i]!}));
  const baseline=selected(recommendWithMatcher({...original,candidates:original.candidates.filter(p=>recorded.productIds.includes(p.id)),productDoses:base}));
  assert.equal(baseline.overallScore!.overallPenalty, recorded.score);
  const witness=selected(recommendWithMatcher({...original,candidates:original.candidates.filter(p=>[...recorded.productIds,relacza].includes(p.id)),productDoses:[...base,{productId:relacza,servingsPerDay:1}]}));
  assert.equal(witness.dailyPills,5); assert.ok(witness.overallScore!.overallPenalty < recorded.score);
  const result=recommendWithMatcher(original), winner=selected(result);
  assert.ok(winner.overallScore!.overallPenalty <= witness.overallScore!.overallPenalty, `${winner.overallScore!.overallPenalty} loses to ${witness.overallScore!.overallPenalty}`);
  assert.ok(result.diagnostics.matching!.searchSummary!.expansionAttempts <= 8000);
});
test('GAP-02 corrected active B12 enables a useful three-product six-pill routine within the original budget', () => {
  const original=input(true); const base=recorded.productIds.map((productId,i)=>({productId,servingsPerDay:recorded.servings[i]!}));
  const witness=selected(recommendWithMatcher({...original,candidates:original.candidates.filter(p=>[...recorded.productIds,relacza].includes(p.id)),productDoses:[...base,{productId:relacza,servingsPerDay:2}]}));
  assert.equal(witness.dailyPills,6); assert.equal(witness.coveragePercent,58.3); assert.equal(witness.priceMinor,118800);
  assert.ok(Math.abs(witness.overallScore!.overallPenalty-5.533133333333334)<1e-12);
  const result=recommendWithMatcher(original), winner=selected(result);
  assert.ok(winner.overallScore!.overallPenalty <= witness.overallScore!.overallPenalty);
  assert.ok(result.diagnostics.matching!.searchSummary!.expansionAttempts <= 8000);
});
test('GAP-03 diagnostic product counts resolve probiotic aliases exactly as contribution matching does', () => {
  const r=request({targets:canonicalizeTargets({targets:[{subjectId:'probiotics',name:'Probiotics',amount:3_000_000_000,unit:'CFU'}]}).targets});
  const p=product('probiotic',{},71500,{contributionSubjectIds:['multi_strain_probiotics'],labelledContributions:[{subjectId:'multi_strain_probiotics',name:'Multi-strain probiotics',amount:3,unit:'billion CFU',confidence:'high',mappingStatus:'verified'}]});
  const result=match(r,catalog([p])), d=result.matchingDiagnostics!.targets[0]!;
  assert.ok(d.supportedDoseVariants>0); assert.equal(d.candidateProducts,1); assert.equal(d.eligibleProducts,1);
  const excluded=match({...r,excludeProductIds:['probiotic']},catalog([p])).matchingDiagnostics!.targets[0]!;
  assert.equal(excluded.candidateProducts,1); assert.equal(excluded.eligibleProducts,0);
});
