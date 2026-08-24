import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  nutritionJourneyStatusFromCounts,
  nutritionJourneyWorkTimeline,
  type JourneyWorkTimeline,
  type NutritionJourneyStatus
} from "@/lib/nutrition-journey-status";

export type NutritionJourneySnapshot = JourneyWorkTimeline &
  Readonly<{
    copyFailed: boolean;
    copyReady: boolean;
    hasHealthScore: boolean;
    planId: string;
  }>;

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function heroTextFromStored(raw: string | null) {
  const text = String(raw ?? "").trim();

  if (!text) {
    return "";
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;

      if (typeof parsed === "string") {
        return parsed.trim();
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const localized = [record.en, record.th, record["zh-CN"]].find(
          (item) => typeof item === "string" && item.trim()
        );

        return typeof localized === "string" ? localized.trim() : "";
      }
    } catch {
      return "";
    }
  }

  return text;
}

function copyFlagsFromRow(row: {
  ai_hero_body: string | null;
  copy_task_status: string | null;
}) {
  const copyReady = heroTextFromStored(row.ai_hero_body).length > 0;
  const copyTaskStatus = String(row.copy_task_status ?? "");
  const copyFailed =
    !copyReady &&
    (copyTaskStatus === "failed" ||
      copyTaskStatus === "cancelled" ||
      copyTaskStatus === "completed");

  return { copyFailed, copyReady };
}

export async function getHealthScoreCopySnapshot(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql<
    Array<{
      ai_hero_body: string | null;
      copy_task_status: string | null;
    }>
  >`
    select
      case
        when jsonb_typeof(
          assessments.health_score #> '{pageContent,aiCopy,heroBody}'
        ) = 'string'
          then assessments.health_score #>> '{pageContent,aiCopy,heroBody}'
        else coalesce(
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,en}',
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,th}',
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,zh-CN}'
        )
      end as ai_hero_body,
      copy_task.status::text as copy_task_status
    from public.assessments
    left join lateral (
      select tasks.status
      from public.tasks
      where tasks.plan_id = assessments.plan_id
        and tasks.task_type = 'analyze_healthscore'
      order by tasks.created_at desc
      limit 1
    ) copy_task on true
    where assessments.plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    planId,
    ...copyFlagsFromRow(row)
  };
}

export async function getNutritionJourneySnapshot(
  planId: string
): Promise<NutritionJourneySnapshot | null> {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql<
    Array<{
      assessment_status: string | null;
      copy_task_status: string | null;
      has_paid_plan: boolean;
      health_score_score: string | number | null;
      ai_hero_body: string | null;
      product_count: number | null;
      section_supplements: string | null;
      stack_coverage_percent: number | null;
      task_statuses: unknown;
      visible_supplement_count: number | null;
    }>
  >`
    select
      assessments.status::text as assessment_status,
      assessments.selected_plan is not null as has_paid_plan,
      assessments.health_score ->> 'score' as health_score_score,
      case
        when jsonb_typeof(
          assessments.health_score #> '{pageContent,aiCopy,heroBody}'
        ) = 'string'
          then assessments.health_score #>> '{pageContent,aiCopy,heroBody}'
        else coalesce(
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,en}',
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,th}',
          assessments.health_score #>> '{pageContent,aiCopy,heroBody,zh-CN}'
        )
      end as ai_hero_body,
      copy_task.status::text as copy_task_status,
      formulations.visible_supplement_count,
      formulations.section_supplements,
      recs.product_count,
      recs.stack_coverage_percent,
      task_rollups.task_statuses
    from public.assessments
    left join lateral (
      select
        (
          select count(*)::int
          from jsonb_array_elements(
            coalesce(latest.formulation -> 'supplementBreakdown', '[]'::jsonb)
          ) as element
          where coalesce(element -> 'safety' ->> 'visibility', 'visible')
            is distinct from 'hidden'
        ) as visible_supplement_count,
        latest.formulation #>> '{sectionStatuses,supplements}' as section_supplements
      from public.formulations latest
      where latest.plan_id = assessments.plan_id
        and (
          latest.model_version is null
          or latest.model_version not like '%:example'
        )
      order by latest.version desc, latest.generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select
        coalesce(jsonb_array_length(rec.recommendations), 0)::int as product_count,
        runs.stack_coverage_percent
      from public.product_recommendation_runs runs
      left join lateral (
        select recommendations
        from public.recommendations
        where recommendations.plan_id = assessments.plan_id
        order by version desc, generated_at desc
        limit 1
      ) rec on true
      where runs.plan_id = assessments.plan_id
      order by runs.generated_at desc
      limit 1
    ) recs on true
    left join lateral (
      select coalesce(
        (
          select array_agg(latest.status::text)
          from (
            select distinct on (tasks.task_type) tasks.status
            from public.tasks
            where tasks.plan_id = assessments.plan_id
              and tasks.task_type in (
                'generate_supplement_guidance',
                'generate_product_recommendations'
              )
            order by tasks.task_type, tasks.created_at desc
          ) latest
        ),
        '{}'::text[]
      ) as task_statuses
    ) task_rollups on true
    left join lateral (
      select tasks.status
      from public.tasks
      where tasks.plan_id = assessments.plan_id
        and tasks.task_type = 'analyze_healthscore'
      order by tasks.created_at desc
      limit 1
    ) copy_task on true
    where assessments.plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const score = Number(row.health_score_score);
  const hasHealthScore =
    Number.isFinite(score) || row.has_paid_plan === true;
  const { copyFailed, copyReady } = copyFlagsFromRow(row);
  const status: NutritionJourneyStatus = nutritionJourneyStatusFromCounts({
    assessmentStatus: row.assessment_status,
    hasPaidPlan: row.has_paid_plan === true,
    productCount: asNumber(row.product_count),
    productSectionStatus: row.section_supplements,
    stackCoveragePercent:
      row.stack_coverage_percent === null || row.stack_coverage_percent === undefined
        ? null
        : asNumber(row.stack_coverage_percent),
    taskStatuses: asStringArray(row.task_statuses),
    visibleSupplementCount: asNumber(row.visible_supplement_count)
  });

  return {
    ...nutritionJourneyWorkTimeline({ hasHealthScore, status }),
    copyFailed,
    copyReady,
    hasHealthScore,
    planId
  };
}
