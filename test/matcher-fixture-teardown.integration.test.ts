import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import postgres from "postgres";
import { cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";

it("V5-HYGIENE-PG-01 fixture teardown preserves audit evidence and unrelated links without creating orphan references", async () => {
  const database = process.env.TEST_DB_URL;
  assert.ok(database, "An isolated TEST_DB_URL is required");
  const url = new URL(database);
  assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
  assert.ok(url.port && !["5432", "3000", "80", "443"].includes(url.port));
  const sql = postgres(database, { max: 1 });
  const rollback = new Error("Restore all teardown fixture data");
  try {
    await assert.rejects(sql.begin(async tx => {
      const ownedPlan = randomUUID(), otherPlan = randomUUID(), ownedTask = randomUUID(), otherTask = randomUUID(), thirdTask = randomUUID(), fourthTask = randomUUID();
      const identity = randomUUID(), ownedEvent = randomUUID(), otherEvent = randomUUID(), organisation = randomUUID();
      await tx`insert into public.organisations (id,slug,name,organisation_type) values (${organisation},${organisation},'Teardown fixture','platform')`;
      for (const plan of [ownedPlan, otherPlan]) await tx`insert into public.assessments (plan_id,locale,answers,answer_summary) values (${plan},'en','{}','{}')`;
      for (const [id, plan] of [[ownedTask, ownedPlan], [otherTask, otherPlan], [thirdTask, otherPlan], [fourthTask, otherPlan]]) await tx`insert into public.tasks (id,organisation_id,task_group_id,task_type,title,plan_id) values (${id},${organisation},${randomUUID()},'teardown_fixture','Teardown fixture',${plan})`;
      await tx`insert into public.communication_identities (id) values (${identity})`;
      for (const plan of [ownedPlan, otherPlan]) await tx`insert into public.plan_communication_identities (plan_id,identity_id) values (${plan},${identity})`;
      for (const [id, plan] of [[ownedEvent, ownedPlan], [otherEvent, otherPlan]]) await tx`insert into public.bpm (id,ray,plan_id,event_name,properties) values (${id},${randomUUID()},${plan},'fixture_cleanup_test','{"preserve":"evidence"}')`;
      for (const [task, dependency] of [[ownedTask, otherTask], [thirdTask, ownedTask], [fourthTask, otherTask]]) await tx`insert into public.task_dependencies (task_id,depends_on_task_id) values (${task},${dependency})`;
      const orphanCounts = async () => (await tx`select
        (select count(*)::int from public.bpm b where plan_id is not null and not exists(select 1 from public.assessments a where a.plan_id=b.plan_id)) as bpm,
        (select count(*)::int from public.plan_communication_identities p where not exists(select 1 from public.assessments a where a.plan_id=p.plan_id)) as contacts,
        (select count(*)::int from public.task_dependencies d where not exists(select 1 from public.tasks t where t.id=d.task_id) or not exists(select 1 from public.tasks t where t.id=d.depends_on_task_id)) as dependencies`)[0];
      const before = await orphanCounts();
      await tx`set local session_replication_role=replica`;
      await cleanupFixtureRelationships(tx, { planIds: [ownedPlan] });
      await cleanupFixtureRelationships(tx, { planIds: [ownedPlan] }); // Replays are harmless.
      await tx`delete from public.tasks where id=${ownedTask}`;
      await tx`delete from public.assessment_versions where plan_id=${ownedPlan}`;
      await tx`delete from public.assessment_version_counters where plan_id=${ownedPlan}`;
      await tx`delete from public.assessments where plan_id=${ownedPlan}`;
      assert.deepEqual((await tx`select plan_id,properties from public.bpm where id=${ownedEvent}`)[0], { plan_id: null, properties: { preserve: "evidence" } });
      assert.equal((await tx`select count(*)::int as n from public.plan_communication_identities where plan_id=${ownedPlan}`)[0].n, 0);
      assert.deepEqual(Array.from(await tx`select task_id,depends_on_task_id from public.task_dependencies where task_id=any(${[ownedTask, otherTask, thirdTask, fourthTask]}::uuid[]) order by task_id`), [{ task_id: fourthTask, depends_on_task_id: otherTask }]);
      assert.equal((await tx`select plan_id from public.bpm where id=${otherEvent}`)[0].plan_id, otherPlan);
      assert.equal((await tx`select count(*)::int as n from public.plan_communication_identities where plan_id=${otherPlan} and identity_id=${identity}`)[0].n, 1);
      assert.equal((await tx`select count(*)::int as n from public.communication_identities where id=${identity}`)[0].n, 1);
      assert.deepEqual(await orphanCounts(), before, "Teardown never repairs or deletes pre-existing historical orphans and never adds new ones");
      await cleanupFixtureRelationships(tx, { taskIds: [fourthTask] });
      await tx`delete from public.tasks where id=${fourthTask}`;
      assert.equal((await tx`select count(*)::int as n from public.task_dependencies where task_id=${fourthTask} or depends_on_task_id=${fourthTask}`)[0].n, 0);
      assert.deepEqual(await orphanCounts(), before, "Task-only fixtures remove both incoming and outgoing dependencies");
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});
