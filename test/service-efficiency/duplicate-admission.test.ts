import { publicRequest } from "../ax-refinement/helpers.ts";
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
  const results=await Promise.all(work);assert.equal(beforeRelease,2);assert.ok(results.every(result=>result.ok));assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));
  assert.equal((await app.store.listPlanIdsByPrincipal(app.scope.principalScope!)).length,1);
});

test("LOCK-DUP-02 concurrent checkout preparation is independent and atomic writes return one frozen order", async () => {
  installGoldCatalogue(); const app=runtime("lock-checkout-duplicates");
  const created=await rpcWithTaskExecutor(app,"plan",{idempotencyKey:"lock-checkout-plan",...publicRequest({...request, requirements:{productDoses:[{productId:"prd_b1111111111111111111111111111111",servingsPerDay:1}]}})});
  const option=(created.choices as {products: unknown[]}[])[0];
  assert.ok(option?.products.length, "Duplicate checkout must exercise a real eligible purchase");
  const plan=await rpcWithTaskExecutor(app,"plan",{planHandle:created.planHandle,expectedRevision:created.revision,idempotencyKey:"lock-checkout-select"});
  assert.equal(plan.status,"ready",JSON.stringify(plan));
  let release!:()=>void, first!:()=>void, entered=0, beforeRelease=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{first=resolve;});
  setExecuteFreshGateForTests(gate);setExecuteFreshEnteredForTests(()=>{entered++;first();});
  const input={...app,now:app.now!,expectedRevision:Number(plan.revision),planHandle:String(plan.planHandle),idempotencyKey:"lock-checkout-request"};
  const work=[executeTool(input),executeTool(input)];
  try {await ready;await new Promise(resolve=>setImmediate(resolve));beforeRelease=entered;}
  finally {release();}
  const results=await Promise.all(work);assert.equal(beforeRelease,2);assert.ok(results.every(result=>result.ok),JSON.stringify(results));assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));
});
