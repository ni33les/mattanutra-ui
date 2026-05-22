import { getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("Database is not configured");
}

const [
  versionTables,
  legacySidecars,
  missingAssessmentBaselines,
  missingSupplementBaselines,
  missingProductBaselines,
  mutableTriggerRows
] = await Promise.all([
  sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'assessment_versions',
        'nutrition_plan_versions',
        'supplement_versions',
        'product_versions',
        'product_recommendation_runs',
        'product_recommendation_items'
      )
    order by table_name
  `,
  sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'assessment_events',
        'supplement_alias_events',
        'product_fact_versions'
      )
    order by table_name
  `,
  sql`
    select count(*)::int as count
    from public.assessments
    where not exists (
      select 1
      from public.assessment_versions
      where assessment_versions.plan_id = assessments.plan_id
    )
  `,
  sql`
    select count(*)::int as count
    from public.supplements
    where not exists (
      select 1
      from public.supplement_versions
      where supplement_versions.supplement_id = supplements.id
    )
  `,
  sql`
    select count(*)::int as count
    from public.products
    where not exists (
      select 1
      from public.product_versions
      where product_versions.product_id = products.id
    )
  `,
  sql`
    select distinct trigger_name
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'assessment_versions_no_update_delete',
        'nutrition_plan_versions_no_update_delete',
        'supplement_versions_no_update_delete',
        'product_versions_no_update_delete',
        'supplement_safety_limits_no_update_delete',
        'product_recommendation_runs_no_update_delete',
        'product_recommendation_items_no_update_delete'
      )
    order by trigger_name
  `
]);

await sql.end({ timeout: 1 });

const report = {
  legacySidecars,
  missingAssessmentBaselines: missingAssessmentBaselines[0]?.count ?? 0,
  missingProductBaselines: missingProductBaselines[0]?.count ?? 0,
  missingSupplementBaselines: missingSupplementBaselines[0]?.count ?? 0,
  versionTables,
  versionTableTriggers: mutableTriggerRows
};

console.log(JSON.stringify(report, null, 2));

if (
  report.legacySidecars.length > 0 ||
  report.missingAssessmentBaselines > 0 ||
  report.missingProductBaselines > 0 ||
  report.missingSupplementBaselines > 0 ||
  report.versionTables.length < 6 ||
  report.versionTableTriggers.length < 7
) {
  process.exitCode = 1;
}
