import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ZERO_TARGET_POLICY, zeroTargetScale } from '../../lib/matcher/zero-target-policy.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { match } from '../../lib/matcher/index.ts';
import { weightedDoseFitScore } from '../../lib/matcher/dose-fit.ts';
import { patchScoring } from '../../lib/matcher/scoring-policy.ts';
import { product, request, catalog } from '../matcher/flexible-v5-fixtures.ts';

test('IMP-07 supported scales reproduce frozen source amounts and never upgrade catalogue evidence', () => {
  const bytes=readFileSync(ZERO_TARGET_POLICY.source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),ZERO_TARGET_POLICY.sourceSha256);
  const fixture=JSON.parse(bytes.toString()); assert.equal(ZERO_TARGET_POLICY.scales.length,2);
  for(const scale of ZERO_TARGET_POLICY.scales) {
    const row=fixture.catalogue.products.find(p=>p.candidate.id===scale.productId); assert.ok(row);
    const fact=row.candidate.facts.find(f=>f.name===scale.name); assert.ok(fact);
    assert.equal(fact.amount,scale.labelledAmount); assert.equal(fact.unit,scale.labelledUnit);
    assert.equal(fact.source,'admin'); assert.equal(fact.sourceUrl,null);
    assert.equal(zeroTargetScale(scale.name,'ingredient')?.units,BigInt(scale.amount)*1000n);
  }
  assert.equal(zeroTargetScale('Unreviewed nutrient','unknown'),null);
});
test('IMP-06/09 finite selenium fixture distinguishes ignored importance from explicit avoidance and keeps trade-offs selectable', () => {
  const targets=canonicalizeTargets({targets:[{subjectId:'a',name:'A',amount:100,unit:'mg',basis:'supplemental'},
    {subjectId:'se',name:'Selenium',amount:0,unit:'mcg',basis:'supplemental'}]}).targets;
  const shelf=catalog([product('incidental',{a:100,se:.05},10000,{labelledContributions:[{subjectId:'a',name:'A',amount:100,unit:'mg'},{subjectId:'se',name:'Selenium',amount:50,unit:'mcg'}]}),product('clean',{a:90},10000)]);
  const r={...request({targets}),scoring:patchScoring(undefined,{weights:{nutrients:{se:1}}})};
  const avoided=match(r,shelf), ignored=match({...r,scoring:patchScoring(r.scoring,{weights:{nutrients:{se:0}}})},shelf);
  assert.deepEqual(avoided.selected?.productIds,['clean']);
  assert.deepEqual(ignored.selected?.productIds,['incidental']);
  const retained=match({...r,retainProductIds:['incidental'],maxProductCount:0},shelf);
  assert.ok(retained.selected?.productIds.includes('incidental')); // Numerical and nutrient goals are advisory; an explicit required product remains eligible.
  assert.equal(weightedDoseFitScore(r,new Map([['a',100000000n],['se',50000n]])).total,1);
  assert.equal(weightedDoseFitScore(r,new Map([['a',100000000n],['se',100000n]])).total,2);
});
