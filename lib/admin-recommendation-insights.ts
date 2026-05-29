import { getSql } from "@/lib/db";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import type { Locale } from "@/lib/i18n";

export type InsightRankRow = Readonly<{
  count: number;
  id: string;
  label: string;
  secondaryLabel?: string | null;
}>;

export type InsightBucketRow = Readonly<{
  count: number;
  label: string;
  parentLabel?: string | null;
}>;

export type AdminSupplementSelectionStats = Readonly<{
  addCount: number;
  chosenPlanCount: number;
  coveredCount: number;
  lastSelectedAt: string | null;
  reviewCount: number;
  safetyHiddenCount: number;
  topDoses: InsightBucketRow[];
  unmatchedCount: number;
}>;

export type AdminProductDecisionStats = Readonly<{
  averageProductCoveragePercent: number | null;
  averageStackContributionPercent: number | null;
  chosenPlanCount: number;
  lastChosenAt: string | null;
  nearMissCount: number;
  rejectedCount: number;
  topRejectionReasons: InsightBucketRow[];
  topServingMultipliers: InsightBucketRow[];
}>;

export type AdminRecommendationInsightsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  productOutcomeMix: InsightBucketRow[];
  productRejectionReasons: InsightBucketRow[];
  productServingBuckets: InsightBucketRow[];
  productTopChosen: InsightRankRow[];
  productTopNearMisses: InsightRankRow[];
  range: AdminDashboardRange;
  summary: {
    chosenProductPlans: number;
    chosenSupplementPlans: number;
    nearMissProducts: number;
    rejectedProducts: number;
    safetyHiddenSupplements: number;
    unmatchedSupplements: number;
  };
  supplementDoseBuckets: InsightBucketRow[];
  supplementStatusMix: InsightBucketRow[];
  supplementTop: InsightRankRow[];
  trend: {
    bucketLabels: string[];
    productChosen: number[];
    supplementChosen: number[];
  };
  unmetOrCoveredNeeds: InsightRankRow[];
  unmatchedSupplements: InsightRankRow[];
}>;

type SchemaAvailability = Readonly<{
  productDecisions: boolean;
  supplementSelections: boolean;
}>;

const emptyStats = {
  chosenProductPlans: 0,
  chosenSupplementPlans: 0,
  nearMissProducts: 0,
  rejectedProducts: 0,
  safetyHiddenSupplements: 0,
  unmatchedSupplements: 0
};

export function emptyAdminRecommendationInsightsData(
  range: AdminDashboardRange
): AdminRecommendationInsightsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    productOutcomeMix: [],
    productRejectionReasons: [],
    productServingBuckets: [],
    productTopChosen: [],
    productTopNearMisses: [],
    range,
    summary: emptyStats,
    supplementDoseBuckets: [],
    supplementStatusMix: [],
    supplementTop: [],
    trend: {
      bucketLabels: [],
      productChosen: [],
      supplementChosen: []
    },
    unmetOrCoveredNeeds: [],
    unmatchedSupplements: []
  };
}

export async function recommendationInsightsSchemaAvailable(
  sql = getSql()
): Promise<SchemaAvailability> {
  if (!sql) {
    return {
      productDecisions: false,
      supplementSelections: false
    };
  }

  const rows = await sql<Array<{
    product_decisions: string | null;
    supplement_selections: string | null;
  }>>`
    select
      to_regclass('public.product_recommendation_decisions')::text as product_decisions,
      to_regclass('public.supplement_recommendation_selections')::text as supplement_selections
  `;
  const row = rows[0];

  return {
    productDecisions: Boolean(row?.product_decisions),
    supplementSelections: Boolean(row?.supplement_selections)
  };
}

function rangeStartParam(range: AdminDashboardRange) {
  return adminDashboardRangeStart(range);
}

