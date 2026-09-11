import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { closeSqlPool } from "../../lib/db.ts";

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
  } finally { await sql.end(); await closeSqlPool(); }
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

test("LOCK-BOUNDARY-PG-05 product publication reconciles runs, lines and decision facts in PostgreSQL", async () => {
  const { prepareTaskCompletionResult, applyTaskCompletionResult } = await import("../../lib/task-result-applier.ts");
  const { FUNNEL_GENERATOR_VERSION } = await import("../../lib/assessment-revisions.ts");
  const rollback = new Error("Rollback publication fixture");
  await assert.rejects(sql.begin(async tx => {
    const planId = randomUUID();
    await tx`insert into assessments(plan_id,locale,answers,input_revision,input_hash) values(${planId},'en','{}',1,'lock-boundary')`;
    const [product] = await tx`select id,title from products order by id limit 1`;
    assert.ok(product, "Controlled catalogue product is required");
    const reference = { runtimeRevision: 99, fingerprint: "a".repeat(64) };
    const task = { id: ids[0], planId, taskType: "generate_product_recommendations", payload: { catalogueRevision: 99, safetyReferenceIdentity: reference,
      generation: { revision: 1, locale: "en", inputHash: "lock-boundary", generatorVersion: FUNNEL_GENERATOR_VERSION, answers: {} } } };
    const payload = { catalogueRevision: 99, safetyReferenceIdentity: reference,
      recommendations: [{ product: { id: product.id, title: product.title, priceAmount: 123.45, currency: "THB", platform: "manual" },
        rank: 1, score: 9, productCoveragePercent: 75, stackContributionPercent: 75, servingMultiplier: 2, coveredNeeds: [], why: "Frozen advice", url: "https://fixture.invalid", unknownAtRecommendation: false }],
      stackCoveragePercent: 75, diagnostics: { stackPreference: "balanced", trace: {} } };
    const prepared = await prepareTaskCompletionResult({ task: task as never, resultPayload: payload, sql: tx as never });
    assert.ok(prepared.products?.selected);
    const result = await applyTaskCompletionResult({ task: task as never, taskId: task.id, resultPayload: payload, preparedResult: prepared, sql: tx as never, afterCommit: () => {} }) as { recommendationRunId: string };
    const rows = await tx`select i.serving_multiplier,i.price_amount,d.is_current,d.reason from product_recommendation_items i
      join product_recommendation_decisions d on d.run_id=i.run_id and d.product_id=i.product_id where i.run_id=${result.recommendationRunId}::uuid`;
    assert.equal(rows.length, 1); assert.equal(rows[0].serving_multiplier, 2);
    assert.equal(Number(rows[0].price_amount), 123.45); assert.equal(rows[0].is_current, true);
    assert.equal(result.recommendationRunId, prepared.products.selected.runId);
    throw rollback;
  }), error => error === rollback);
});
