import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { runtime, rpcWithTaskExecutor } from "../ax-refinement/helpers.ts";
import { planTool, setPlanClaimLatchForTests, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { executeTool, setExecuteFreshGateForTests, setExecuteFreshEnteredForTests, resetExecuteLockState } from "../../lib/agentic/commerce/execute.ts";

const request={destinationCountry:"TH",locale:"en",optimization:"balanced",profile:{ageYears:38,lifeStage:"adult"},requirements:{},targets:[{name:"Vitamin D3",amount:1000,unit:"IU"}]};
afterEach(()=>{resetPlanCreateInflightForTests();resetExecuteLockState();uninstallGoldCatalogue();});

test("LOCK-DUP-01 duplicate plan admission reaches its database boundary without a process Promise queue", async () => {
  installGoldCatalogue(); const app=runtime("lock-plan-duplicates"), key="lock-plan-duplicate-request";
  let release!:()=>void, first!:()=>void, entered=0, beforeRelease=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{first=resolve;});
  setPlanClaimLatchForTests(key,gate,()=>{entered++;first();});
  const payload={operation:"create" as const,idempotencyKey:key,request};
  const work=[planTool({...app,now:app.now!,payload}),planTool({...app,now:app.now!,payload})];
  try {await ready;await new Promise(resolve=>setImmediate(resolve));beforeRelease=entered;}
  finally {release();setPlanClaimLatchForTests(key,null);}
  const results=await Promise.all(work);assert.equal(beforeRelease,2);assert.ok(results.every(result=>result.ok));assert.deepEqual(results[0],results[1]);
  assert.equal((await app.store.listPlanIdsByPrincipal(app.scope.principalScope!)).length,1);
});

test("LOCK-DUP-02 concurrent checkout preparation is independent and atomic writes return one frozen order", async () => {
  installGoldCatalogue(); const app=runtime("lock-checkout-duplicates");
  const created=await rpcWithTaskExecutor(app,"plan",{operation:"create",idempotencyKey:"lock-checkout-plan",request,responseView:"full"});
  const option=created.options.find(row=>row.purchaseEligible && row.basket.length && row.roles?.includes("closest_dose"));
  assert.ok(option, "Duplicate checkout must exercise a real eligible purchase");
  const plan=await rpcWithTaskExecutor(app,"plan",{operation:"select",planHandle:created.planHandle,expectedRevision:created.revision,candidateKey:option.candidateKey,idempotencyKey:"lock-checkout-select",responseView:"full"});
  assert.equal(plan.status,"ready",JSON.stringify(plan));
  let release!:()=>void, first!:()=>void, entered=0, beforeRelease=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{first=resolve;});
  setExecuteFreshGateForTests(gate);setExecuteFreshEnteredForTests(()=>{entered++;first();});
  const input={...app,now:app.now!,expectedRevision:Number(plan.revision),planHandle:String(plan.planHandle),idempotencyKey:"lock-checkout-request"};
  const work=[executeTool(input),executeTool(input)];
  try {await ready;await new Promise(resolve=>setImmediate(resolve));beforeRelease=entered;}
  finally {release();}
  const results=await Promise.all(work);assert.equal(beforeRelease,2);assert.ok(results.every(result=>result.ok),JSON.stringify(results));assert.deepEqual(results[0],results[1]);
});