function isoOrNull(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function doseLabel(row: {
  dose_amount: number | string | null;
  dose_unit: string | null;
  daily_dose_text: string | null;
}) {
  const amount = optionalNumber(row.dose_amount);

  if (amount !== null && row.dose_unit) {
    return `${amount} ${row.dose_unit}`;
  }

  return row.daily_dose_text || "Unparsed";
}

function bucketExpression(range: AdminDashboardRange) {
  if (range === "hour") {
    return "minute";
  }

  if (range === "day" || range === "week" || range === "month") {
    return "day";
  }

  return "month";
}

function bucketLabel(value: Date | string, range: AdminDashboardRange) {
  const date = new Date(value);

  if (range === "hour") {
    return date.toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (range === "year" || range === "all") {
    return date.toLocaleDateString("en", {
      month: "short",
      year: "2-digit"
    });
  }

  return date.toLocaleDateString("en", {
    day: "2-digit",
    month: "short"
  });
}

export async function getSupplementSelectionStatsBySupplement(
  range: AdminDashboardRange
) {
  const sql = getSql();

  if (!sql) {
    return new Map<string, AdminSupplementSelectionStats>();
  }

  const availability = await recommendationInsightsSchemaAvailable(sql);

  if (!availability.supplementSelections) {
    return new Map<string, AdminSupplementSelectionStats>();
  }

  const start = rangeStartParam(range);
  const rows = await sql<Array<{
    add_count: number | string;
    chosen_plan_count: number | string;
    covered_count: number | string;
    last_selected_at: Date | string | null;
    review_count: number | string;
    safety_hidden_count: number | string;
    supplement_id: string;
    unmatched_count: number | string;
  }>>`
    select
      supplement_recommendation_selections.supplement_id::text,
      count(distinct supplement_recommendation_selections.plan_id) filter (
        where coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      ) as chosen_plan_count,
      count(*) filter (where supplement_recommendation_selections.status = 'add') as add_count,
      count(*) filter (where supplement_recommendation_selections.status = 'review') as review_count,
      count(*) filter (where supplement_recommendation_selections.status = 'covered') as covered_count,
      count(*) filter (where supplement_recommendation_selections.safety_visibility = 'hidden') as safety_hidden_count,
      count(*) filter (where supplement_recommendation_selections.supplement_id is null) as unmatched_count,
      max(supplement_recommendation_selections.generated_at) filter (
        where coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      ) as last_selected_at
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and supplement_recommendation_selections.supplement_id is not null
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by supplement_recommendation_selections.supplement_id
  `;
  const doseRows = await sql<Array<{
    count: number | string;
    daily_dose_text: string | null;
    dose_amount: number | string | null;
    dose_unit: string | null;
    supplement_id: string;
  }>>`
    select
      supplement_recommendation_selections.supplement_id::text,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text,
      count(distinct supplement_recommendation_selections.plan_id) as count
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and supplement_recommendation_selections.supplement_id is not null
      and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by
      supplement_recommendation_selections.supplement_id,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text
    order by count desc
  `;
  const dosesBySupplement = new Map<string, InsightBucketRow[]>();

  for (const row of doseRows) {
    const list = dosesBySupplement.get(row.supplement_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: doseLabel(row)
      });
      dosesBySupplement.set(row.supplement_id, list);
    }
  }

  return new Map(
    rows.map((row) => [
      row.supplement_id,
      {
        addCount: numberValue(row.add_count),
        chosenPlanCount: numberValue(row.chosen_plan_count),
        coveredCount: numberValue(row.covered_count),
        lastSelectedAt: isoOrNull(row.last_selected_at),
        reviewCount: numberValue(row.review_count),
        safetyHiddenCount: numberValue(row.safety_hidden_count),
        topDoses: dosesBySupplement.get(row.supplement_id) ?? [],
        unmatchedCount: numberValue(row.unmatched_count)
      }
    ])
  );
}

