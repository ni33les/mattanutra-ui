import assert from "node:assert/strict";
import { after, test } from "node:test";
import postgres from "postgres";
import { withDatabaseTransaction, deferUntilDatabaseCommit, getSql, closeSqlPool } from "../../lib/db.ts";
import { withRequestLifetime } from "../../lib/request-lifetime.ts";
import { withServiceMeasurements, serviceMeasurements } from "../../lib/service-metrics.ts";
assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=postgres(url.href,{max:1,prepare:false});after(async()=>{await sql.end();await closeSqlPool();});
async function blockedPool(deadline: boolean) {
  let release!:()=>void, entered!:()=>void, executed=0,effects=0,settled=false;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const holder=sql.begin(async tx=>{await tx`select 1`;entered();await gate;});await ready;
  const controller=new AbortController();const reason=new Error("Queued request cancelled");
  const work=withRequestLifetime({signal:controller.signal},()=>withDatabaseTransaction(sql,async tx=>{
    executed++;deferUntilDatabaseCommit(()=>{effects++;});await tx`select 2`;return "unexpected";
  },deadline?20:1000));
  const observed=work.then(()=>{settled=true;return null;},error=>{settled=true;return error;});
  try {
    if (!deadline) controller.abort(reason);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(settled,true,"caller must settle while the connection remains unavailable");
    assert.match(String(await observed),deadline?/Database phase deadline/:/Queued request cancelled/);
  } finally {release();await holder;await observed;}
  await withDatabaseTransaction(sql,async tx=>{assert.equal((await tx`select 3 as value`)[0].value,3);});
  assert.equal(executed,0,"late pool acquisition cannot execute cancelled work");assert.equal(effects,0);
}
test("LOCK-POOL-01 request cancellation covers pool acquisition without waiting for the holder",()=>blockedPool(false));
test("LOCK-POOL-02 database phase deadline covers pool acquisition and suppresses late writes/effects",()=>blockedPool(true));

test("LOCK-METRIC-01 acquisition, locking statement and protected transaction have separate client-observed durations",async()=>{
  const app=getSql();assert.ok(app,"Instrumented isolated application pool is required");
  let release!:()=>void,entered!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const holder=sql.begin(async tx=>{await tx`select singleton from public.catalogue_runtime_revision where singleton=true for update`;entered();await gate;});await ready;
  try {
    await withServiceMeasurements(async()=>{
      const work=withDatabaseTransaction(app,async tx=>{await tx`select singleton from public.catalogue_runtime_revision where singleton=true for share`;});
      await new Promise(resolve=>setTimeout(resolve,50));release();await work;
      const metrics=serviceMeasurements();
      assert.equal(metrics["db.acquire_begin_ms"]?.count,1);
      assert.equal(metrics["db.lock_statement_client_ms"]?.count,1);
      assert.equal(metrics["db.transaction_client_ms"]?.count,1);
      assert.ok(metrics["db.transaction_client_ms"].total>=metrics["db.lock_statement_client_ms"].total);
      assert.ok(metrics["db.transaction_client_ms"].total>0);
    });
  } finally {release();await holder;}
});
