import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {after,test} from "node:test";
import postgres from "postgres";
import {createPostgresStore} from "../../lib/agentic/store/postgres.ts";
import {runtime} from "../ax-refinement/helpers.ts";
import {internalFixture} from "../mcp-conversation-pack/helpers.ts";
import type {PlanRevisionRecord} from "../../lib/agentic/store/types.ts";
assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const queries:string[]=[];const sql=postgres(url.href,{max:2,prepare:false,debug:(_id,query)=>{queries.push(query);}});after(()=>sql.end());
const store=createPostgresStore(sql);

test("LOCK-STORAGE-01 prepared revision JSON is persisted without revisiting result objects under the plan fence",async()=>{
  const path=new URL("../../lib/agentic/store/prepared-revision.ts",import.meta.url);
  assert.ok(existsSync(path),"Prepare result storage before opening the publication transaction");
  const {preparePlanRevisionRecord}=await import(path.href);
  const id=randomUUID(),app=runtime(`prepared-${id}`,store),result=internalFixture();
  await store.insertPlan({id,currentRevision:1,...app.scope,createdAt:app.now!,updatedAt:app.now!});
  const value:PlanRevisionRecord={planId:id,revision:1,status:result.status,requestSnapshot:result.requestSnapshot,result,
    catalogueVersion:"lock-fixture",guidanceRulesVersion:"unchanged",availabilityAsOf:app.now!,createdAt:app.now!};
  const expected=JSON.parse(JSON.stringify(result)),prepared=preparePlanRevisionRecord(value);
  Object.defineProperty(result,"toJSON",{value:()=>{throw new Error("Result serialized while publishing");}});
  try {
    await store.transaction(async tx=>{await tx.getPlanForUpdate(id);await tx.insertPlanRevision(prepared);await tx.updatePlanRevision(prepared);});
    assert.deepEqual((await store.getPlanRevision(id,1))?.result,expected);
    queries.length=0;const header=await store.getPlanRevisionHeader!(id,1);
    assert.deepEqual(header,{revision:1,status:result.status,createdAt:new Date(app.now!).toISOString()});
    assert.equal(queries.length,1);assert.doesNotMatch(queries[0],/request_snapshot|\bresult\b|for update/i);
    const service=readFileSync(new URL("../../lib/agentic/plan/service.ts",import.meta.url),"utf8");
    const publication=service.slice(service.indexOf("async function persistTerminalPlan"));
    assert.ok(publication.indexOf("preparePlanRevisionRecord(")<publication.indexOf("store.transaction("));
  } finally {await store.deletePrincipalScope(app.scope.principalScope!);}
});

test("LOCK-STORAGE-02 order state transitions cannot reserialize or replace frozen checkout contents",async()=>{
  const app=runtime(`frozen-storage-${randomUUID()}`,store),id=randomUUID(),orderId=randomUUID(),frozen=internalFixture();
  await store.insertPlan({id,currentRevision:1,...app.scope,createdAt:app.now!,updatedAt:app.now!});
  await store.insertOrder({id:orderId,planId:id,planRevision:1,...app.scope,createdAt:app.now!,updatedAt:app.now!,reference:`LOCK-${orderId}`,
    currency:"THB",destinationCountry:"TH",totalPriceMinor:100,frozenPlan:frozen,orderStatus:"open",paymentStatus:"unpaid",fulfilmentStatus:"not_started",stateVersion:1,
    cancelledAt:null,expiredAt:null,completedAt:null,checkoutAccessHash:null,checkoutExpiresAt:null,checkoutUrl:null,latestPaymentAttempt:null,latestPaymentReason:null,providerSessionId:null});
  try {
    const order=await store.getOrder(orderId);assert.ok(order);queries.length=0;
    await store.transaction(async tx=>{await tx.getOrderForUpdate(orderId);await tx.updateOrder({...order,stateVersion:2,frozenPlan:{toJSON(){throw new Error("Frozen basket revisited by state update");}}});});
    assert.equal((await store.getOrder(orderId))?.stateVersion,2);
    assert.deepEqual((await store.getOrder(orderId))?.frozenPlan,frozen);
    assert.ok(queries.some(query=>/update public.agentic_orders/i.test(query)));
    assert.ok(queries.filter(query=>/update public.agentic_orders/i.test(query)).every(query=>!/frozen_plan\s*=/i.test(query)));
  } finally {await store.deletePrincipalScope(app.scope.principalScope!);}
});
