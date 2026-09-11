import assert from 'node:assert/strict';
import test from 'node:test';
import { fewestPillsWins } from './agentic-det-pack.test.ts';
import type { StackOption } from '../lib/agentic/plan/types.ts';
import type { matchPlan } from '../lib/agentic/plan/matching.ts';

function routine(id:string,dose:number,units:number):StackOption {
  return {candidateKey:id,doseFit:{total:dose},dailyPills:units,basket:[{
    productId:id,servingsPerDay:1,dailyPills:units,pillCountKnown:true,quantity:1,unitPriceMinor:10000,lineTotalMinor:10000,
    administration:{route:'oral',physicalUnit:'tablet',unitsPerServing:units,doseIncrement:1,packQuantity:30,
      provenance:{status:'verified',sourceUrl:'https://fixture.example/label',sourceText:'Controlled whole-tablet fixture',verifiedAt:'2026-09-11'}}
  }]} as unknown as StackOption;
}
function result(selected:StackOption,alternatives:StackOption[]=[]):ReturnType<typeof matchPlan> {
  return {selected,alternatives} as ReturnType<typeof matchPlan>;
}

test('DET5-PROFILE-01 a practical fewest-pills winner may trade raw dose accuracy for the approved burden penalties',()=>{
  // Fewest-pills multipliers 4/2/1/4; no numerical preferences.
  // Practical: 0.1 + 0.2/3 + 0.1 + 0.005 = 0.271666…
  // Exact:     0   + 2/3   + 0.1 + 0.005 = 0.771666…
  const practical=routine('practical',0.1,1),exact=routine('exact',0,10);
  assert.equal(fewestPillsWins({fewest:result(practical),balanced:result(exact)}),true);
});
test('DET5-PROFILE-02 reject a closer-dose basket when its independent practical penalty is worse',()=>{
  const practical=routine('practical',0.1,1),exact=routine('exact',0,10);
  assert.equal(fewestPillsWins({fewest:result(exact),balanced:result(practical)}),false);
});
