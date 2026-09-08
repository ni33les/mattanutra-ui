import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { closeSqlPool } from "../../lib/db.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { admitPlanOperation, claimPlanOperation, updateClaimedOperation, cancelPlanOperation } from "../../lib/agentic/plan/operations.ts";

assert.ok(process.env.TEST_DB_URL, "An isolated database is required; this integration suite never skips");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
assert.ok(url.port && url.port !== "5432");
const sql = postgres(url.href, { max: 3, prepare: false });
const store = createPostgresStore(sql);
after(async () => { await sql.end(); await closeSqlPool(); });

test("AXR-REL-04 PostgreSQL admits one task for duplicate calls and rejects cancelled publication", async () => {
  const planId = randomUUID(), now = "2026-09-07T00:00:00Z";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}`, currentRevision: 3, createdAt: now, updatedAt: now });
  const input = { planId, ownerScope: `dev:mattanutra:qa-v3:ax:${planId}`, key: "ax-postgres-admit-duplicate", expectedRevision: 3, revision: 4,
    payload: { operation: "revise", searchEffort: "expanded", expectedRevision: 3 }, prepared: {}, scope: { environment: "dev" as const, tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}` }, now };
  const [a, b] = await Promise.all([admitPlanOperation(store, input), admitPlanOperation(store, input)]);
  assert.equal(a.id, b.id); assert.equal(a.taskId, b.taskId);
  const tasks = await sql`select id,task_type,payload from public.tasks where payload->>'operationId'=${a.id}`;
  assert.equal(tasks.length, 1); assert.equal(tasks[0].task_type, "match_agentic_plan");
  assert.equal(tasks[0].id, a.taskId);
  const claims = await Promise.all([claimPlanOperation(store, a.id, "one", now), claimPlanOperation(store, a.id, "two", now)]);
  assert.equal(claims.filter(Boolean).length, 1); const claim = claims.find(Boolean)!;
  await cancelPlanOperation(store, a.id, now);
  assert.equal(await updateClaimedOperation(store, claim, { status: "complete", response: { revision: 4 } }, now), false);
  assert.equal((await store.getPlan(planId))?.currentRevision, 3);
});

test("AXR-REL-04 PostgreSQL rolls back operation and framework task as one transaction", async () => {
  const planId = randomUUID(), now = "2026-09-07T00:00:00Z";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}`, currentRevision: 1, createdAt: now, updatedAt: now });
  let taskId: string | undefined;
  await assert.rejects(store.transaction(async tx => {
    const operation = await admitPlanOperation(tx, { planId, ownerScope: `dev:${planId}`, key: "ax-rollback-operation", expectedRevision: 1, revision: 2,
      payload: { operation: "revise" }, prepared: {}, scope: { environment: "dev", tenantScope: "mattanutra" }, now });
    taskId = operation.taskId;
    throw new Error("interruption after task insertion");
  }), /interruption/);
  assert.ok(taskId);
  assert.equal(await store.getPlanOperationByKey(`dev:${planId}`, "ax-rollback-operation"), null);
  const tasks = await sql`select id from public.tasks where id=${taskId}::uuid`;
  assert.equal(tasks.length, 0);
});

test("AXR-REL-04 framework cancellation atomically fences the matching operation", async () => {
  const planId = randomUUID(), now = "2026-09-07T00:00:00Z";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}`, currentRevision: 1, createdAt: now, updatedAt: now });
  const operation = await admitPlanOperation(store, { planId, ownerScope: `dev:${planId}`, key: "ax-framework-cancel", expectedRevision: 1, revision: 2,
    payload: { operation: "revise" }, prepared: {}, scope: { environment: "dev", tenantScope: "mattanutra" }, now });
  const claim = await claimPlanOperation(store, operation.id, "worker", now); assert.ok(claim);
  await sql`update public.tasks set status='cancelled' where id=${operation.taskId}::uuid`;
  assert.equal((await store.getPlanOperation(operation.id))?.status, "cancelled");
  assert.equal(await updateClaimedOperation(store, claim, { status: "complete", response: { revision: 2 } }, now), false);
  assert.equal((await store.getPlan(planId))?.currentRevision, 1);
});

