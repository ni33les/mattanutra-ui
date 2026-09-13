import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { withDatabaseTransaction } from "../../lib/db.ts";
import { operationCommands } from "../../lib/agentic/store/operation-commands.ts";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is required, never skip");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.notEqual(url.port, "5432");
assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = postgres(url.href, { max: 3, prepare: false, connection: { statement_timeout: "2000ms", lock_timeout: "250ms" } });
let replica: ChildProcess;
const events: Array<{ type: string; id?: string; work?: unknown }> = [];
const waiters = new Set<() => void>();
function until(predicate: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const check = () => { if (predicate()) { clearTimeout(timer); waiters.delete(check); resolve(); } };
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error("Replica notification deadline")); }, 3000);
    waiters.add(check); check();
  });
}
before(async () => {
  replica = fork(new URL("notification-replica.mjs", import.meta.url), [], {
    execArgv: ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs"],
    stdio: ["ignore", "ignore", "inherit", "ipc"]
  });
  replica.on("message", event => { events.push(event as typeof events[number]); for (const check of waiters) check(); });
  await until(() => events.some(e => e.type === "ready"));
});
after(async () => {
  if (replica?.connected) { replica.send({ type: "stop" }); await new Promise<void>(resolve => replica.once("exit", () => resolve())); }
  await sql.end();
});
async function fixture() {
  const id = randomUUID(), planId = randomUUID(), now = new Date().toISOString();
  await sql`insert into public.agentic_plans(id,environment,tenant_scope,current_revision,created_at,updated_at)
    values(${planId},'dev','stream-test',1,${now},${now})`;
  await sql`insert into public.agentic_plan_operations(id,plan_id,owner_scope,idempotency_key,status,version,record_json,created_at,updated_at)
    values(${id},${planId},'stream-test',${id},'running',1,
      ${sql.json({ id, planId, version: 1, status: "running", revision: 2, expectedRevision: 1, createdAt: now, updatedAt: now, leaseToken: "lease", leaseExpiresAt: new Date(Date.now()+60000).toISOString() })},${now},${now})`;
  const observed = events.filter(e => e.type === "observing").length;
  replica.send({ type: "observe", id });
  await until(() => events.filter(e => e.type === "observing").length === observed + 1);
  return { id, now };
}
test("STREAM-PG-commit another application process observes only the committed terminal version", async () => {
  const { id, now } = await fixture();
  await withDatabaseTransaction(sql, async tx => {
    assert.equal(await operationCommands(tx, sql).patchClaimedOperation(id, "lease", { status: "complete" }, now, null), true);
    await delay(30); assert.equal(events.some(e => e.type === "changed" && e.id === id), false);
    const [visible] = await sql`select status from public.agentic_plan_operations where id=${id}`;
    assert.equal(visible.status, "running", "Independent readers retain committed state without waiting");
  });
  await until(() => events.some(e => e.type === "changed" && e.id === id));
  const [row] = await sql`select status,version from public.agentic_plan_operations where id=${id}`;
  assert.equal(row.status, "complete"); assert.equal(row.version, 2);
  assert.equal(events.some(e => e.type === "work"), false, "Completion must not dispatch workers");
});
test("STREAM-PG-rollback failed publication leaves both durable state and observers unchanged", async () => {
  const { id, now } = await fixture();
  await assert.rejects(withDatabaseTransaction(sql, async tx => {
    await operationCommands(tx, sql).patchClaimedOperation(id, "lease", { status: "failed" }, now, null);
    throw new Error("intentional rollback");
  }), /intentional rollback/);
  await delay(30); assert.equal(events.some(e => e.type === "changed" && e.id === id), false);
  const [row] = await sql`select status,version from public.agentic_plan_operations where id=${id}`;
  assert.equal(row.status, "running"); assert.equal(row.version, 1);
});
test("STREAM-PG-reconnect rechecks state; duplicate completion leaves task wake-ups available", async () => {
  const { id, now } = await fixture();
  await operationCommands(sql).patchClaimedOperation(id, "lease", { status: "failed" }, now, null);
  await until(() => events.some(e => e.type === "changed" && e.id === id));
  await sql`select pg_notify('mattanutra_tasks', ${JSON.stringify({ kind: "plan_operation_changed", operationId: id, version: 2 })})`;
  await sql`select pg_notify('mattanutra_tasks', ${JSON.stringify({ taskType: "match_agentic_plan", taskId: "queued-task" })})`;
  await until(() => events.some(e => e.type === "work"));
  assert.equal(events.filter(e => e.type === "changed" && e.id === id).length, 1);
  assert.deepEqual(events.find(e => e.type === "work")!.work, { taskType: "match_agentic_plan", taskId: "queued-task" });
  replica.send({ type: "reconnect" }); await until(() => events.some(e => e.type === "reconnected"));
  assert.equal(events.filter(e => e.type === "changed" && e.id === id).length, 2);
});
