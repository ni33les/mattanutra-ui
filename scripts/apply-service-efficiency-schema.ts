import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { healthScoreReadProjection } from "../lib/healthscore-readiness.ts";
import { planStatusProjection } from "../lib/agentic/presentation/status-projection.ts";

assert.ok(process.env.DB_URL, "DB_URL is required");
const sql = postgres(process.env.DB_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.begin(async tx => {
    await tx`set local lock_timeout='2s'`; await tx`set local statement_timeout='15s'`;
    await tx.unsafe(readFileSync(new URL("./service-efficiency-schema.sql", import.meta.url), "utf8"));
  });
  let operations = 0, revisions = 0, unsupported = 0;
  for (;;) {
    const rows = await sql`with batch as (select id from public.agentic_plan_operations where read_projection is null limit 50)
      update public.agentic_plan_operations x set record_json=x.record_json from batch where x.id=batch.id returning x.id`;
    operations += rows.length; if (rows.length < 50) break;
  }
  let afterPlan = "00000000-0000-0000-0000-000000000000", afterRevision = 0;
  for (;;) {
    const rows = await sql`select plan_id,revision,result,xmin::text as row_version from public.agentic_plan_revisions
      where status_projection is null and (plan_id,revision)>(${afterPlan}::uuid,${afterRevision}) order by plan_id,revision limit 25`;
    for (const row of rows) {
      const projection = planStatusProjection(row.result);
      if (!projection) { unsupported++; continue; }
      const updated = await sql`update public.agentic_plan_revisions set status_projection=jsonb_set(${sql.json(projection)}::jsonb,'{catalogueRevision}',
        coalesce((select snapshot_json->'runtimeRevision' from public.agentic_catalogue_snapshots where snapshot_id=${projection.snapshotId}),${sql.json(projection.catalogueRevision)}::jsonb,'null'::jsonb))
        where plan_id=${row.plan_id}::uuid and revision=${row.revision} and xmin::text=${row.row_version} and status_projection is null returning revision`;
      revisions += updated.length;
    }
    if (rows.length < 25) break;
    afterPlan = rows.at(-1)!.plan_id; afterRevision = rows.at(-1)!.revision;
  }
  let scores = 0, formulas = 0, assessments = 0;
  for (;;) {
    const rows = await sql`select plan_id,revision,locale,generator_version,result,xmin::text as row_version
      from public.assessment_healthscore_results where read_projection is null order by plan_id,revision,locale,generator_version limit 25`;
    for (const row of rows) {
      const projection = healthScoreReadProjection(row.result);
      const updated = await sql`update public.assessment_healthscore_results set read_projection=${sql.json(projection)}
        where plan_id=${row.plan_id}::uuid and revision=${row.revision} and locale=${row.locale} and generator_version=${row.generator_version}
        and xmin::text=${row.row_version} and read_projection is null returning plan_id`;
      scores += updated.length;
    }
    if (rows.length < 25) break;
  }
  for (;;) {
    const rows = await sql`with batch as (select plan_id,version from public.formulations where read_projection is null limit 25)
      update public.formulations x set formulation=x.formulation from batch where x.plan_id=batch.plan_id and x.version=batch.version returning x.plan_id`;
    formulas += rows.length; if (rows.length < 25) break;
  }
  for (;;) {
    const rows = await sql`with batch as (select plan_id from public.assessments where funnel_skip_healthscore is null limit 50)
      update public.assessments x set answers=x.answers from batch where x.plan_id=batch.plan_id returning x.plan_id`;
    assessments += rows.length; if (rows.length < 50) break;
  }
  console.log(JSON.stringify({ schema: "service-efficiency-1", operations, revisions, scores, formulas, assessments, unsupported, legacyFallback: true }));
} finally { await sql.end(); }
