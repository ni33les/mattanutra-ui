import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import * as scheduler from "../../lib/task-worker.ts";
import { processOmsOutbox } from "../../lib/agentic/retail/mock-thailand.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";
assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=postgres(url.href,{max:3,prepare:false,connection:{lock_timeout:"150ms",statement_timeout:"3s"}}),store=createPostgresStore(sql);
after(()=>sql.end());
function barrier(){let release!:()=>void;return{promise:new Promise<void>(resolve=>{release=resolve;}),release:()=>release()};}

test("LOCK-RETAIN-19 outbox owners claim distinct rows while ordinary reads remain nonblocking",async()=>{
  const planId=randomUUID(),orderId=randomUUID(),ids=[randomUUID(),randomUUID()],now="2000-01-01T00:00:00Z";
  await store.insertPlan({id:planId,currentRevision:1,environment:"dev",tenantScope:"mattanutra",principalScope:planId,createdAt:now,updatedAt:now});
  await store.insertOrder({id:orderId,planId,planRevision:1,environment:"dev",tenantScope:"mattanutra",principalScope:planId,
    createdAt:now,updatedAt:now,reference:orderId,currency:"THB",destinationCountry:"TH",totalPriceMinor:100,frozenPlan:{},
    orderStatus:"open",paymentStatus:"paid",fulfilmentStatus:"not_started",stateVersion:1,cancelledAt:null,expiredAt:null,
    completedAt:null,checkoutAccessHash:null,checkoutExpiresAt:null,checkoutUrl:null,latestPaymentAttempt:null,latestPaymentReason:null,providerSessionId:null});
  for(let n=0;n<2;n++)await store.insertOutbox({id:ids[n],type:"OMS_SUBMIT",orderId,payload:{fixture:true},createdAt:`2000-01-01T00:00:0${n}Z`,processedAt:null});
  const ready=barrier(),release=barrier();
  const owner=store.transaction(async tx=>{const rows=await tx.claimOutboxBatch(1);assert.equal(rows[0]?.id,ids[0]);ready.release();await release.promise;await tx.markOutboxProcessed(ids[0],"2000-01-02T00:00:00Z");});
  await ready.promise;
  try {
    assert.equal((await store.getOutboxPending()).filter(row=>ids.includes(row.id)).length,2);
    await store.transaction(async tx=>{const rows=await tx.claimOutboxBatch(1);assert.equal(rows[0]?.id,ids[1]);await tx.markOutboxProcessed(ids[1],"2000-01-02T00:00:00Z");});
  } finally {release.release();await owner;await sql`delete from public.agentic_outbox_events where id=any(${ids}::uuid[])`;await sql`delete from public.agentic_orders where id=${orderId}::uuid`;await sql`delete from public.agentic_plans where id=${planId}::uuid`;}
});

test("LOCK-RETAIN-20 cron claims skip another owner and publish each due action once",async()=>{
  const ids=[randomUUID(),randomUUID()];for(const id of ids)await sql`insert into public.cron(id,action_type,scheduled_for) values(${id}::uuid,'fixture','2000-01-01')`;
  const ready=barrier(),release=barrier();
  const owner=sql.begin(async tx=>{await tx`select id from public.cron where id=${ids[0]}::uuid for update`;ready.release();await release.promise;});await ready.promise;
  try {
    const rows=await scheduler.claimDueCronActions(sql);assert.ok(rows.some(row=>row.id===ids[1]));assert.ok(rows.every(row=>row.id!==ids[0]));
    const [read]=await sql`select status,attempts from public.cron where id=${ids[0]}::uuid`;assert.deepEqual(read,{status:"scheduled",attempts:0});
    release.release();await owner;
    const next=await scheduler.claimDueCronActions(sql);assert.ok(next.some(row=>row.id===ids[0]));assert.ok(next.every(row=>row.id!==ids[1]));
    assert.ok((await sql`select attempts from public.cron where id=any(${ids}::uuid[])`).every(row=>row.attempts===1));
  }finally{release.release();await owner;await sql`delete from public.cron where id=any(${ids}::uuid[])`;}
});