test("AXR-REL-03 large checkpoint bytes stay out of lifecycle writes and survive lease recovery", async () => {
  const planId = randomUUID(), now = "2026-09-07T00:00:00Z";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}`, currentRevision: 1, createdAt: now, updatedAt: now });
  const operation = await admitPlanOperation(store, { planId, ownerScope: `dev:${planId}`, key: "ax-large-checkpoint", expectedRevision: 1, revision: 2,
    payload: { operation: "revise" }, prepared: {}, scope: { environment: "dev", tenantScope: "mattanutra" }, now });
  const claim = await claimPlanOperation(store, operation.id, "worker-one", now); assert.ok(claim);
  const cursor = randomBytes(3 * 1024 * 1024).toString("base64");
  const checkpoint = { stage: "search", reservedAttempts: 0, search: { cursor, expansionAttempts: 28000, expansionBudget: 64000 } };
  assert.equal(await updateClaimedOperation(store, claim, { checkpoint }, now), true);
  const [stored] = await sql`select record_json from public.agentic_plan_operations where id=${operation.id}::uuid`;
  assert.equal(Object.hasOwn(stored.record_json.checkpoint.search, "cursor"), false, "Lifecycle metadata must not rewrite the binary search archive");
  const metadata = await store.getPlanOperation(operation.id, { includeCursor: false }); assert.ok(metadata);
  assert.equal((metadata.checkpoint as typeof checkpoint).search.cursor, undefined);
  const [relation] = await sql`select reltoastrelid::regclass::text as name from pg_class where oid='public.agentic_plan_operations'::regclass`;
  const before = await sql.unsafe(`select distinct chunk_id from ${relation.name} order by chunk_id`);
  assert.equal(await updateClaimedOperation(store, claim, { status: "retryable", error: { dependency: "statement_timeout" } }, now), true);
  const after = await sql.unsafe(`select distinct chunk_id from ${relation.name} order by chunk_id`);
  assert.deepEqual(after, before, "A lifecycle-only update must reuse the existing TOAST bytes");
  const resumed = await claimPlanOperation(store, operation.id, "worker-two", now); assert.ok(resumed);
  assert.deepEqual(resumed.checkpoint, checkpoint);
  assert.equal(await updateClaimedOperation(store, claim, { checkpoint: null }, now), false, "Old leases cannot clear the checkpoint");
  assert.equal(await cancelPlanOperation(store, operation.id, now), true);
  assert.deepEqual((await store.getPlanOperation(operation.id))?.checkpoint, checkpoint);
});

test("AXR-REL-03 legacy inline checkpoints migrate lazily without dropping their recovery data", async () => {
  const planId = randomUUID(), now = "2026-09-07T00:00:00Z";
  await store.insertPlan({ id: planId, environment: "dev", tenantScope: "mattanutra", principalScope: `qa-v3:ax:${planId}`, currentRevision: 1, createdAt: now, updatedAt: now });
  const operation = await admitPlanOperation(store, { planId, ownerScope: `dev:${planId}`, key: "ax-inline-checkpoint", expectedRevision: 1, revision: 2,
    payload: { operation: "revise" }, prepared: {}, scope: { environment: "dev", tenantScope: "mattanutra" }, now });
  const checkpoint = { stage: "search", search: { cursor: randomBytes(4096).toString("base64"), expansionAttempts: 4000, expansionBudget: 64000 } };
  const legacy = { ...operation, checkpoint };
  await sql`update public.agentic_plan_operations set record_json=${sql.json(legacy)} where id=${operation.id}::uuid`;
  assert.deepEqual((await store.getPlanOperation(operation.id))?.checkpoint, checkpoint);
  const claim = await claimPlanOperation(store, operation.id, "legacy-worker", now); assert.ok(claim);
  assert.deepEqual(claim.checkpoint, checkpoint);
  const [row] = await sql`select record_json,checkpoint_cursor from public.agentic_plan_operations where id=${operation.id}::uuid`;
  assert.equal(Object.hasOwn(row.record_json.checkpoint.search, "cursor"), false);
  assert.equal(row.checkpoint_cursor.toString("base64"), checkpoint.search.cursor);
  assert.equal(await updateClaimedOperation(store, claim, { checkpoint: null }, now), true);
  assert.equal((await store.getPlanOperation(operation.id))?.checkpoint, null);
  const [cleared] = await sql`select checkpoint_cursor from public.agentic_plan_operations where id=${operation.id}::uuid`;
  assert.equal(cleared.checkpoint_cursor, null);
});
