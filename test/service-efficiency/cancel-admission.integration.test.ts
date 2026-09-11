import { publicRequest } from "../ax-refinement/helpers.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Worker } from "node:worker_threads";
import postgres from "postgres";
import { closeSqlPool } from "../../lib/db.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { installCatalogue, goldens } from "../mcp-7-2-3/helpers.ts";
import { rpc, runtime, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";

assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=postgres(url.href,{max:3,prepare:false});after(async()=>{uninstallRealCatalogue();await sql.end();await closeSqlPool();});

test("LOCK-ATTEMPTS-05 real durable cancellation after reservation commit spends zero attempts and persists recovery",{timeout:15000},async()=>{
  await installCatalogue();const store=createPostgresStore(sql),app=runtime(`cancel-reserve-${randomUUID()}`,store),controller=new AbortController();
  const previous=process.env.AX_REFINEMENT_REAL_WORKERS;process.env.AX_REFINEMENT_REAL_WORKERS="1";
  const original=Worker.prototype.postMessage,patch=store.patchClaimedOperation!.bind(store);let posts=0,cancelled=false;
  Worker.prototype.postMessage=function(message,...args){if(message?.kind==="session-start")posts++;return original.call(this,message,...args);};
  store.patchClaimedOperation=async(...args)=>{
    const saved=await patch(...args),checkpoint=args[2].checkpoint as {reservedAttempts?:number}|null;
    if(saved && !cancelled && checkpoint?.reservedAttempts){cancelled=true;controller.abort(new Error("controlled predispatch cancellation"));}
    return saved;
  };
  try {
    await rpc(app,"plan",{idempotencyKey:"cancel-admission",...publicRequest(goldens.d3)});
    const op=await store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`,"cancel-admission");assert.ok(op);
    const result=await runAdmittedPlanOperation({store,config:app.config,operationId:op.id,signal:controller.signal});
    assert.equal(result.ok,false);assert.equal(cancelled,true);assert.equal(posts,0);
    let saved=await store.getPlanOperation(op.id);
    for(let i=0;i<20 && (saved?.checkpoint as {reservedAttempts?:number})?.reservedAttempts;i++){
      await new Promise(resolve=>setTimeout(resolve,10));saved=await store.getPlanOperation(op.id);
    }
    assert.equal((saved?.checkpoint as {reservedAttempts?:number}).reservedAttempts,0);
    assert.equal(saved?.status,"retryable");
    assert.equal((await store.getPlanReadState(op.planId))?.operation?.status,"retryable");
  } finally {Worker.prototype.postMessage=original;if(previous===undefined)delete process.env.AX_REFINEMENT_REAL_WORKERS;else process.env.AX_REFINEMENT_REAL_WORKERS=previous;await store.deletePrincipalScope(app.scope.principalScope!);}
});
