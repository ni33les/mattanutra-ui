import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
