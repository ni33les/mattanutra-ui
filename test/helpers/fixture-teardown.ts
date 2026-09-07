/** Fixture-owned relationships bypassed by replica-mode append-only audit cleanup. */
import assert from "node:assert/strict";
import type postgres from "postgres";
import { isolatedDatabasePreflight } from "../../scripts/run-full-test-suite.mjs";

export function fixtureDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const failures = isolatedDatabasePreflight(env);
  assert.equal(failures.length, 0, failures.join("; "));
  return new URL(env.TEST_DB_URL!);
}

type FixtureSql = postgres.Sql | postgres.TransactionSql;
export async function cleanupFixtureRelationships(sql: FixtureSql, input: { planIds?: readonly string[]; taskIds?: readonly string[] }) {
  const database = fixtureDatabaseUrl();
  const [connection] = await sql<Array<{ name: string; role: string }>>`select current_database() as name, current_setting('session_replication_role') as role`;
  assert.equal(connection!.name, database.pathname.slice(1), "Fixture cleanup must use the declared isolated database");
  assert.equal(connection!.role, "replica", "Call only inside the fixture's replica-mode cleanup transaction");
  const planIds = [...new Set(input.planIds ?? [])];
  const taskIds = new Set(input.taskIds ?? []);
  for (const id of [...planIds, ...taskIds]) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (planIds.length) {
    // Block late telemetry FK checks until the fixture parent deletion commits.
    await sql`select plan_id from public.assessments where plan_id=any(${planIds}::uuid[]) for update`;
    const tasks = await sql<Array<{ id: string }>>`select id from public.tasks where plan_id=any(${planIds}::uuid[]) for update`;
    for (const task of tasks) taskIds.add(task.id);
    await sql`delete from public.plan_communication_identities where plan_id=any(${planIds}::uuid[])`;
    // Preserve analytics evidence, exactly as its ON DELETE SET NULL FK intends.
    await sql`update public.bpm set plan_id=null where plan_id=any(${planIds}::uuid[])`;
  }
  if (taskIds.size) {
    const ids = [...taskIds];
    await sql`select id from public.tasks where id=any(${ids}::uuid[]) for update`;
    await sql`delete from public.task_dependencies where task_id=any(${ids}::uuid[]) or depends_on_task_id=any(${ids}::uuid[])`;
  }
}