test("LOCK-RETAIN-21 dependency writes preserve acyclicity and foreign keys without blocking reads",async()=>{
  const organisation=randomUUID(),ids=[randomUUID(),randomUUID()];
  await sql`insert into public.organisations(id,slug,name,organisation_type) values(${organisation}::uuid,${organisation},'Dependency fixture','platform')`;
  for(const id of ids)await sql`insert into public.tasks(id,organisation_id,task_group_id,task_type,title) values(${id}::uuid,${organisation}::uuid,${id}::uuid,'fixture','Dependency fixture')`;
  const ready=barrier(),release=barrier();
  const writer=sql.begin(async tx=>{await tx`insert into public.task_dependencies(task_id,depends_on_task_id) values(${ids[0]}::uuid,${ids[1]}::uuid)`;ready.release();await release.promise;});await ready.promise;
  try {
    assert.equal((await sql`select id from public.tasks where id=any(${ids}::uuid[])`).length,2);
    await assert.rejects(sql`insert into public.task_dependencies(task_id,depends_on_task_id) values(${ids[1]}::uuid,${ids[0]}::uuid)`,{code:"40001",message:"Concurrent task dependency change; retry the transaction"});
    await assert.rejects(sql`delete from public.tasks where id=${ids[1]}::uuid`,{code:"55P03"});
    release.release();await writer;
    await assert.rejects(sql`insert into public.task_dependencies(task_id,depends_on_task_id) values(${ids[1]}::uuid,${ids[0]}::uuid)`,{code:"23514"});
  }finally{release.release();await writer;await sql`delete from public.task_dependencies where task_id=any(${ids}::uuid[])`;await sql`delete from public.tasks where id=any(${ids}::uuid[])`;await sql`delete from public.organisations where id=${organisation}::uuid`;}
});

test("LOCK-RETAIN-19B fulfilment uses its already locked order once and replay does not duplicate its event",async()=>{
  const planId=randomUUID(),orderId=randomUUID(),eventId=randomUUID(),now="2000-01-01T00:00:00Z";
  await store.insertPlan({id:planId,currentRevision:1,environment:"dev",tenantScope:"mattanutra",principalScope:planId,createdAt:now,updatedAt:now});
  await store.insertOrder({id:orderId,planId,planRevision:1,environment:"dev",tenantScope:"mattanutra",principalScope:planId,
    createdAt:now,updatedAt:now,reference:orderId,currency:"THB",destinationCountry:"TH",totalPriceMinor:100,frozenPlan:{},
    orderStatus:"open",paymentStatus:"paid",fulfilmentStatus:"not_started",stateVersion:1,cancelledAt:null,expiredAt:null,
    completedAt:null,checkoutAccessHash:null,checkoutExpiresAt:null,checkoutUrl:null,latestPaymentAttempt:null,latestPaymentReason:null,providerSessionId:null});
  await store.insertOutbox({id:eventId,type:"OMS_SUBMIT",orderId,payload:{fixture:true},createdAt:now,processedAt:null});
  let acquisitions=0;
  const wrap=(base:AgenticStore):AgenticStore=>({...base,transaction:work=>base.transaction(tx=>work(wrap(tx))),
    getOrderForUpdate:async id=>{acquisitions++;return base.getOrderForUpdate(id);}});
  try {
    await processOmsOutbox({store:wrap(store),now});
    assert.equal(acquisitions,1,"the outbox owns this order fence for the complete atomic transition");
    assert.equal((await store.getOrder(orderId))?.fulfilmentStatus,"processing");
    assert.equal((await store.listFulfilmentEvents(orderId)).length,1);
    await processOmsOutbox({store:wrap(store),now});
    assert.equal(acquisitions,1);assert.equal((await store.listFulfilmentEvents(orderId)).length,1);
  }finally{await store.deletePrincipalScope(planId);}
});
