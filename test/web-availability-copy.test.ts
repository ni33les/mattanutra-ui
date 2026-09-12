import assert from 'node:assert/strict';
import test from 'node:test';
import { supplementProductCoverageById } from '../components/formulation-results-helpers.tsx';
import { revealCopy } from '../components/formulation-reveal-copy.ts';
import type { FormulationResult } from '../lib/formulation-types.ts';

test('AVAIL-COPY-01 raw positive coverage cannot turn into unavailable through rounding',()=>{
  const coverage=supplementProductCoverageById({needCoverage:[{id:'supplement:d3',itemType:'supplement',coveragePercent:0.4},
    {id:'supplement:b12',itemType:'supplement',coveragePercent:0},{id:'supplement:missing',itemType:'supplement',coveragePercent:NaN}]} as FormulationResult['productRecommendations']);
  assert.equal(coverage.get('d3'),0.4);assert.equal(coverage.get('b12'),0);assert.ok(!coverage.has('missing'));
});
test('AVAIL-COPY-02 exact zero and unknown have authored, distinct localized copy',()=>{
  for(const [locale,expected] of [['en','Currently unavailable'],['th','ขณะนี้ไม่มีผลิตภัณฑ์ที่รองรับ'],['zh-CN','目前暂无可用产品']] as const){
    assert.equal(revealCopy[locale].currentlyUnavailable,expected);
    assert.ok(revealCopy[locale].coverageUnknown);assert.notEqual(revealCopy[locale].coverageUnknown,expected);
    assert.ok(revealCopy[locale].notIncludedInRoutine);
  }
});
test('AVAIL-COPY-03 missing persisted diagnostic remains unknown through the reveal projection',async()=>{
  const {reconcileProductRecommendationCoverage}=await import('../lib/assessment-store.ts');
  const result=reconcileProductRecommendationCoverage({foodGuidance:[],rawNeedCoverage:[],recommendations:[],supplementBreakdown:[{id:'d3',supplement:'Vitamin D3',category:'Foundation',dailyDose:'1000 IU/day',effectivenessRank:1,rationale:'Fixture',status:'add'}]});
  assert.equal(result.needCoverage.length,1);assert.equal(result.needCoverage[0].coveragePercent,null);
  assert.ok(!supplementProductCoverageById({needCoverage:result.needCoverage} as FormulationResult['productRecommendations']).has('d3'));
});
test('AVAIL-COPY-04 reveal uses distinct pending, unknown, zero and raw-positive labels in every locale',async()=>{
  const {revealCoverageLabel}=await import('../components/formulation-results-helpers.tsx');
  for(const locale of ['en','th','zh-CN'] as const){const copy=revealCopy[locale];
    assert.equal(revealCoverageLabel(0,false,copy),'0%');
    for (const positive of [0.004, 0.4, 0.999]) assert.equal(revealCoverageLabel(positive,false,copy),'1%');
    assert.equal(revealCoverageLabel(1.2,false,copy),'1.2%');
    assert.equal(revealCoverageLabel(null,false,copy),copy.coverageUnknown);
    assert.equal(revealCoverageLabel(undefined,false,copy),copy.coverageUnknown);
    assert.equal(revealCoverageLabel(0,true,copy),copy.productsPendingBadge);
  }
});
