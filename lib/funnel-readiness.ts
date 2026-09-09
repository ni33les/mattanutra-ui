import { getSql } from "@/lib/db";
import { isUuid, hasHealthScoreAiCopy } from "@/lib/assessment-store";
import { isLocale, type Locale } from "@/lib/i18n";
import { FUNNEL_GENERATOR_VERSION } from "@/lib/assessment-revisions";
import { nutritionJourneyStatusFromCounts, nutritionJourneyWorkTimeline } from "@/lib/nutrition-journey-status";

/** One projection for copy gates, journey polling, formulation responses and reveal rendering. */
export async function getFunnelReadiness(planId: string, localeOption?: string | null, sql = getSql()) {
  if (!sql || !isUuid(planId)) return null;
  const requestedLocale = isLocale(localeOption) ? localeOption : null;
  const [row] = await sql`select a.input_revision, a.input_hash, coalesce(${requestedLocale}, a.locale) as requested_locale,
      a.selected_plan, a.status as assessment_status, coalesce(a.funnel_skip_healthscore, a.answers ? 'inStorePharmacy') as skip_healthscore,
      case when score.read_projection->>'version' = '1' then null else score.result end as health_score,
      case when score.read_projection->>'version' = '1' then (score.read_projection->'ready'->>coalesce(${requestedLocale}, a.locale))::boolean else null end as copy_ready,
      score.created_at as score_version,
      formula.version as formula_version, formula.visible_count, formula.section_status,
      products.id as product_version, products.generated_at as product_generated_at, products.status as product_status,
      products.stack_coverage_percent, products.product_count,
      payment.status as payment_status, payment.fulfillment_status, payment.fulfillment_error,
      tasks.statuses, tasks.copy_status, tasks.formula_status, tasks.product_task_status,
      food.version as food_version, report.version as report_version
    from public.assessments a
    left join public.assessment_healthscore_results score on score.plan_id = a.plan_id and score.revision = a.input_revision
      and score.locale = coalesce(${requestedLocale}, a.locale) and score.generator_version = ${FUNNEL_GENERATOR_VERSION}
    left join lateral (
      select f.version, case when f.read_projection->>'version' = '1' then f.read_projection->>'sectionStatus' else f.formulation #>> '{sectionStatuses,supplements}' end as section_status,
        case when f.read_projection->>'version' = '1' then (f.read_projection->>'visibleCount')::int else
        (select count(*)::int from jsonb_array_elements(coalesce(f.formulation->'supplementBreakdown', '[]'::jsonb)) item
          where coalesce(item #>> '{safety,visibility}', 'visible') <> 'hidden') end as visible_count
      from public.formulations f where f.plan_id = a.plan_id and f.assessment_revision = a.input_revision
        and f.generation_locale = coalesce(${requestedLocale}, a.locale) and f.generator_version = ${FUNNEL_GENERATOR_VERSION}
        and (case when a.selected_plan is null then f.model_version like '%:example'
          else (f.model_version is null or f.model_version not like '%:example') end) order by f.version desc limit 1
    ) formula on true
    left join lateral (
      select r.id, r.generated_at, r.status, r.stack_coverage_percent,
        (select count(*)::int from public.product_recommendation_items i where i.run_id = r.id) as product_count
      from public.product_recommendation_runs r where r.catalogue_revision = (select revision from public.catalogue_runtime_revision where singleton=true) and r.plan_id = a.plan_id and r.assessment_revision = a.input_revision
        and r.generation_locale = coalesce(${requestedLocale}, a.locale) and r.generator_version = ${FUNNEL_GENERATOR_VERSION}
        and r.selection_revision = coalesce((select revision from public.assessment_product_preferences where plan_id = a.plan_id), 0)
      order by r.generated_at desc limit 1
    ) products on true
    left join lateral (select p.status, p.fulfillment_status, p.fulfillment_error from public.payments p
      where p.plan_id = a.plan_id and (p.status in ('paid', 'bound') or p.paid_at is not null)
      order by p.created_at desc limit 1) payment on true
    left join lateral (
      select array_agg(latest.status) filter (where latest.task_type <> 'analyze_healthscore') as statuses,
        max(latest.status) filter (where latest.task_type = 'analyze_healthscore') as copy_status,
        max(latest.status) filter (where latest.task_type = 'generate_supplement_guidance') as formula_status,
        max(latest.status) filter (where latest.task_type = 'generate_product_recommendations') as product_task_status
      from (select distinct on (t.task_type) t.task_type, t.status::text from public.tasks t where t.plan_id = a.plan_id
        and t.task_type in ('analyze_healthscore','generate_supplement_guidance','generate_product_recommendations')
        and (t.task_type <> 'generate_product_recommendations' or coalesce((t.payload #>> '{productPreferences,revision}')::bigint, 0) = coalesce((select revision from public.assessment_product_preferences where plan_id = a.plan_id), 0))
        and t.payload #>> '{generation,revision}' = a.input_revision::text
        and t.payload #>> '{generation,locale}' = coalesce(${requestedLocale}, a.locale)
        and t.payload #>> '{generation,generatorVersion}' = ${FUNNEL_GENERATOR_VERSION}
        order by t.task_type, t.created_at desc) latest
    ) tasks on true
    left join lateral (select f.version from public.food_guidance f where f.plan_id = a.plan_id and f.assessment_revision = a.input_revision
      and f.generation_locale = coalesce(${requestedLocale}, a.locale) and f.generator_version = ${FUNNEL_GENERATOR_VERSION} order by f.version desc limit 1) food on true
    left join lateral (select r.version from public.nutrition_reports r where r.plan_id = a.plan_id and r.assessment_revision = a.input_revision
      and r.generation_locale = coalesce(${requestedLocale}, a.locale) and r.generator_version = ${FUNNEL_GENERATOR_VERSION} order by r.version desc limit 1) report on true
    where a.plan_id = ${planId}::uuid`;
  if (!row) return null;
  const locale = row.requested_locale as Locale;
  const copyReady = row.skip_healthscore === true || (row.copy_ready ?? hasHealthScoreAiCopy(row.health_score, locale));
  const copyFailed = !copyReady && ["failed", "cancelled", "completed"].includes(row.copy_status ?? "");
  const hasPaidPlan = Boolean(row.selected_plan || row.payment_status);
  const fulfillmentStatus = row.fulfillment_status ?? (row.selected_plan ? "complete" : "not_started");
  const fulfillmentPending = Boolean(row.payment_status && fulfillmentStatus !== "complete");
  const taskStatuses = [row.formula_version ? null : row.formula_status, row.product_version ? null : row.product_task_status].filter((s): s is string => typeof s === "string");
  // A failed older projection does not override a current retry or an available current result.
  const status = fulfillmentPending ? (fulfillmentStatus === "failed" ? "failed" : "formulation_pending")
    : !copyReady ? (copyFailed ? "failed" : hasPaidPlan ? "formulation_pending" : "healthscore_only")
    : nutritionJourneyStatusFromCounts({ hasPaidPlan, formulationComplete: Boolean(row.formula_version),
      productCount: Number(row.product_count ?? 0), visibleSupplementCount: Number(row.visible_count ?? 0),
      productSectionStatus: row.product_version || (row.formula_version && Number(row.visible_count) === 0) ? "ready" : row.section_status,
      stackCoveragePercent: row.stack_coverage_percent == null ? null : Number(row.stack_coverage_percent),
      taskStatuses: taskStatuses.filter(s => s !== "completed") });
  const timeline = nutritionJourneyWorkTimeline({ status, hasHealthScore: copyReady });
  const formulationStatus = fulfillmentPending || !copyReady ? "pending"
    : row.formula_version ? "ready"
    : row.formula_status === "completed" ? "inconsistent"
    : ["failed", "cancelled"].includes(row.formula_status ?? "") ? "failed" : "pending";
  return { ...timeline, planId, locale, revision: Number(row.input_revision), inputHash: row.input_hash as string | null,
    copyReady, copyFailed, hasHealthScore: copyReady, hasPaidPlan, fulfillmentStatus, fulfillmentError: row.fulfillment_error as string | null,
    formulationStatus, refreshPending: ["queued", "reserved", "running", "needs_review", "waiting_approval"].includes(row.product_task_status ?? ""), generationStatus: timeline.readyForReveal ? "ready" : timeline.failed ? "failed" : "pending",
    resultVersion: [row.input_revision, locale, FUNNEL_GENERATOR_VERSION, row.score_version ? new Date(row.score_version).getTime() : 0,
      row.formula_version ?? 0, row.product_version ?? "", row.product_generated_at ? new Date(row.product_generated_at).getTime() : 0,
      row.food_version ?? 0, row.report_version ?? 0, row.product_task_status ?? "",
      copyReady, row.copy_status ?? "", row.formula_status ?? "", row.payment_status ?? "", fulfillmentStatus].join(":") };
}
