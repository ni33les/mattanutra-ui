import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import postgres from "postgres";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is mandatory");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
assert.notEqual(url.port, "5432");
const sql = postgres(url.href, { max: 4, prepare: false });
const ids = Array.from({ length: 8 }, () => randomUUID());
const barrier = () => { let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); return { wait, release }; };
before(async () => {
  await sql`create table lock_boundary_catalogue (id uuid primary key)`;
  await sql`create trigger boundary_catalogue_changed after insert or update or delete on lock_boundary_catalogue for each statement execute function public.bump_catalogue_runtime_revision()`;
  const [org] = await sql`select id from organisations where organisation_type='platform' limit 1`;
  assert.ok(org, "Platform fixture is required");
  for (const id of ids) await sql`insert into tasks(id,organisation_id,task_group_id,task_type,title) values(${id},${org.id},${id},'lock-boundary-fixture','Lock boundary')`;
});
after(async () => {
  try {
    await sql`delete from task_dependencies where task_id=any(${ids}::uuid[])`;
    await sql`delete from tasks where id=any(${ids}::uuid[])`;
    await sql`drop table lock_boundary_catalogue`;
  } finally { await sql.end(); }
});

test("LOCK-BOUNDARY-PG-01 independent catalogue writes proceed while another writer prepares its transaction", { timeout: 5000 }, async () => {
  const entered = barrier(), finish = barrier();
  const [before] = await sql`select revision from catalogue_runtime_revision`;
  const held = sql.begin(async tx => { await tx`insert into lock_boundary_catalogue values(${randomUUID()})`; entered.release(); await finish.wait; });
  try {
    await entered.wait;
    await sql.begin(async tx => { await tx`set local lock_timeout='400ms'`; await tx`insert into lock_boundary_catalogue values(${randomUUID()})`; });
    const [middle] = await sql`select revision from catalogue_runtime_revision`;
    assert.equal(Number(middle.revision), Number(before.revision) + 1, "Only committed changes advance identity");
    finish.release(); await held;
    const [last] = await sql`select revision from catalogue_runtime_revision`;
    assert.equal(Number(last.revision), Number(before.revision) + 2);
  } finally { finish.release(); await held; }
});

test("LOCK-BOUNDARY-PG-02 catalogue rollback is invisible and a transaction publishes one identity change", async () => {
  const [before] = await sql`select revision from catalogue_runtime_revision`;
  await assert.rejects(sql.begin(async tx => { await tx`insert into lock_boundary_catalogue values(${randomUUID()})`; throw new Error("rollback fixture"); }), /rollback fixture/);
  assert.equal(Number((await sql`select revision from catalogue_runtime_revision`)[0].revision), Number(before.revision));
  await sql.begin(async tx => { await tx`insert into lock_boundary_catalogue values(${randomUUID()})`; await tx`insert into lock_boundary_catalogue values(${randomUUID()})`; });
  assert.equal(Number((await sql`select revision from catalogue_runtime_revision`)[0].revision), Number(before.revision) + 1);
});

test("LOCK-BOUNDARY-PG-03 unrelated dependency graphs never share the global cycle guard", { timeout: 5000 }, async () => {
  const entered = barrier(), finish = barrier();
  const held = sql.begin(async tx => { await tx`insert into task_dependencies(task_id,depends_on_task_id) values(${ids[0]},${ids[1]})`; entered.release(); await finish.wait; });
  try {
    await entered.wait;
    await sql.begin(async tx => { await tx`set local lock_timeout='400ms'`; await tx`insert into task_dependencies(task_id,depends_on_task_id) values(${ids[2]},${ids[3]})`; });
  } finally { finish.release(); await held; }
});

test("LOCK-BOUNDARY-PG-04 concurrent edges cannot close a cycle through disjoint endpoint pairs", { timeout: 5000 }, async () => {
  // Existing B→C and D→A; simultaneous A→B and C→D would form a cycle.
  const [a,b,c,d] = ids.slice(4);
  await sql`insert into task_dependencies(task_id,depends_on_task_id) values(${b},${c}),(${d},${a})`;
  const entered = barrier(), finish = barrier();
  const held = sql.begin(async tx => { await tx`insert into task_dependencies(task_id,depends_on_task_id) values(${a},${b})`; entered.release(); await finish.wait; });
  try {
    await entered.wait;
    const rejected = assert.rejects(sql.begin(async tx => { await tx`set local statement_timeout='2s'`; await tx`insert into task_dependencies(task_id,depends_on_task_id) values(${c},${d})`; }), error => {
      const code = (error as {code?: string}).code;
      return code === '23514' || code === '40001';
    });
    finish.release(); await held; await rejected;
    assert.equal((await sql`select count(*)::int as n from task_dependencies where task_id=${c} and depends_on_task_id=${d}`)[0].n, 0);
  } finally { finish.release(); await held; }
});
