import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formulationPlanCopy } from '../../lib/formulation-plan-copy.ts';
import { productContainsFoodAllergen } from '../../lib/product-food-allergens.ts';
import { labelledSafetyExposure } from '../../lib/matcher/safety.ts';
import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import { request, product } from '../matcher/flexible-v5-fixtures.ts';
test('WM-15 all questionnaire allergen families match affirmative labels without treating free-from as content',()=>{
 const rows={milk:'Whey protein',eggs:'Egg albumen',fish:'Fish oil',shellfish:'Krill oil',treenuts:'Almond powder',peanuts:'Peanut powder',soy:'Soy lecithin',wheat:'Wheat extract',sesame:'Sesame extract'};
 for(const [code,title] of Object.entries(rows)){
  assert.equal(productContainsFoodAllergen({title,facts:[]},code),true,code);
  assert.equal(productContainsFoodAllergen({title:'Vitamin D3',facts:[]},code),false,code);
 }
 assert.equal(productContainsFoodAllergen({title:'Milk-free vitamin D3',facts:[]},'milk'),false);
 assert.equal(productContainsFoodAllergen({title:'Milk-free',facts:[{name:'Whey protein'}] as never},'milk'),true);
});
test('WM-16 formula copy in every locale avoids unverified pre-match routine promises',()=>{
 for(const locale of ['en','th','zh-CN'] as const){
  const rows=formulationPlanCopy(locale);assert.equal(rows.length,3);assert.ok(rows.every(row=>row.title&&row.body));
  assert.doesNotMatch(JSON.stringify(rows),/vegan|1[-–]3|within your budget/i);
 }
 const store=readFileSync('lib/assessment-store.ts','utf8');assert.equal((store.match(/const marketingPoints = formulationPlanCopy\(locale\)/g)??[]).length,2);
 assert.match(readFileSync('lib/formulation-analysis.ts','utf8'),/Matching pending: no diet, allergy, pill or budget promises/);
});
test('WM-17 exposure accounting cannot turn a mislabelled botanical into active curcumin',()=>{
 const p=product('raw',{},100,{labelledContributions:[{subjectId:'curcumin',name:'Turmeric',amount:400,unit:'mg',confidence:'high'}]});
 const r=request({targets:canonicalizeTargets({targets:[{subjectId:'curcumin',name:'Curcumin',amount:500,unit:'mg'}]}).targets});
 const exposure=labelledSafetyExposure(p,1,r);assert.equal(exposure.has('curcumin'),false);assert.ok(exposure.size>0);
});
