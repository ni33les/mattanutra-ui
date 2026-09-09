import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { getFunnelReadiness } from "../../lib/funnel-readiness.ts";
import { persistAssessmentSubmission, toJsonValue } from "../../lib/assessment-store.ts";
import { createAssessmentSnapshot } from "../../lib/assessment-snapshot.ts";
import { computeHealthScore } from "../../lib/health-score.ts";
import { completeHealthScoreFixture } from "../fixtures/healthscore.ts";
import { FUNNEL_GENERATOR_VERSION } from "../../lib/assessment-revisions.ts";
import { closeSqlPool } from "../../lib/db.ts";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is mandatory");
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/); assert.notEqual(url.port, "5432");
const sql = postgres(url.href, { max: 3, prepare: false });
after(async () => { await sql.end(); await closeSqlPool(); });
const answers = { firstName: "Efficiency fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
async function seed() {
  const planId = randomUUID(); await persistAssessmentSubmission({ answers, locale: "en", status: "captured", selectedPlan: "precision",
    snapshot: createAssessmentSnapshot({ planId, healthScore: computeHealthScore(answers, "en") }) }); return planId;
}

test("EFF-FUNNEL-PG-01 readiness is read-only when missing work is behind an assessment write lock", async () => {
  const id = await seed(); let release!: () => void, entered!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
  const writer = sql.begin(async tx => { await tx`update public.assessments set updated_at=now() where plan_id=${id}::uuid`; entered(); await hold; });
  await ready;
  try {
    const result = await getFunnelReadiness(id, "en"); assert.ok(result); assert.equal(result.copyReady, false);
    assert.equal(Number((await sql`select count(*) as n from public.tasks where plan_id=${id}::uuid`)[0].n), 0);
  } finally { release(); await writer; }
});

test("EFF-FUNNEL-PG-02 persisted readiness is small, localized and invalidates when advice changes", async () => {
  const id = await seed(), result = completeHealthScoreFixture("en");
  // Use the same maintained projector as worker persistence and legacy backfill.
  const projection = await import("../../lib/healthscore-readiness.ts");
  const ready = projection.healthScoreReadProjection(result);
  await sql`insert into public.assessment_healthscore_results(plan_id,revision,locale,generator_version,result,read_projection)
    values(${id}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(toJsonValue(result))},${sql.json(ready)})`;
  let captured: Record<string, unknown>[] = [];
  const observed = new Proxy(sql, { apply: async (target, receiver, args) => {
    const rows = await Reflect.apply(target, receiver, args); captured = rows; return rows;
  } });
  assert.equal((await getFunnelReadiness(id, "en", observed))?.copyReady, true);
  assert.equal(captured[0].health_score, null); assert.equal(captured[0].copy_ready, true);
  assert.ok(Buffer.byteLength(JSON.stringify(captured)) < 2000);
  assert.equal((await getFunnelReadiness(id, "th"))?.copyReady, false);
  assert.ok(Buffer.byteLength(JSON.stringify(ready)) < 150);
  await sql`update public.assessment_healthscore_results set result='{}'::jsonb where plan_id=${id}::uuid`;
  const [row] = await sql`select read_projection from public.assessment_healthscore_results where plan_id=${id}::uuid`;
  assert.equal(row.read_projection, null); assert.equal((await getFunnelReadiness(id, "en"))?.copyReady, false);
});
