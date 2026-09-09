import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import type { PlanOperationRecord } from "../../lib/agentic/store/types.ts";
import { claimPlanOperation, updateClaimedOperation, cancelPlanOperation } from "../../lib/agentic/plan/operations.ts";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is mandatory");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/); assert.notEqual(url.port, "5432");
const queries: string[] = [];
const sql = postgres(url.href, { max: 3, prepare: false, debug: (_connection, query) => { queries.push(query); } });
const store = createPostgresStore(sql), now = "2026-09-09T00:00:00Z";
after(() => sql.end());
async function operation() {
  const id = randomUUID(), planId = randomUUID(), scope = { environment: "dev" as const, tenantScope: "mattanutra", principalScope: "qa-v3:eff-operations" };
  await store.insertPlan({ id: planId, ...scope, currentRevision: 1, createdAt: now, updatedAt: now });
  const row: PlanOperationRecord = { id, planId, taskId: randomUUID(), ownerScope: id, key: id, requestHash: "fixture", revision: 2, expectedRevision: 1,
    createdAt: now, updatedAt: now, deadlineAt: "2026-09-09T00:02:55Z", leaseToken: null, leaseExpiresAt: null, status: "queued", version: 1,
    command: { payload: {}, prepared: { fixture: "x".repeat(100_000) }, scope }, checkpoint: null, catalogueIdentity: null, referenceIdentity: null, response: null, error: null };
  await sql`insert into public.agentic_plan_operations(id,plan_id,owner_scope,idempotency_key,status,version,record_json,created_at,updated_at)
    values(${id},${planId},${id},${id},'queued',1,${sql.json(row)},${now},${now})`;
  return row;
}
const business = () => queries.filter(query => /^\s*(select|update)/i.test(query));

test("EFF-TXN-PG-01 claiming work returns its input in at most two database statements", async () => {
  const row = await operation(); queries.length = 0;
  const claimed = await claimPlanOperation(store, row.id, "owner", now); assert.ok(claimed);
  assert.deepEqual(claimed.command, row.command); assert.equal(claimed.version, 2);
  assert.ok(business().length <= 2, `Claim used ${business().length} statements`);
});

test("EFF-TXN-PG-02 checkpoint updates use one conditional write and preserve stale-owner fencing", async () => {
  const row = await operation(); const claim = await claimPlanOperation(store, row.id, "owner", now); assert.ok(claim);
  const cursor = randomBytes(256).toString("base64");
  queries.length = 0;
  assert.equal(await updateClaimedOperation(store, claim, { checkpoint: { search: { cursor, expansionAttempts: 4000 } } }, now), true);
  assert.equal(business().length, 1);
  const stored = await store.getPlanOperation(row.id);
  assert.deepEqual(stored?.command, row.command);
  const { operationCursor, operationCursorBytes, withoutOperationCursor } = await import("../../lib/agentic/store/operation-checkpoint.ts");
  assert.deepEqual(withoutOperationCursor(stored!).checkpoint, { search: { expansionAttempts: 4000 } });
  assert.deepEqual(operationCursorBytes(operationCursor(stored!)!), Buffer.from(cursor, "base64"));
  await cancelPlanOperation(store, row.id, now);
  assert.equal(await updateClaimedOperation(store, claim, { status: "complete" }, now), false);
});


test("EFF-TXN-PG-03 durable BYTEA checkpoints remain binary when read and reclaimed", async () => {
  const row = await operation(), claim = await claimPlanOperation(store, row.id, "owner", now); assert.ok(claim);
  const cursor = randomBytes(512);
  assert.equal(await updateClaimedOperation(store, claim, { checkpoint: { search: { cursor, expansionAttempts: 4000 } } }, now), true);
  const { operationCursor } = await import("../../lib/agentic/store/operation-checkpoint.ts");
  const read = operationCursor((await store.getPlanOperation(row.id))!);
  assert.ok(read instanceof Uint8Array); assert.deepEqual(Buffer.from(read), cursor);
  const reclaimed = await claimPlanOperation(store, row.id, "next", "2026-09-09T00:01:00Z"); assert.ok(reclaimed);
  const resumed = operationCursor(reclaimed); assert.ok(resumed instanceof Uint8Array); assert.deepEqual(Buffer.from(resumed), cursor);
});

test("LOCK-ATTEMPTS-04 unstarted reservation compensation preserves prior lost attempts and refuses a newer owner",async()=>{
  const row=await operation(),claim=await claimPlanOperation(store,row.id,"owner",now);assert.ok(claim);
  const cursor=randomBytes(256);
  await updateClaimedOperation(store,claim,{checkpoint:{reservedAttempts:5000,search:{cursor,expansionAttempts:4000}}},now);
  assert.equal(typeof store.releaseUnstartedOperationAttempts,"function");queries.length=0;
  assert.equal(await store.releaseUnstartedOperationAttempts!(row.id,"owner",4000,5000,1000,now),true);
  assert.equal(business().length,1);
  const saved=await store.getPlanOperation(row.id);assert.deepEqual(saved?.command,row.command);
  assert.equal((saved?.checkpoint as {reservedAttempts:number}).reservedAttempts,1000);
  assert.deepEqual(Buffer.from((saved?.checkpoint as {search:{cursor:Uint8Array}}).search.cursor),cursor);
  const next=await claimPlanOperation(store,row.id,"new-owner","2026-09-09T00:01:00Z");assert.ok(next);
  assert.equal(await store.releaseUnstartedOperationAttempts!(row.id,"owner",4000,1000,0,"2026-09-09T00:01:00Z"),false);
});
