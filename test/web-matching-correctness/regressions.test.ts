import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { productRecommendationClientContextFromPlan } from '../../lib/task-work-items.ts';
import { recommendWithMatcher, webTargetsForNeeds, matcherProductCoversNeed } from '../../lib/matcher/adapters/web.ts';
import { nutrientNameMatchesTarget } from '../../lib/nutrient-identity.ts';
import { contributionFor } from '../../lib/matcher/candidates.ts';
import { scorePracticalPenalties } from '../../lib/matcher/practical-scoring.ts';
import { whyProductMatches } from '../../lib/product-recommendation-metrics.ts';
import { request, product } from '../matcher/flexible-v5-fixtures.ts';
import type { ProductCandidate, ProductRecommendationNeed } from '../../lib/product-recommendation-types.ts';
const frozen = JSON.parse(readFileSync('test/web-matching-correctness/reported-catalogue.json','utf8')) as {needs: ProductRecommendationNeed[]; candidates: ProductCandidate[]};
const need = (name: string) => { const row=frozen.needs.find(n=>n.displayName===name); assert.ok(row); return row; };
const named = (id: string) => { const row=frozen.candidates.find(p=>p.id===id); assert.ok(row); return structuredClone(row); };
const fish=()=>named('5c7c94ab-ea40-4f7e-81be-849c96e8dbca');
const context=()=>productRecommendationClientContextFromPlan({diet:'vegan',form:'capsules',allergies:['milk'],maxPills:'1-3',budget:'2500-5000',age:'40',sex:'male',supplements:'none'},[],[]);