export async function getProductDecisionStatsByProduct(
  range: AdminDashboardRange
) {
  const sql = getSql();

  if (!sql) {
    return new Map<string, AdminProductDecisionStats>();
  }

  const availability = await recommendationInsightsSchemaAvailable(sql);

  if (!availability.productDecisions) {
    return new Map<string, AdminProductDecisionStats>();
  }

  const start = rangeStartParam(range);
  const rows = await sql<Array<{
    average_product_coverage_percent: number | string | null;
    average_stack_contribution_percent: number | string | null;
    chosen_plan_count: number | string;
    last_chosen_at: Date | string | null;
    near_miss_count: number | string;
    product_id: string;
    rejected_count: number | string;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      count(distinct product_recommendation_decisions.plan_id) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as chosen_plan_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'near_miss') as near_miss_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'rejected') as rejected_count,
      avg(product_recommendation_decisions.product_coverage_percent) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as average_product_coverage_percent,
      avg(product_recommendation_decisions.stack_contribution_percent) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as average_stack_contribution_percent,
      max(product_recommendation_decisions.generated_at) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as last_chosen_at
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by product_recommendation_decisions.product_id
  `;
  const servingRows = await sql<Array<{
    count: number | string;
    product_id: string;
    serving_multiplier: number | string;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      product_recommendation_decisions.serving_multiplier,
      count(distinct product_recommendation_decisions.plan_id) as count
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome = 'chosen'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by
      product_recommendation_decisions.product_id,
      product_recommendation_decisions.serving_multiplier
    order by count desc
  `;
  const rejectionRows = await sql<Array<{
    count: number | string;
    product_id: string;
    reason: string | null;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      product_recommendation_decisions.reason,
      count(*) as count
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome = 'rejected'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by
      product_recommendation_decisions.product_id,
      product_recommendation_decisions.reason
    order by count desc
  `;
  const servingsByProduct = new Map<string, InsightBucketRow[]>();
  const rejectionsByProduct = new Map<string, InsightBucketRow[]>();

  for (const row of servingRows) {
    const list = servingsByProduct.get(row.product_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: `${numberValue(row.serving_multiplier)} serving${numberValue(row.serving_multiplier) === 1 ? "" : "s"}`
      });
      servingsByProduct.set(row.product_id, list);
    }
  }

  for (const row of rejectionRows) {
    const list = rejectionsByProduct.get(row.product_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: row.reason || "Rejected"
      });
      rejectionsByProduct.set(row.product_id, list);
    }
  }

  return new Map(
    rows.map((row) => [
      row.product_id,
      {
        averageProductCoveragePercent: optionalNumber(
          row.average_product_coverage_percent
        ),
        averageStackContributionPercent: optionalNumber(
          row.average_stack_contribution_percent
        ),
        chosenPlanCount: numberValue(row.chosen_plan_count),
        lastChosenAt: isoOrNull(row.last_chosen_at),
        nearMissCount: numberValue(row.near_miss_count),
        rejectedCount: numberValue(row.rejected_count),
        topRejectionReasons: rejectionsByProduct.get(row.product_id) ?? [],
        topServingMultipliers: servingsByProduct.get(row.product_id) ?? []
      }
    ])
  );
}

export async function getAdminRecommendationInsightsData(
  range: AdminDashboardRange,
  locale: Locale = "en"
): Promise<AdminRecommendationInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminRecommendationInsightsData(range);
  }

  try {
    const availability = await recommendationInsightsSchemaAvailable(sql);

    if (!availability.productDecisions || !availability.supplementSelections) {
      return emptyAdminRecommendationInsightsData(range);
    }

    const start = rangeStartParam(range);
    const [supplementTop, supplementDoseBuckets, supplementStatusMix, unmatchedSupplements] =
      await Promise.all([
        sql<Array<{ count: number | string; id: string; label: string }>>`
          select
            selection_rows.id,
            coalesce(max(selection_rows.localized_name), max(selection_rows.canonical_name), min(selection_rows.label_text)) as label,
            count(distinct selection_rows.plan_id) as count
          from (
            select
              coalesce(supplement_recommendation_selections.supplement_id::text, 'unmatched:' || supplement_recommendation_selections.supplement_name_text) as id,
              supplements.name as canonical_name,
              supplement_translations.name as localized_name,
              supplement_recommendation_selections.supplement_name_text as label_text,
              supplement_recommendation_selections.plan_id
            from public.supplement_recommendation_selections
            join public.assessments
              on assessments.plan_id = supplement_recommendation_selections.plan_id
            left join public.supplements
              on supplements.id = supplement_recommendation_selections.supplement_id
            left join public.supplement_translations
              on supplement_translations.supplement_id = supplements.id
             and supplement_translations.locale = ${locale}
            where supplement_recommendation_selections.is_current = true
              and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
              and assessments.selected_plan is not null
              and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
          ) selection_rows
          group by selection_rows.id
          order by count desc, label asc
          limit 12
        `,
        sql<Array<{
          count: number | string;
          daily_dose_text: string | null;
          dose_amount: number | string | null;
          dose_unit: string | null;
          parent_label: string;
        }>>`
          select
            coalesce(supplement_translations.name, supplements.name, supplement_recommendation_selections.supplement_name_text) as parent_label,
            supplement_recommendation_selections.dose_amount,
            supplement_recommendation_selections.dose_unit,
            supplement_recommendation_selections.daily_dose_text,
            count(distinct supplement_recommendation_selections.plan_id) as count
          from public.supplement_recommendation_selections
          join public.assessments
            on assessments.plan_id = supplement_recommendation_selections.plan_id
          left join public.supplements
            on supplements.id = supplement_recommendation_selections.supplement_id
          left join public.supplement_translations
            on supplement_translations.supplement_id = supplements.id
           and supplement_translations.locale = ${locale}
          where supplement_recommendation_selections.is_current = true
            and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
            and assessments.selected_plan is not null
            and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
          group by
            1,
            supplement_recommendation_selections.dose_amount,
            supplement_recommendation_selections.dose_unit,
            supplement_recommendation_selections.daily_dose_text
          order by count desc
          limit 16
        `,
        sql<Array<{ count: number | string; status: string }>>`
          select
            case
              when supplement_recommendation_selections.safety_visibility = 'hidden' then 'safety hidden'
              else supplement_recommendation_selections.status
            end as status,
            count(*) as count
          from public.supplement_recommendation_selections
          join public.assessments
            on assessments.plan_id = supplement_recommendation_selections.plan_id
          where supplement_recommendation_selections.is_current = true
            and assessments.selected_plan is not null
            and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
          group by 1
          order by count desc
        `,
        sql<Array<{ count: number | string; label: string }>>`
          select
            supplement_recommendation_selections.supplement_name_text as label,
            count(distinct supplement_recommendation_selections.plan_id) as count
          from public.supplement_recommendation_selections
          join public.assessments
            on assessments.plan_id = supplement_recommendation_selections.plan_id
          where supplement_recommendation_selections.is_current = true
            and supplement_recommendation_selections.supplement_id is null
            and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
            and assessments.selected_plan is not null
            and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
          group by supplement_recommendation_selections.supplement_name_text
          order by count desc, label asc
          limit 10
        `
      ]);
    const [
      productTopChosen,
      productTopNearMisses,
      productOutcomeMix,
      productRejectionReasons,
      productServingBuckets,
      unmetOrCoveredNeeds
    ] = await Promise.all([
      sql<Array<{ count: number | string; id: string; label: string; secondary_label: string | null }>>`
        select
          product_recommendation_decisions.product_id::text as id,
          coalesce(product_translations.title, product_recommendation_decisions.product_title) as label,
          avg(product_recommendation_decisions.product_coverage_percent)::text as secondary_label,
          count(distinct product_recommendation_decisions.plan_id) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        left join public.product_translations
          on product_translations.product_id = product_recommendation_decisions.product_id
         and product_translations.locale = ${locale}
        where product_recommendation_decisions.is_current = true
          and product_recommendation_decisions.outcome = 'chosen'
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by product_recommendation_decisions.product_id, coalesce(product_translations.title, product_recommendation_decisions.product_title)
        order by count desc, label asc
        limit 12
      `,
      sql<Array<{ count: number | string; id: string; label: string; secondary_label: string | null }>>`
        select
          product_recommendation_decisions.product_id::text as id,
          coalesce(product_translations.title, product_recommendation_decisions.product_title) as label,
          product_recommendation_decisions.reason as secondary_label,
          count(*) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        left join public.product_translations
          on product_translations.product_id = product_recommendation_decisions.product_id
         and product_translations.locale = ${locale}
        where product_recommendation_decisions.is_current = true
          and product_recommendation_decisions.outcome = 'near_miss'
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by product_recommendation_decisions.product_id, coalesce(product_translations.title, product_recommendation_decisions.product_title), product_recommendation_decisions.reason
        order by count desc, label asc
        limit 12
      `,
      sql<Array<{ count: number | string; outcome: string }>>`
        select product_recommendation_decisions.outcome, count(*) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        where product_recommendation_decisions.is_current = true
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by product_recommendation_decisions.outcome
        order by count desc
      `,
      sql<Array<{ count: number | string; reason: string | null }>>`
        select product_recommendation_decisions.reason, count(*) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        where product_recommendation_decisions.is_current = true
          and product_recommendation_decisions.outcome = 'rejected'
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by product_recommendation_decisions.reason
        order by count desc
        limit 10
      `,
      sql<Array<{ count: number | string; serving_multiplier: number | string }>>`
        select
          product_recommendation_decisions.serving_multiplier,
          count(distinct product_recommendation_decisions.plan_id) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        where product_recommendation_decisions.is_current = true
          and product_recommendation_decisions.outcome = 'chosen'
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by product_recommendation_decisions.serving_multiplier
        order by product_recommendation_decisions.serving_multiplier asc
      `,
      sql<Array<{ count: number | string; id: string; label: string }>>`
        select
          coalesce(need.value ->> 'id', need.value ->> 'sourceId', need.value ->> 'displayName') as id,
          coalesce(need.value ->> 'displayName', need.value ->> 'sourceId', need.value ->> 'id') as label,
          count(distinct product_recommendation_decisions.plan_id) as count
        from public.product_recommendation_decisions
        join public.assessments
          on assessments.plan_id = product_recommendation_decisions.plan_id
        cross join lateral jsonb_array_elements(product_recommendation_decisions.covered_needs) as need(value)
        where product_recommendation_decisions.is_current = true
          and product_recommendation_decisions.outcome = 'chosen'
          and assessments.selected_plan is not null
          and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
        group by 1, 2
        order by count desc, 2 asc
        limit 12
      `
    ]);
    const trend = await loadTrend(range, start);
    const summary = {
      chosenProductPlans: sumCounts(productTopChosen),
      chosenSupplementPlans: sumCounts(supplementTop),
      nearMissProducts: sumCounts(productTopNearMisses),
      rejectedProducts: sumCounts(productRejectionReasons),
      safetyHiddenSupplements: numberValue(
        supplementStatusMix.find((item) => item.status === "safety hidden")?.count
      ),
      unmatchedSupplements: sumCounts(unmatchedSupplements)
    };

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      productOutcomeMix: productOutcomeMix.map((row) => ({
        count: numberValue(row.count),
        label: row.outcome
      })),
      productRejectionReasons: productRejectionReasons.map((row) => ({
        count: numberValue(row.count),
        label: row.reason || "Rejected"
      })),
      productServingBuckets: productServingBuckets.map((row) => ({
        count: numberValue(row.count),
        label: `${numberValue(row.serving_multiplier)} serving${numberValue(row.serving_multiplier) === 1 ? "" : "s"}`
      })),
      productTopChosen: productTopChosen.map((row) => ({
        count: numberValue(row.count),
        id: row.id,
        label: row.label,
        secondaryLabel: row.secondary_label
          ? `${Math.round(numberValue(row.secondary_label))}% avg fit`
          : null
      })),
      productTopNearMisses: productTopNearMisses.map((row) => ({
        count: numberValue(row.count),
        id: row.id,
        label: row.label,
        secondaryLabel: row.secondary_label
      })),
      range,
      summary,
      supplementDoseBuckets: supplementDoseBuckets.map((row) => ({
        count: numberValue(row.count),
        label: doseLabel(row),
        parentLabel: row.parent_label
      })),
      supplementStatusMix: supplementStatusMix.map((row) => ({
        count: numberValue(row.count),
        label: row.status
      })),
      supplementTop: supplementTop.map((row) => ({
        count: numberValue(row.count),
        id: row.id,
        label: row.label
      })),
      trend,
      unmetOrCoveredNeeds: unmetOrCoveredNeeds.map((row) => ({
        count: numberValue(row.count),
        id: row.id,
        label: row.label
      })),
      unmatchedSupplements: unmatchedSupplements.map((row) => ({
        count: numberValue(row.count),
        id: row.label,
        label: row.label
      }))
    };
  } catch (error) {
    console.error("Unable to load recommendation insights", error);
    return emptyAdminRecommendationInsightsData(range);
  }
}

async function loadTrend(range: AdminDashboardRange, start: Date | null) {
  const sql = getSql();

  if (!sql) {
    return {
      bucketLabels: [],
      productChosen: [],
      supplementChosen: []
    };
  }

  const bucket = bucketExpression(range);
  const supplementRows = await sql<Array<{ bucket: Date | string; count: number | string }>>`
    select
      date_trunc(${bucket}, supplement_recommendation_selections.generated_at) as bucket,
      count(distinct supplement_recommendation_selections.plan_id) as count
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by bucket
    order by bucket asc
  `;
  const productRows = await sql<Array<{ bucket: Date | string; count: number | string }>>`
    select
      date_trunc(${bucket}, product_recommendation_decisions.generated_at) as bucket,
      count(distinct product_recommendation_decisions.plan_id) as count
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome = 'chosen'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by bucket
    order by bucket asc
  `;
  const keys = [
    ...new Set([
      ...supplementRows.map((row) => new Date(row.bucket).toISOString()),
      ...productRows.map((row) => new Date(row.bucket).toISOString())
    ])
  ].sort();
  const supplementCounts = new Map(
    supplementRows.map((row) => [
      new Date(row.bucket).toISOString(),
      numberValue(row.count)
    ])
  );
  const productCounts = new Map(
    productRows.map((row) => [
      new Date(row.bucket).toISOString(),
      numberValue(row.count)
    ])
  );

  return {
    bucketLabels: keys.map((key) => bucketLabel(key, range)),
    productChosen: keys.map((key) => productCounts.get(key) ?? 0),
    supplementChosen: keys.map((key) => supplementCounts.get(key) ?? 0)
  };
}

function sumCounts(rows: Array<{ count: number | string }>) {
  return rows.reduce((total, row) => total + numberValue(row.count), 0);
}
