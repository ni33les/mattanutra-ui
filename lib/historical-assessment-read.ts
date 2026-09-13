import type postgres from "postgres";

type Db = postgres.Sql | postgres.TransactionSql;

/** Read-only provenance for paid results written before input revisions existed.
 * A newer input identity, different answers/locale, or missing durable evidence
 * disables this path. It never promotes a historical result to a current one.
 */
export function historicalAssessmentReadJoin(sql: Db, assessmentAlias: "a" | "assessments", locale: string | null) {
  const a = sql(assessmentAlias);
  return sql`left join lateral (
    select f.version as formula_version, t.created_at as started_at
    from public.tasks t
    join public.formulations f on f.plan_id = t.plan_id
      and f.generated_at between t.created_at and t.completed_at
      and f.assessment_revision is null and f.generation_locale is null and f.generator_version is null
      and (f.model_version is null or f.model_version not like '%:example')
    where ${a}.input_revision = 0 and ${a}.input_hash is null and ${a}.status = 'ready'
      and ${a}.selected_plan is not null and ${a}.locale = coalesce(${locale}, ${a}.locale)
      and t.plan_id = ${a}.plan_id and t.task_type = 'generate_supplement_guidance' and t.status = 'completed'
      and t.payload->'generation' is null and t.payload->'answers' = ${a}.answers
      and t.payload->>'locale' = ${a}.locale and t.payload->>'plan' = ${a}.selected_plan::text
      and exists (select 1 from public.assessment_versions v where v.plan_id = ${a}.plan_id
        and v.action = 'healthscore_snapshot_recorded'
        and v.snapshot #> '{projectionBefore,answers}' = ${a}.answers
        and v.snapshot #>> '{projectionBefore,locale}' = ${a}.locale
        and v.snapshot #> '{projectionPatch,healthScore}' = ${a}.health_score)
    order by f.version desc, t.completed_at desc limit 1
  ) historical on true`;
}

/** Only unversioned output from the evidenced generation may use this fallback. */
export function historicalResult(sql: Db, table: string, formula = false) {
  const r = sql(table);
  return sql`(historical.formula_version is not null and ${r}.assessment_revision is null
    and ${r}.generation_locale is null and ${r}.generator_version is null
    and ${r}.generated_at >= historical.started_at
    ${formula ? sql`and ${r}.version = historical.formula_version` : sql``})`;
}
