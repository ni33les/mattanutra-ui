import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import postgres from "postgres";
import {createPostgresStore} from "../../lib/agentic/store/postgres.ts";
import {closeSqlPool} from "../../lib/db.ts";
import {planTool,setPlanClaimLatchForTests} from "../../lib/agentic/plan/service.ts";
import {executeTool,setExecuteFreshGateForTests,setExecuteFreshEnteredForTests,resetExecuteLockState} from "../../lib/agentic/commerce/execute.ts";
import {fixtureSnapshot} from "../../lib/agentic/catalogue/fixtures.ts";
import {replaceCatalogueSnapshot} from "../../lib/agentic/catalogue/snapshot.ts";
import {matcherSafetyCeilings,setMatcherSafetyCeilings} from "../../lib/matcher/safety-ceilings.ts";
import {catalogueRecordFingerprint} from "../../lib/catalogue-corrections.ts";
import {installGoldCatalogue,uninstallGoldCatalogue} from "../helpers/gold-catalogue.ts";
import {runtime,rpcWithTaskExecutor} from "../ax-refinement/helpers.ts";
assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=postgres(url.href,{max:4,prepare:false});after(async()=>{uninstallGoldCatalogue();resetExecuteLockState();await closeSqlPool();await sql.end();});
const request={destinationCountry:"TH",locale:"en",optimization:"balanced",profile:{ageYears:38,lifeStage:"adult"},requirements:{},targets:[{name:"Vitamin D3",amount:1000,unit:"IU"}]};
async function fixture(){
  installGoldCatalogue();const [row]=await sql`select revision from catalogue_runtime_revision where singleton`;
  const revision=Number(row.revision);replaceCatalogueSnapshot({...fixtureSnapshot(),runtimeRevision:revision});
  setMatcherSafetyCeilings(matcherSafetyCeilings(),{runtimeRevision:revision,fingerprint:catalogueRecordFingerprint(matcherSafetyCeilings())});
  return runtime(`atomic-${randomUUID()}`,createPostgresStore(sql));
}
test("LOCK-ATOMIC-01 simultaneous real database admission returns one durable plan, operation and task",{timeout:15000},async()=>{
  const app=await fixture(),key="duplicate-admission";let release!:()=>void,entered=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});setPlanClaimLatchForTests(key,gate,()=>{entered++;});
  const call={...app,now:app.now!,payload:{operation:"create" as const,idempotencyKey:key,request}};
  const calls=[planTool(call),planTool(call)];
  try {
    for(let i=0;i<100&&entered<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(entered,2);release();const results=await Promise.all(calls);
    assert.ok(results.every(row=>row.ok),JSON.stringify(results));assert.deepEqual(results[0],results[1]);
    const plans=await app.store.listPlanIdsByPrincipal(app.scope.principalScope!);assert.equal(plans.length,1);
    const rows=await sql`select status,record_json->>'taskId' as task from agentic_plan_operations where plan_id=${plans[0]}::uuid`;
    assert.equal(rows.length,1);assert.ok(rows[0].task);
    assert.equal(rows[0].status,"queued","HTTP callers cannot execute the admitted task");
    assert.equal((await sql`select id from tasks where id=${rows[0].task}::uuid`).length,1);
  } finally {release();setPlanClaimLatchForTests(key,null);await Promise.allSettled(calls);await app.store.deletePrincipalScope(app.scope.principalScope!);}
});

test("LOCK-ATOMIC-02 simultaneous checkout owns one frozen order and stale catalogue cannot replace it",{timeout:15000},async()=>{
  const app=await fixture();
  const created=await rpcWithTaskExecutor(app,"plan",{operation:"create",idempotencyKey:"atomic-checkout-plan",request,responseView:"full"});
  const option=created.options.find(row=>row.purchaseEligible && row.basket.length && row.roles?.includes("closest_dose"));
  assert.ok(option, "Atomic checkout requires an explicitly selected purchase");
  const plan=await rpcWithTaskExecutor(app,"plan",{operation:"select",planHandle:created.planHandle,expectedRevision:created.revision,candidateKey:option.candidateKey,idempotencyKey:"atomic-checkout-select",responseView:"full"});
  assert.equal(plan.status,"ready",JSON.stringify(plan));
  let release!:()=>void,entered=0;const gate=new Promise<void>(resolve=>{release=resolve;});
  setExecuteFreshGateForTests(gate);setExecuteFreshEnteredForTests(()=>{entered++;});
  const call={...app,now:app.now!,expectedRevision:Number(plan.revision),planHandle:String(plan.planHandle),idempotencyKey:"checkout-duplicate"};
  const calls=[executeTool(call),executeTool(call)];
  try {
    for(let i=0;i<100&&entered<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(entered,2);release();const results=await Promise.all(calls);
    assert.ok(results.every(row=>row.ok),JSON.stringify(results));assert.deepEqual(results[0],results[1]);
    const plans=await app.store.listPlanIdsByPrincipal(app.scope.principalScope!);assert.equal(plans.length,1);
    const orders=await sql`select * from agentic_orders where plan_id=${plans[0]}::uuid`;assert.equal(orders.length,1);
    const rollback=new Error("rollback catalogue fixture");
    await assert.rejects(sql.begin(async tx=>{
      await tx`update catalogue_runtime_revision set revision=revision+1 where singleton`;
      const txStore=createPostgresStore(tx, true);
      const recovered=await executeTool({...call,store:txStore,idempotencyKey:"atomic-checkout-recovery"});
      assert.deepEqual(recovered,results[0]);
      assert.deepEqual((await tx`select * from agentic_orders where plan_id=${plans[0]}::uuid`)[0],orders[0]);
      throw rollback;
    }),error=>error===rollback);
  } finally {release();resetExecuteLockState();await Promise.allSettled(calls);await app.store.deletePrincipalScope(app.scope.principalScope!);}
});
