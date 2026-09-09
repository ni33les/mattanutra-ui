import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { runtime, rpcWithTaskExecutor } from "../ax-refinement/helpers.ts";
import { executeTool } from "../../lib/agentic/commerce/execute.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";
import { fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { replaceCatalogueSnapshot } from "../../lib/agentic/catalogue/snapshot.ts";
const request={destinationCountry:"TH",locale:"en",optimization:"balanced",profile:{ageYears:38,lifeStage:"adult"},requirements:{},targets:[{name:"Vitamin D3",amount:1000,unit:"IU"}]};
afterEach(uninstallGoldCatalogue);
async function fixture(name: string) {
  installGoldCatalogue(); replaceCatalogueSnapshot({...fixtureSnapshot(),runtimeRevision:11});
  const app=runtime(name), plan=await rpcWithTaskExecutor(app,"plan",{operation:"create",idempotencyKey:name,request,responseView:"full"});
  assert.equal(plan.status,"ready");
  return {app,call:{...app,now:app.now!,expectedRevision:Number(plan.revision),planHandle:String(plan.planHandle),idempotencyKey:name+"-execute"}};
}

test("LOCK-CHECKOUT-01 checkout preparation invokes no payment port under a transaction lock", async () => {
  const {app,call}=await fixture("lock-checkout-preparation");let locked=false,calls=0;
  const store:AgenticStore={...app.store,transaction:work=>app.store.transaction(async tx=>{locked=true;try{return await work(tx);}finally{locked=false;}})};
  const result=await executeTool({...call,store,payment:{createCheckoutSession:async input=>{calls++;assert.equal(locked,false,"payment dependencies run before acquiring plan/order locks");return app.payment.createCheckoutSession(input);}}});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);
});

test("LOCK-CHECKOUT-02 catalogue changes after preparation prevent new checkout but preserve frozen recovery", async () => {
  const {app,call}=await fixture("lock-checkout-freshness");let current=true,fences=0;
  const wrap=(base:AgenticStore):AgenticStore=>({...base,transaction:work=>base.transaction(tx=>work(wrap(tx))),isCatalogueRevisionCurrent:async expected=>{fences++;assert.equal(expected,11);return current;}});
  const store=wrap(app.store);current=false;
  const stale=await executeTool({...call,store});assert.equal(stale.ok,false,JSON.stringify(stale));
  assert.equal((stale as {error?:{reasonCode:string}}).error?.reasonCode,"availability_changed");assert.equal(fences,1);
  current=true;const created=await executeTool({...call,store});assert.equal(created.ok,true,JSON.stringify(created));
  current=false;const previous=fences;
  const recovered=await executeTool({...call,store,idempotencyKey:call.idempotencyKey+"-recover"});
  assert.deepEqual(recovered,created);assert.equal(fences,previous,"existing orders preserve their frozen facts");
});
