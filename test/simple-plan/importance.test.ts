import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeTargets, canonicalizeCurrents } from '../../lib/matcher/canonicalizer.ts';
import { weightedDoseFitScore, exactDoseFit } from '../../lib/matcher/dose-fit.ts';
import { scorePracticalPenalties } from '../../lib/matcher/practical-scoring.ts';
import { patchScoring, effectiveWeights, validateWeight } from '../../lib/matcher/scoring-policy.ts';
import { request } from '../matcher/flexible-v5-fixtures.ts';
import { AGENTIC_INPUT_SCHEMAS } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { isAgenticErrorResult } from '../../lib/agentic/contract/errors.ts';
import { coverageSummary } from '../../lib/matcher/coverage.ts';

const actual = { dailyPills:16, pillLowerBound:16, productCount:1, priceMinor:10000, currency:'THB', servings:[1], uncertainProductCount:0 };
const input = (weight:number, preferred:number|null=3) => ({...request({maxDailyPills:preferred}), scoring:patchScoring(undefined,{profile:'fewest_pills',weights:{pills:weight,products:0,price:0,servings:0}})});
const base = {locale:'en',destinationCountry:'TH',idempotencyKey:'importance-create-0001',targets:[{name:'Vitamin D3',amount:2000,unit:'IU',basis:'supplemental'}]};
function target(amount:number,weight:number,unit='mcg',basis='supplemental') {
  return {...request(),scoring:patchScoring(undefined,{weights:{nutrients:{d3:weight}}}),targets:canonicalizeTargets({targets:[{subjectId:'d3',name:'Vitamin D3',amount,unit,basis}]}).targets};
}
const exposure=(n:number)=>new Map([['d3',BigInt(n)*1000n]]);
test('IMP-01 fractional importance validates and persists; unsupported precision has its own field error',()=>{
  const prepared=prepareSimpleRequest({...base,scoring:{weights:{pills:.543}}},fixtureSnapshot());
  assert.ok(!isAgenticErrorResult(prepared)); assert.equal(prepared.scoring?.weights.pills,.543);
  assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan,{...base,scoring:{weights:{pills:.543}}}),[]);
  for(const value of [-.1,2.1,'1',.0000001]) {
    assert.throws(()=>validateWeight(value,'scoring.weights.pills'),/scoring.weights.pills/);
    assert.ok(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan,{...base,scoring:{weights:{pills:value}}}).some(x=>x.fieldPath==='scoring.weights.pills'));
  }
});
test('IMP-02 exact sixteen versus three penalties apply once despite preset and obsolete importance',()=>{
  for(const [w,num,den] of [[0,0,1],[.543,30589,12000],[1,169,36],[2,169,18]]) {
    const result=scorePracticalPenalties({...input(w),preferenceImportance:{maxDailyPills:'strong'}},actual);
    assert.deepEqual(result.exact,{numerator:String(num),denominator:String(den)});
  }
});
test('IMP-03 zero removes its component; fractional importance scales every preference/objective exactly',()=>{
  for(const preference of [null,0,3]) for(const weight of [0,.543,1,2]) {
    const score=scorePracticalPenalties(input(weight,preference),actual);
    const unit=preference===null?16/60: .25*((16-preference)/(preference||1))**2;
    assert.ok(Math.abs(score.total-weight*unit)<1e-12);
  }
});
test('IMP-04 weights preserve positive amounts and symmetric nutrient fitting',()=>{
  for(const w of [0,.543,1,2]) {
    const r=target(50,w);
    for(const dose of [25,75]) assert.equal(weightedDoseFitScore(r,exposure(dose)).total,w*.5);
    assert.equal(r.targets[0].requestedAmount,50);
  }
});
test('IMP-05 a weight alone never invents an incidental objective; safety and continued-dose penalties remain independent',()=>{
  const r={...target(50,0),targets:[],safetyCeilings:[{subjectId:'d3',name:'Vitamin D3',maxAmount:100,maxUnit:'mcg'}]};
  assert.equal(weightedDoseFitScore(r,exposure(50)).total,0);
  assert.equal(weightedDoseFitScore(r,exposure(150)).total,1);
  const current=canonicalizeCurrents([{subjectId:'d3',name:'Vitamin D3',dailyAmount:25,unit:'mcg',sourceId:'continued'}]); assert.ok(Array.isArray(current));
  assert.equal(weightedDoseFitScore({...r,currentSupplements:current,scoring:patchScoring(undefined,{weights:{nutrients:{d3:.543}}})},exposure(50)).total,.543);
});
test('IMP-06 zero target minimises fixed and new exposure on its basis, while zero weight ignores fitting',()=>{
  assert.equal(weightedDoseFitScore(target(0,1),exposure(50)).total,2);
  assert.equal(weightedDoseFitScore(target(0,0),exposure(50)).total,0);
  const diet=canonicalizeCurrents([{subjectId:'d3',name:'Vitamin D3',dailyAmount:25,unit:'mcg',sourceId:'food'}]); assert.ok(Array.isArray(diet));
  assert.equal(weightedDoseFitScore({...target(0,1,'mcg','total_daily'),dietaryIntake:diet},exposure(50)).total,3);
  assert.equal(weightedDoseFitScore({...target(0,1),dietaryIntake:diet},exposure(50)).total,2);
});
test('IMP-07 reviewed scale is unit invariant and unsupported zero scales receive explicit errors',()=>{
  assert.deepEqual(exactDoseFit(weightedDoseFitScore(target(0,.543,'IU'),exposure(50))),exactDoseFit(weightedDoseFitScore(target(0,.543),exposure(50))));
  const zero={...base,targets:[{name:'Vitamin D3',amount:0,unit:'IU'}]};
  assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan,zero),[]);
  assert.ok(!isAgenticErrorResult(prepareSimpleRequest(zero,fixtureSnapshot())));
  const unknown=prepareSimpleRequest({...zero,targets:[{name:'Unreviewed nutrient',amount:0,unit:'mg'}]},fixtureSnapshot());
  assert.ok(isAgenticErrorResult(unknown)); assert.match(unknown.error.message,/scale/i);
});
test('IMP-08 exact finite-pool minimum has monotone unweighted pill loss as importance increases',()=>{
  const pool=[{pills:1,loss:.9},{pills:4,loss:.2},{pills:16,loss:0}];
  let previous=Infinity;
  for(const w of [0,.1,.543,1,2]) {
    const ranked=pool.map(row=>({...row,score:row.loss+scorePracticalPenalties(input(w),{...actual,dailyPills:row.pills,pillLowerBound:row.pills}).total})).sort((a,b)=>a.score-b.score||a.pills-b.pills);
    const unweighted=Math.max(0,ranked[0].pills-3)**2/36; assert.ok(unweighted<=previous); previous=unweighted;
  }
});
test('IMP-10 resets differ from zero; policy hash changes and web coefficients stay intact',()=>{
  const saved=patchScoring(undefined,{profile:'fewest_pills',weights:{pills:.543}});
  assert.equal(patchScoring(saved,{}).weights.pills,.543);
  assert.equal(effectiveWeights(patchScoring(saved,{weights:{pills:null}})).axes.pills,2);
  assert.equal(effectiveWeights(patchScoring(saved,{weights:{pills:0}})).axes.pills,0);
  assert.notEqual(effectiveWeights(saved).hash,effectiveWeights(patchScoring(saved,{weights:null})).hash);
  assert.equal(scorePracticalPenalties({...request({maxDailyPills:3}),preferenceImportance:{maxDailyPills:'strong'}},actual).preferences.maxDailyPills.penalty,169/9);
});

test('IMP-06 zero-target coverage is binary and never verifies unknown exposure as zero',()=>{
  const ledger={totals:new Map(),provenance:[],unknownSubjectIds:[]};
  const known=coverageSummary(target(0,1),ledger)[0]; assert.equal(known.fullyMet,true); assert.equal(known.coveragePercent,100);
  for(const r of [{...target(0,1),unknownIntakeSubjectIds:['d3']},{...target(0,1),estimatedIntakeSubjectIds:['d3']}]) {
    const row=coverageSummary(r,ledger)[0]; assert.equal(row.fullyMet,false); assert.equal(row.coveragePercent,0);
  }
});
