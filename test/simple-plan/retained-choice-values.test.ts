import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { StackOption } from '../../lib/agentic/plan/types.ts';

// Original AX5/AX6 prices and pill totals; request and composition are explicit,
// so the percentages are independently calculated rather than copied labels.
test('AX5-03 AX5-04 AX6-01 AX6-05 successive single recommendations retain original prices, doses, pills and honest coverage',()=>{
  const base=internalFixture(), line=base.selected!.basket[0];
  const inputs=[{id:'a',price:467300,pills:10,products:4,dose:490},{id:'b',price:292100,pills:7,products:3,dose:450},{id:'c',price:333000,pills:8,products:5,dose:450}];
  const options=inputs.map((x,index)=>({...base.selected!,optionId:x.id,roles:[index===0?'best_match':index===1?'lower_cost':'simpler'],dailyPills:x.pills,totalPriceMinor:x.price,safety:{guidance:[]},basket:Array.from({length:x.products},(_,i)=>({...line,productId:`prd_${x.id}_${i}`,quantity:1,servingsPerDay:1,administration:{...line.administration!,unitsPerServing:i===0?x.pills-x.products+1:1},unitPriceMinor:i===0?x.price:0,lineTotalMinor:i===0?x.price:0,dailyPills:i===0?x.pills:0,requestedNutrients:i===0?[{supplementId:'sup_test',name:'Magnesium',amount:x.dose,unit:'mg'}]:[],incidentalNutrients:[],labelledFacts:[]})),coverage:[{supplementId:'sup_test',name:'Magnesium',currentAmount:0,deliveredAmount:x.dose,intakeCertainty:'known',totalExposureComplete:true}]})) as unknown as StackOption[];
  const rounds=options.map((selected,index)=>{
    const decision=presentDecision({...base,selected,alternatives:options.filter(row=>row!==selected),requestSnapshot:{...base.requestSnapshot,targets:[{supplementId:'sup_test',name:'Magnesium',amount:500,unit:'mg',basis:'supplemental'}],intake:[],currentSupplements:[]}},'cap_retained_choice_prices',index+1);
    assert.ok('choices'in decision);assert.equal(decision.choices.length,1);return decision;
  });
  for(const [index,decision]of rounds.entries()){
    const choice=decision.choices[0],expected=inputs[index];assert.equal(choice.summary.goodsPrice,expected.price/100);assert.equal(choice.summary.pillCount,expected.pills);assert.equal(choice.products.length,expected.products);
    assert.equal(choice.products.reduce((sum,row)=>sum+row.lineTotal!,0),expected.price/100);
    const ingredient=choice.ingredients.find(row=>row.ingredientId==='sup_test');assert.ok(ingredient);assert.equal(ingredient.supplied,expected.dose);assert.equal(ingredient.gap,500-expected.dose);
    assert.equal(choice.summary.coveragePercent,100*expected.dose/500);
  }
  assert.equal((rounds[0].choices[0].summary.goodsPrice!-rounds[1].choices[0].summary.goodsPrice!)*100,175200);
  assert.equal(rounds[0].choices[0].summary.pillCount!-rounds[1].choices[0].summary.pillCount!,3);
  assert.equal(rounds[0].choices[0].summary.coveragePercent!-rounds[1].choices[0].summary.coveragePercent!,8);
  assert.doesNotMatch(JSON.stringify(rounds),/save.*(?:monthly|recurring)/i);
});
test('AX8-01 the original 18900-minor focus product retains two verified nutrients and an unverified B12 fact',()=>{
  const base=internalFixture(), first=base.selected!.basket[0];
  const requestedNutrients=[{supplementId:'sup_b1',name:'Vitamin B1',amount:1.5,unit:'mg' as const},{supplementId:'sup_b6',name:'Vitamin B6',amount:2,unit:'mg' as const}];
  const targets=[...requestedNutrients,{supplementId:'sup_b12',name:'Vitamin B12',amount:250,unit:'mcg' as const}].map(row=>({...row,basis:'supplemental' as const}));
  const selected={...base.selected!,dailyPills:1,totalPriceMinor:18900,safety:{guidance:[]},basket:[{...first,productId:'prd_focus',quantity:1,servingsPerDay:1,dailyPills:1,unitPriceMinor:18900,lineTotalMinor:18900,requestedNutrients,incidentalNutrients:[],labelledFacts:[...requestedNutrients.map(row=>({...row,confidence:'high',mappingStatus:'verified'})),{...targets[2],confidence:'low',mappingStatus:'unverified'}]}]} as unknown as StackOption;
  const decision=presentDecision({...base,selected,alternatives:[],requestSnapshot:{...base.requestSnapshot,targets,intake:[],currentSupplements:[]}},'cap_retained_focus_facts',1);
  assert.ok('choices'in decision);const choice=decision.choices[0];assert.equal(choice.products[0].lineTotal,189);assert.equal(choice.summary.pillCount,1);assert.equal(choice.products[0].servingsPerDay,1);
  assert.equal(choice.ingredients.length,3);assert.equal(choice.ingredients.find(row=>row.ingredientId==='sup_b1')?.supplied,1.5);assert.equal(choice.ingredients.find(row=>row.ingredientId==='sup_b6')?.supplied,2);assert.equal(choice.ingredients.find(row=>row.ingredientId==='sup_b12')?.supplied,null);
});

test('FIX-01 independent optional coverage honours published two-decimal precision and rejects inconsistent gaps',async()=>{
  const {optionalTargetAmountsAreCoherent}=await import('../helpers/optional-target-amounts.ts');
  const row={importance:'optional',requestedAmount:150,quantifiedExposureAmount:100,currentAmount:0,status:'partial',remainingGap:50,excess:0,coveragePercent:66.66};
  assert.equal(optionalTargetAmountsAreCoherent(row,150),true);
  assert.equal(optionalTargetAmountsAreCoherent({...row,remainingGap:49},150),false);
  assert.equal(optionalTargetAmountsAreCoherent({...row,coveragePercent:67},150),false);
  assert.equal(optionalTargetAmountsAreCoherent(undefined,150),false);
});