test('WM-01 real questionnaire vegan answer excludes fish oil while preserving capsule preference',()=>{
 const result=recommendWithMatcher({needs:[need('Omega-3')],candidates:[fish()],clientContext:context(),clientSex:'male'});
 assert.equal(result.recommendations.length,0);
 assert.equal(context().preferredForm,'capsules');
});
test('WM-02 food milk allergy excludes a labelled whey product independently of dietary preference',()=>{
 const p=fish();p.title='Whey protein with Omega-3';p.matchingFacts={...p.matchingFacts!,omegaSource:'none',dietarySource:'any'};
 const ctx=productRecommendationClientContextFromPlan({diet:'omnivore',form:'capsules',allergies:['milk']},[],[]);
 assert.equal(recommendWithMatcher({needs:[need('Omega-3')],candidates:[p],clientContext:ctx}).recommendations.length,0);
});
test('WM-03 absence of allergy and non-vegan answers do not exclude fish',()=>{
 assert.ok(recommendWithMatcher({needs:[need('Omega-3')],candidates:[fish()],clientContext:productRecommendationClientContextFromPlan({diet:'balanced',allergies:['none'],form:'capsules'},[],[])}).recommendations.length>0);
});
test('WM-04 billion-CFU target preserves exact ten-billion quantity',()=>{
 const t=webTargetsForNeeds([need('Probiotics')]).targets[0];assert.equal(t.requestedAmount,10_000_000_000);assert.equal(t.requestedUnit,'CFU');
});
test('WM-05 million-CFU target scales amount together with unit',()=>{
 const n={...need('Probiotics'),targetDose:{amount:250,unit:'million_cfu' as const,originalText:'250 million CFU'}};
 assert.equal(webTargetsForNeeds([n]).targets[0].requestedAmount,250_000_000);
});
test('WM-06 active curcumin does not equal raw turmeric or unspecified extract',()=>{
 for(const name of ['Turmeric','Turmeric powder','Turmeric extract','Curcuma longa'])assert.equal(nutrientNameMatchesTarget('Curcumin',name),false,name);
 assert.equal(nutrientNameMatchesTarget('Curcumin','Curcumin'),true);
 assert.equal(nutrientNameMatchesTarget('Curcuminoids','Curcuminoids'),true);
});
test('WM-07 an incorrect subject mapping cannot credit raw botanical mass as active curcumin',()=>{
 const p=product('powder',{},100,{contributionSubjectIds:['curcumin'],labelledContributions:[{subjectId:'curcumin',name:'Turmeric',amount:400,unit:'mg',confidence:'high'}]});
 assert.equal(contributionFor(p,'Curcumin','curcumin').length,0);
 assert.equal(matcherProductCoversNeed(p,need('Curcumin')),false);
});
test('WM-08 measured active content contributes without counting parent powder twice',()=>{
 const p=product('standardized',{},100,{labelledContributions:[{subjectId:'turmeric',name:'Turmeric extract',amount:500,unit:'mg',confidence:'high'},{subjectId:'curcumin',name:'Curcumin',amount:50,unit:'mg',confidence:'high'}]});
 assert.deepEqual(contributionFor(p,'Curcumin','curcumin').map(f=>f.amount),[50]);
});
const actual=(extra={})=>({dailyPills:null,pillLowerBound:3,productCount:2,priceMinor:100000,currency:'THB',servings:[1,1],uncertainProductCount:1,monthlyPriceMinor:null,...extra});
const web=(extra={})=>request({selectorMode:'web_single',maxDailyPills:3,preferenceImportance:{maxDailyPills:'strong'},maxPriceMinor:500000,pricePreferenceBasis:'monthly_30_days',...extra});
test('WM-09 strong web pill preference also weights unknown quantity burden without inventing pills',()=>{
 const strong=scorePracticalPenalties(web(),actual());const normal=scorePracticalPenalties(web({preferenceImportance:{maxDailyPills:'normal'}}),actual());
 assert.equal(strong.components.uncertainty,1);assert.equal(normal.components.uncertainty,.25);
 assert.equal(strong.preferences.maxDailyPills.actual,null);assert.equal(strong.preferences.maxDailyPills.actualLowerBound,3);
});
test('WM-10 unavailable monthly cost retains first-order cost objective, not a fabricated monthly overrun',()=>{
 const a=scorePracticalPenalties(web(),actual()),b=scorePracticalPenalties(web(),actual({priceMinor:200000}));
 assert.equal(a.components.price,.05);assert.equal(b.components.price,.1);
 assert.equal(a.preferences.maxPriceMinor.actual,null);assert.equal(a.preferences.maxPriceMinor.penalty,0);
});
test('WM-11 verified monthly costs retain their actual budget basis',()=>{
 const a=scorePracticalPenalties(web(),actual({monthlyPriceMinor:600000}));
 assert.equal(a.preferences.maxPriceMinor.actual,600000);assert.equal(a.components.price,0);assert.equal(a.preferences.maxPriceMinor.penalty,.01);
});
test('WM-12 unquantified modest extra product is a penalty not an eligibility block',()=>{
 const a=scorePracticalPenalties(web(),actual());assert.ok(a.total>0);assert.equal(a.complete,false);
 const result=recommendWithMatcher({needs:[need('Omega-3')],candidates:[fish()],maxProducts:0,clientContext:{pillLimit:'0'}});
 assert.ok(result.diagnostics.matching?.options.some(o=>o.purchaseEligible));
});
test('WM-13 match explanations do not call negligible B12 a strong match or claim false shares',()=>{
 const p=named('44f3a282-8c3e-4f9d-898a-a68d9b27ccbc');
 const text=whyProductMatches(p,[need('Vitamin B12'),need('Theanine')],3,2);
 assert.doesNotMatch(text,/strong match|accounts for|fills an otherwise uncovered/i);
 assert.match(text,/contribut/i);
});
test('WM-14 ingredient identity keeps D3 and EPA form protections',()=>{
 assert.equal(nutrientNameMatchesTarget('EPA','DHA'),false);assert.equal(nutrientNameMatchesTarget('Vitamin D3','Vitamin D2'),false);
 assert.equal(nutrientNameMatchesTarget('Omega-3','EPA'),true);
});
