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
