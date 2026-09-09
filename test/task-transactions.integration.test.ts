import { cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql, getWorkerSql, withDatabaseTransaction } from "../lib/db.ts";
import { completeTask, reserveNextTask, releaseExpiredReservations, renewTaskLease, failTask } from "../lib/task-service.ts";
import type { TaskAgentAccessScope } from "../lib/task-service-types.ts";

const databaseUrl = process.env.TEST_DB_URL;
describe("task lifecycle transactions on PostgreSQL", {skip: !databaseUrl}, () => {
  const organisationId = randomUUID(), agentId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
  const scope: TaskAgentAccessScope = {organisationId, agentId, membershipId, agentName: "Lock review", capabilities: [], role: "platform_agent"};
  const taskIds: string[] = [];
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    const sql = getSql()!;
    await sql`insert into public.organisations (id, slug, name, organisation_type) values (${organisationId}, ${organisationId}, 'Lock review', 'platform')`;
    await sql`insert into public.agents (id, name, organisation_id) values (${agentId}, ${agentId}, ${organisationId})`;
    await sql`insert into public.organisation_memberships (id, organisation_id, principal_type, agent_id, role) values (${membershipId}, ${organisationId}, 'agent', ${agentId}, 'platform_agent')`;
    await sql`insert into public.worker_sessions (id, agent_id, membership_id, instance_id) values (${sessionId}, ${agentId}, ${membershipId}, ${sessionId})`;
    await sql`create table if not exists public.lock_review_task_results (task_id uuid, value text)`;
  });
  after(async () => {
    try {
      // This suite is restricted to a disposable local database. Disable immutable
      // audit/FK triggers only for cleanup of the synthetic fixture IDs.
      await withDatabaseTransaction(getSql()!, async sql => {
        await sql`set local session_replication_role = replica`;
        await cleanupFixtureRelationships(sql, { taskIds });
        await sql`delete from public.lock_review_task_results where task_id = any(${taskIds}::uuid[])`;
        await sql`delete from public.task_events where task_id = any(${taskIds}::uuid[])`;
        await sql`delete from public.task_reservations where task_id = any(${taskIds}::uuid[])`;
        await sql`delete from public.tasks where id = any(${taskIds}::uuid[])`;
        await sql`delete from public.worker_sessions where id = ${sessionId}`;
        await sql`delete from public.organisation_memberships where id = ${membershipId}`;
        await sql`delete from public.agents where id = ${agentId}`;
        await sql`delete from public.organisations where id = ${organisationId}`;
      });
    } finally { await closeSqlPool(); }
  });


  async function queued() {
    const taskId = randomUUID(); taskIds.push(taskId);
    await getSql()!`insert into public.tasks (id, organisation_id, task_group_id, task_type, title) values (${taskId}, ${organisationId}, ${randomUUID()}, ${agentId}, 'Lock review')`;
    return taskId;
  }
  async function reserved() {
    const taskId = await queued();
    const result = await reserveNextTask({accessScope: scope, agent: {id: agentId, name: scope.agentName}, workerSessionId: sessionId, taskId});
    assert.ok(result);
    return {taskId, reservationId: result.reservationId, workerSessionId: sessionId, accessScope: scope};
  }

  it("claims independent queued tasks concurrently without duplicate reservations", async () => {
    await Promise.all(Array.from({length: 6}, () => queued()));
    const results = await Promise.all(Array.from({length: 6}, () => reserveNextTask({accessScope: scope, agent: {id: agentId, name: scope.agentName}, workerSessionId: sessionId, taskTypes: [agentId]})));
    assert.ok(results.every(Boolean));
    assert.equal(new Set(results.map(result => result!.task.id)).size, 6);
    for (const result of results) {
      const [row] = await getSql()!`select count(*)::int as count from public.task_reservations where task_id = ${result!.task.id} and status = 'active'`;
      assert.equal(row.count, 1);
    }
  });

  it("applies concurrent completion once and replays a lost response", async () => {
    const input = await reserved(); let applications = 0;
    const applyResult = async () => {
      applications++;
      await getSql()!`insert into public.lock_review_task_results values (${input.taskId}, 'completed')`;
      await getWorkerSql()!`select pg_sleep(0.05)`;
      return {done: true};
    };
    const results = await Promise.all(Array.from({length: 6}, () => completeTask({...input, applyResult})));
    assert.equal(applications, 1);
    assert.ok(results.every(task => task.status === "completed"));
    assert.equal((await getSql()!`select * from public.lock_review_task_results where task_id = ${input.taskId}`).length, 1);
    assert.equal((await completeTask({...input, applyResult})).status, "completed");
    assert.equal(applications, 1);
    await assert.rejects(completeTask({...input, reservationId: "invalid"}));
    await assert.rejects(completeTask({...input, reservationId: randomUUID()}));
  });

  it("rolls back partial result persistence and permits a complete retry", async () => {
    const input = await reserved(); let published = 0;
    await assert.rejects(completeTask({...input, applyResult: async context => {
      context.afterCommit(async () => {published++;});
      await getSql()!`insert into public.lock_review_task_results values (${input.taskId}, 'partial')`;
      throw new Error("injected_failure");
    }}), /injected_failure/);
    assert.equal(published, 0);
    assert.equal((await getSql()!`select * from public.lock_review_task_results where task_id = ${input.taskId}`).length, 0);
    assert.equal((await getSql()!`select status from public.tasks where id = ${input.taskId}`)[0].status, "reserved");
    assert.equal((await completeTask({...input, resultPayload: {done: true}})).status, "completed");
  });

  it("rolls back a failed reservation insert with its claimed task and attempt", async () => {
    const taskId = await queued();
    const sql = getSql()!;
    await sql.unsafe(`create or replace function public.lock_review_reject_reservation() returns trigger language plpgsql as $$ begin if new.task_id = '${taskId}'::uuid then raise exception 'injected_reservation_failure'; end if; return new; end $$`);
    await sql`create trigger lock_review_reject_reservation before insert on public.task_reservations for each row execute function public.lock_review_reject_reservation()`;
    try {
      await assert.rejects(reserveNextTask({accessScope: scope, agent: {id: agentId, name: scope.agentName}, workerSessionId: sessionId, taskId}), /injected_reservation_failure/);
    } finally {
      await sql`drop trigger lock_review_reject_reservation on public.task_reservations`;
      await sql`drop function public.lock_review_reject_reservation()`;
    }
    const [row] = await sql`select status, attempts from public.tasks where id = ${taskId}`;
    assert.deepEqual(row, {status: "queued", attempts: 0});
    assert.equal((await sql`select * from public.task_reservations where task_id = ${taskId}`).length, 0);
  });

  it("recovers expired claims with no reservation", async () => {
    const taskId = await queued();
    await getSql()!`update public.tasks set status = 'reserved', lease_until = now() - interval '1 minute', reserved_by_agent_id = ${agentId} where id = ${taskId}`;
    await releaseExpiredReservations();
    const [row] = await getSql()!`select status, reserved_by_agent_id, lease_until from public.tasks where id = ${taskId}`;
    assert.deepEqual(row, {status: "queued", reserved_by_agent_id: null, lease_until: null});
  });

  it("serializes renew, failure, and completion without deadlock or double application", async () => {
    for (let i = 0; i < 8; i++) {
      const input = await reserved(); let applied = 0;
      const results = await Promise.allSettled([
        completeTask({...input, applyResult: async () => {applied++; await getSql()!`select pg_sleep(0.01)`; return {};}}),
        renewTaskLease({...input, leaseSeconds: 300}),
        failTask({...input, errorMessage: "synthetic overlap", applyFailure: async () => {applied++; return {};}})
      ]);
      assert.equal(applied, 1);
      assert.ok(results.some(result => result.status === "fulfilled"));
      for (const result of results) if (result.status === "rejected") assert.notEqual(result.reason.code, "40P01");
    }
  });  it("overlaps expiry and renewal without a lock-order deadlock", async () => {
    for (let i = 0; i < 6; i++) {
      const input = await reserved();
      await getSql()!`update public.tasks set lease_until = now() - interval '1 minute' where id = ${input.taskId}`;
      await getSql()!`update public.task_reservations set lease_until = now() - interval '1 minute' where id = ${input.reservationId}`;
      const outcomes = await Promise.allSettled([releaseExpiredReservations(), renewTaskLease({...input, leaseSeconds: 300})]);
      for (const result of outcomes) if (result.status === "rejected") assert.notEqual(result.reason.code, "40P01");
      const [row] = await getSql()!`select status from public.tasks where id = ${input.taskId}`;
      assert.ok(["reserved", "queued"].includes(row.status));
    }
  });
  it("administrative completion closes the current reservation", async () => {
    const input = await reserved();
    await completeTask({taskId: input.taskId});
    const [row] = await getSql()!`select status from public.task_reservations where id = ${input.reservationId}`;
    assert.equal(row.status, "completed");
  });

  it("EFF-DISPATCH-PG-01 deferred matching releases its slot through completion without applying a result or double-refunding", async () => {
    const input = await reserved(), operationId = randomUUID(), planId = randomUUID(), sql = getSql()!;
    await sql`insert into public.agentic_plans(id,environment,tenant_scope,current_revision) values(${planId},'dev','fixture',1)`;
    const record = { leaseExpiresAt: new Date(Date.now()+60000).toISOString(), deadlineAt: new Date(Date.now()+175000).toISOString() };
    await sql`insert into public.agentic_plan_operations(id,plan_id,owner_scope,idempotency_key,status,version,record_json,created_at,updated_at)
      values(${operationId},${planId},${operationId},${operationId},'running',1,${sql.json(record)},now(),now())`;
    await sql`update public.tasks set task_type='match_agentic_plan',payload=jsonb_build_object('operationId',${operationId}::text) where id=${input.taskId}`;
    let applied = 0;
    const completion = { ...input, resultPayload: { deferredOperationId: operationId }, applyResult: async () => { applied++; return {}; } };
    try {
      await assert.rejects(completeTask({ ...completion, workerSessionId: randomUUID() }));
      const results = await Promise.all([completeTask(completion), completeTask(completion)]);
      assert.ok(results.every(task => task.status === "queued")); assert.equal(applied, 0);
      const [row] = await sql`select attempts,status,scheduled_for>now()+interval '40 seconds' as deferred from public.tasks where id=${input.taskId}`;
      assert.deepEqual(row, { attempts: 0, status: "queued", deferred: true });
      await sql`update public.tasks set scheduled_for=now() where id=${input.taskId}`;
      const next = await reserveNextTask({ accessScope: scope, agent: { id: agentId, name: scope.agentName }, workerSessionId: sessionId, taskId: input.taskId }); assert.ok(next);
      assert.notEqual(next.reservationId, input.reservationId);
      assert.equal((await completeTask(completion)).status, "reserved");
      assert.equal((await sql`select attempts from public.tasks where id=${input.taskId}`)[0].attempts, 1);
    } finally {
      await sql`delete from public.agentic_plan_operations where id=${operationId}`;
      await sql`delete from public.agentic_plans where id=${planId}`;
    }
  });

});
