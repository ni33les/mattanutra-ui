import { evidenceTool } from '../../lib/agentic/evidence/tool.ts';
import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { handleCompletedJsonRpc } from '../helpers/completed-mcp-client.ts';
import { createAgenticRuntime } from '../../lib/agentic/runtime.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from '../helpers/gold-catalogue.ts';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { SafetyGuidance } from '../../lib/agentic/plan/types.ts';

beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
type Runtime = ReturnType<typeof createAgenticRuntime>;
async function call(app:Runtime, name:string, arguments_:unknown) {
  if (name === 'evidence') return evidenceTool({ ...app, ...(arguments_ as {planHandle:string;expectedRevision:number;optionId:string;ingredientId?:string}) });
  const reply=await handleCompletedJsonRpc(app,{id:1,method:'tools/call',params:{name,arguments:arguments_}});
  assert.ok(reply?.result?.structuredContent,JSON.stringify(reply));return reply.result.structuredContent as Record<string,unknown>;
}
const request={locale:'en',destinationCountry:'TH',idempotencyKey:'retained-public-initial',targets:[{name:'Vitamin D3',amount:2000,unit:'IU',basis:'supplemental'}]};

test('AE-03 AX2-07 AX3-03 AX4-02 AX5-02 AX6-02 precise flat validation is bounded, repeatable and free of schema/stack dumps',async()=>{
  const app=createAgenticRuntime();
  for(const input of [{},{...request,idempotencyKey:'short'},{...request,scoring:{weights:{pills:3}}},{...request,unrecognised:true}]){
    const first=await call(app,'plan',input);assert.equal(first.ok,false);assert.deepEqual(await call(app,'plan',input),first);
    const error=first.error as {fieldPath:string;issues?:Array<{fieldPath:string;messageKey:string}>};assert.ok(error.fieldPath);
    assert.ok(Buffer.byteLength(JSON.stringify(first))<2048);assert.doesNotMatch(JSON.stringify(first),/Failed validating|On instance|\$defs|Schema:|stack trace|instance path/i);
    if(error.issues)for(const issue of error.issues){assert.ok(issue.fieldPath);assert.ok(issue.messageKey);}
  }
});
test('AE-06 AE-07 AE-08 AX2-01 AX2-02 unassessed context adds no unsolicited warning or medical clearance and preserves checkout boundaries',async()=>{
  const app=createAgenticRuntime();
  const created=await call(app,'plan',{...request,medicationCodes:['warfarin'],conditionCodes:['diabetes']});assert.equal(created.ok,true);
  assert.doesNotMatch(String(created.summary),/not been assessed|cleared|medically approved/i);assert.doesNotMatch(JSON.stringify(created),/checkoutUrl|paymentIntent|orderHandle|feedbackInvitation|acknowledge_safety/);
  assert.equal(created.selectedOptionId,null);assert.equal(created.nextAction,'confirm_with_user');
  assert.deepEqual(await call(app,'plan',{planHandle:created.planHandle}),created);
});
test('AE-09 AX4-06 AX6-03 quantified exposure remains 1104 without unsolicited interaction or missing-reference advice',()=>{
  const result=internalFixture(),first=result.selected!.basket[0];
  const interaction={guidanceId:'interaction:omega',code:'medication_interaction',ruleId:'omega-anticoagulant',rulesVersion:'frozen',kind:'interaction',action:'review',severity:'high',supplementIds:['sup_omega'],productIds:[first.productId],nutrientName:'Omega-3',exposure:1104,threshold:null,unit:'mg',sourceScope:'supplemental',message:'Preserved source',contributors:[]} as SafetyGuidance;
  const missing={...interaction,guidanceId:'missing:omega',code:'incomplete_information' as const,kind:'incomplete_information' as const,ruleId:'ul:missing:omega'};
  for(const locale of ['en','th','zh-CN']){
    const selected={...result.selected!,basket:[{...first,requestedNutrients:[{supplementId:'sup_omega',name:'Omega-3',amount:1104,unit:'mg' as const}],incidentalNutrients:[],labelledFacts:[]}],safety:{...result.selected!.safety!,guidance:[interaction,missing]}};
    const decision=presentDecision({...result,selected,alternatives:[],requestSnapshot:{...result.requestSnapshot,locale,targets:[{supplementId:'sup_omega',name:'Omega-3',amount:1000,unit:'mg',basis:'supplemental'}]}},'cap_retained_interaction_fixture',1);
    assert.ok('choices'in decision);const row=decision.choices[0].ingredients.find(row=>row.ingredientId==='sup_omega');assert.ok(row);
    assert.equal(row.supplied,1104);assert.deepEqual(row.advice??[],[]);
    assert.equal(selected.safety.guidance[0].exposure,1104);assert.equal(selected.safety.guidance[1].threshold,null);
    assert.equal(decision.nextAction,'confirm_with_user');for(const advice of row.advice??[])assert.ok(advice.message.length<=240);
  }
});
test('B-SECURITY-01 shared-store principal isolation protects plan, internal fact lookup and feedback with valid returned handles',async()=>{
  const alice=createAgenticRuntime({scope:{environment:'dev',tenantScope:'mattanutra',principalScope:'alice'}});
  const bob=createAgenticRuntime({config:alice.config,store:alice.store,scope:{...alice.scope,principalScope:'bob'}});
  const plan=await call(alice,'plan',request);assert.equal(plan.ok,true);
  const choice=(plan.choices as Array<{optionId:string;ingredients:Array<{ingredientId:string}>}>)[0];assert.ok(choice?.ingredients.length);
  for(const [tool,args]of [['plan',{planHandle:plan.planHandle}],['evidence',{planHandle:plan.planHandle,expectedRevision:plan.revision,optionId:choice.optionId,ingredientId:choice.ingredients[0].ingredientId}],['feedback',{planHandle:plan.planHandle,expectedRevision:plan.revision,consentConfirmed:true,idempotencyKey:'retained-isolation-feedback',summary:'Not mine'}]] as const){
    const denied=await call(bob,tool,args);assert.equal(denied.ok,false);assert.equal((denied.error as {reasonCode:string}).reasonCode,'not_found');
  }
  assert.deepEqual(await call(alice,'plan',{planHandle:plan.planHandle}),plan);
});
