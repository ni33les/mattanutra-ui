import { publicRequest } from "../ax-refinement/helpers.ts";
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
import { whileWriterHeld } from "../helpers/held-writer.ts";
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
    assert.ok(results.every(row=>row.ok),JSON.stringify(results));assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));
    const plans=await app.store.listPlanIdsByPrincipal(app.scope.principalScope!);assert.equal(plans.length,1);
    const rows=await sql`select status,record_json->>'taskId' as task from agentic_plan_operations where plan_id=${plans[0]}::uuid`;
    assert.equal(rows.length,1);assert.ok(rows[0].task);
    assert.equal(rows[0].status,"queued","HTTP callers cannot execute the admitted task");
    assert.equal((await sql`select id from tasks where id=${rows[0].task}::uuid`).length,1);
  } finally {release();setPlanClaimLatchForTests(key,null);await Promise.allSettled(calls);await app.store.deletePrincipalScope(app.scope.principalScope!);}
});

test("LOCK-ATOMIC-02 simultaneous checkout owns one frozen order and stale catalogue cannot replace it",{timeout:15000},async()=>{
  const app=await fixture();
  const created=await rpcWithTaskExecutor(app,"plan",{idempotencyKey:"atomic-checkout-plan",...publicRequest({...request, requirements:{productDoses:[{productId:"prd_b1111111111111111111111111111111",servingsPerDay:1}]}})});
  const option=(created.choices as {products: unknown[]}[])[0];
  assert.ok(option?.products.length, "Atomic checkout requires an explicitly selected purchase");
  const plan=await rpcWithTaskExecutor(app,"plan",{ planHandle:created.planHandle });
  assert.equal(plan.status,"ready",JSON.stringify(plan));
  let release!:()=>void,entered=0;const gate=new Promise<void>(resolve=>{release=resolve;});
  setExecuteFreshGateForTests(gate);setExecuteFreshEnteredForTests(()=>{entered++;});
  const call={...app,now:app.now!,expectedRevision:Number(plan.revision),planHandle:String(plan.planHandle),idempotencyKey:"checkout-duplicate"};
  const calls=[executeTool(call),executeTool(call)];
  try {
    for(let i=0;i<100&&entered<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(entered,2);release();const results=await Promise.all(calls);
    assert.ok(results.every(row=>row.ok),JSON.stringify(results));assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));
    const plans=await app.store.listPlanIdsByPrincipal(app.scope.principalScope!);assert.equal(plans.length,1);
    const orders=await sql`select * from agentic_orders where plan_id=${plans[0]}::uuid`;assert.equal(orders.length,1);
    const rollback=new Error("rollback catalogue fixture");
    await assert.rejects(sql.begin(async tx=>{
      await tx`update catalogue_runtime_revision set revision=revision+1 where singleton`;
      const txStore=createPostgresStore(tx, true);
      const recovered=await executeTool({...call,store:txStore,idempotencyKey:"atomic-checkout-recovery"});
      assert.deepEqual(JSON.parse(JSON.stringify(recovered)),JSON.parse(JSON.stringify(results[0])));
      assert.deepEqual((await tx`select * from agentic_orders where plan_id=${plans[0]}::uuid`)[0],orders[0]);
      throw rollback;
    }),error=>error===rollback);
  } finally {release();resetExecuteLockState();await Promise.allSettled(calls);await app.store.deletePrincipalScope(app.scope.principalScope!);}
});

test("LOCK-REDUNDANT-02 existing checkout reuse reads its immutable receipt while the order is locked", {timeout:15000}, async () => {
  const app = await fixture();
  try {
    const plan = await rpcWithTaskExecutor(app, "plan", { idempotencyKey:"locking-reuse-read", ...publicRequest({...request, requirements:{productDoses:[{productId:"prd_b1111111111111111111111111111111",servingsPerDay:1}]}}) });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const call = { ...app, now:app.now!, planHandle:String(plan.planHandle), expectedRevision:Number(plan.revision), idempotencyKey:"locking-reuse-create" };
    const first = await executeTool(call); assert.equal(first.ok, true, JSON.stringify(first));
    const [planId] = await app.store.listPlanIdsByPrincipal(app.scope.principalScope!);
    const [order] = await sql`select id from agentic_orders where plan_id=${planId}`; assert.ok(order);
    const replay = await whileWriterHeld(sql, tx => tx`select id from agentic_orders where id=${order.id} for update`,
      () => executeTool({...call,idempotencyKey:"locking-reuse-new-key"}));
    assert.deepEqual(JSON.parse(JSON.stringify(replay)), JSON.parse(JSON.stringify(first)));
  } finally { await app.store.deletePrincipalScope(app.scope.principalScope!); }
});

test("LOCK-REDUNDANT-07 checkout observes a committed catalogue snapshot without waiting for its writer", {timeout:15000}, async () => {
  const app = await fixture();
  try {
    const plan = await rpcWithTaskExecutor(app, "plan", { idempotencyKey:"locking-snapshot-read", ...publicRequest({...request, requirements:{productDoses:[{productId:"prd_b1111111111111111111111111111111",servingsPerDay:1}]}}) });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const call = { ...app, now:app.now!, planHandle:String(plan.planHandle), expectedRevision:Number(plan.revision), idempotencyKey:"locking-snapshot-checkout" };
    const first = await whileWriterHeld(sql, tx => tx`update catalogue_runtime_revision set revision=revision+1 where singleton`, () => executeTool(call));
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.deepEqual(JSON.parse(JSON.stringify(await executeTool({...call,idempotencyKey:"locking-snapshot-replay"}))), JSON.parse(JSON.stringify(first)));
  } finally { await app.store.deletePrincipalScope(app.scope.principalScope!); }
});
