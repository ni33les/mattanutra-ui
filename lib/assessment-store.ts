import type postgres from "postgres";
import { healthScoreAnalysisStatusFromTaskStatuses } from "@/lib/assessment-status";
import {
  buildAssessmentSteps,
  createHealthScoreAnalysisSnapshot,
  normalizeAssessmentPlan,
  type AssessmentPlan,
  type AssessmentSnapshot
} from "@/lib/assessment-snapshot";
import { buildAssessmentSummary } from "@/lib/formulation-summary";
import {
  isExampleFormulationModelVersion,
  toFreePreviewFormulationResult
} from "@/lib/formulation-preview";
import {
  type FoodGuidanceItem,
  type FormulationIngredient,
  type FormulationResult,
  type MarketingPoint,
  type RecommendedProduct
} from "@/lib/formulation-types";
import { getSql } from "@/lib/db";

export type StoredAssessmentStatus =
  | "captured"
  | "failed"
  | "preparing"
  | "queued"
  | "ready";

type PersistAssessmentInput = Readonly<{
  answers?: unknown;
  locale?: unknown;
  selectedPlan?: AssessmentPlan | null;
  snapshot: AssessmentSnapshot;
  status: StoredAssessmentStatus;
}>;

let schemaReady: Promise<void> | null = null;

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeLocale(locale: unknown) {
  return locale === "th" ? "th" : "en";
}

function toJsonRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return toJsonRecord(value);
}

export function hasHealthScoreAdvice(value: unknown) {
  const advice = asRecord(asRecord(value).advice);
  const overview = advice.overview;

  return (
    Boolean(overview && typeof overview === "object") ||
    Array.isArray(advice.paywallFeatures)
  );
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safetySummaryFromRecord(
  value: unknown
): FormulationResult["safetySummary"] | undefined {
  const record = asRecord(value);
  const adjustedCount = Number(record.adjustedCount);
  const hiddenCount = Number(record.hiddenCount);
  const removedCount = Number(record.removedCount);
  const reviewCount = Number(record.reviewCount);

  if (
    !Number.isFinite(adjustedCount) ||
    !Number.isFinite(hiddenCount) ||
    !Number.isFinite(removedCount) ||
    !Number.isFinite(reviewCount)
  ) {
    return undefined;
  }

  return {
    adjustedCount: Math.max(0, Math.round(adjustedCount)),
    hiddenCount: Math.max(0, Math.round(hiddenCount)),
    removedCount: Math.max(0, Math.round(removedCount)),
    reviewCount: Math.max(0, Math.round(reviewCount))
  };
}

export function toJsonValue(value: unknown): postgres.JSONValue {
  if (value === undefined) {
    return {};
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    return {};
  }

  return JSON.parse(serialized) as postgres.JSONValue;
}

function scalarOrNull(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function buildAnswerSummary(answers: unknown) {
  const record = toJsonRecord(answers);

  return {
    age: scalarOrNull(record.age),
    budget: scalarOrNull(record.budget),
    country: scalarOrNull(record.country),
    goals: Array.isArray(record.goals) ? record.goals : [],
    medications: scalarOrNull(record.meds),
    pills: scalarOrNull(record.pills),
    sex: scalarOrNull(record.sex),
    symptoms: Array.isArray(record.symptoms) ? record.symptoms : []
  };
}

export function toStoredPlan(plan: AssessmentPlan | null | undefined) {
  if (plan === "pro") {
    return "pro";
  }

  if (plan === "precision") {
    return "precision";
  }

  return null;
}

export async function ensureAssessmentSchema() {
  const sql = getSql();

  if (!sql) {
    return;
  }

  schemaReady ??= (async () => {
    const requiredColumns = [
      "plan_id",
      "locale",
      "selected_plan",
      "status",
      "answers",
      "answer_summary",
      "health_score",
      "queue_position",
      "error_message",
      "captured_at",
      "plan_selected_at",
      "processing_started_at",
      "completed_at",
      "updated_at"
    ];
    const rows = await sql<Array<{ column_name: string }>>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'assessments'
    `;
    const available = new Set(rows.map((row) => row.column_name));
    const missing = requiredColumns
      .filter((column) => !available.has(column))
      .map((column) => `public.assessments.${column}`);

    if (missing.length > 0) {
      throw new Error(
        `Assessment schema is incomplete. Apply db-schema.sql before using assessment APIs. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  await schemaReady;
}

function fromStoredPlan(plan: unknown): AssessmentPlan {
  return normalizeAssessmentPlan(plan);
}

function toSnapshotStatus(status: unknown): AssessmentSnapshot["status"] {
  if (status === "failed") {
    return "failed";
  }

  if (status === "ready") {
    return "ready";
  }

  if (status === "preparing") {
    return "preparing";
  }

  return "queued";
}

export async function persistAssessmentSubmission({
  answers,
  locale,
  selectedPlan,
  snapshot,
  status
}: PersistAssessmentInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database connection is not configured");
  }

  if (!isUuid(snapshot.planId)) {
    throw new Error("Assessment plan ID must be a UUID");
  }

  if (!snapshot.healthScore) {
    throw new Error("Assessment snapshot must include backend HealthScore");
  }

  await ensureAssessmentSchema();

  await sql`
    insert into assessments (
      plan_id,
      locale,
      selected_plan,
      status,
      answers,
      answer_summary,
      health_score,
      queue_position,
      plan_selected_at,
      processing_started_at,
      completed_at,
      updated_at
    )
    values (
      ${snapshot.planId}::uuid,
      ${normalizeLocale(locale)},
      ${toStoredPlan(selectedPlan)},
      ${status},
      ${sql.json(toJsonValue(answers))},
      ${sql.json(toJsonValue(buildAnswerSummary(answers)))},
      ${sql.json(toJsonValue(snapshot.healthScore))},
      ${snapshot.queuePosition},
      ${selectedPlan ? sql`now()` : null},
      ${status === "queued" || status === "preparing" || status === "ready"
        ? sql`now()`
        : null},
      ${status === "ready" ? sql`now()` : null},
      now()
    )
    on conflict (plan_id) do update set
      locale = excluded.locale,
      selected_plan = excluded.selected_plan,
      status = excluded.status,
      answers = excluded.answers,
      answer_summary = excluded.answer_summary,
      health_score = excluded.health_score,
      queue_position = excluded.queue_position,
      error_message = case
        when excluded.status in ('captured', 'queued', 'preparing', 'ready')
        then null
        else assessments.error_message
      end,
      plan_selected_at = coalesce(
        assessments.plan_selected_at,
        excluded.plan_selected_at
      ),
      processing_started_at = coalesce(
        assessments.processing_started_at,
        excluded.processing_started_at
      ),
      completed_at = coalesce(
        assessments.completed_at,
        excluded.completed_at
      ),
      updated_at = now()
  `;
}

export async function getStoredAssessmentSnapshot(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureAssessmentSchema();

  const rows = await sql`
    select
      plan_id::text,
      selected_plan::text,
      status::text,
      health_score,
      queue_position
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  const status = toSnapshotStatus(row.status);
  let queuePosition = Number(row.queue_position ?? 0);

  if (status === "queued") {
    const positions = await sql`
      with queued_tasks as (
        select
          plan_id,
          scheduled_for,
          created_at,
          (
            business_value
            + least(
              200,
              floor(greatest(0, extract(epoch from now() - scheduled_for) - 300) / 900) * 10
            )
          ) as effective_business_value
        from public.tasks
        where status = 'queued'
          and task_type in (
            'generate_supplement_guidance',
            'generate_food_guidance',
            'generate_example_supplement_guidance',
            'generate_example_food_guidance'
          )
      ),
      current_task as (
        select effective_business_value, scheduled_for, created_at
        from queued_tasks
        where plan_id = ${planId}::uuid
        order by created_at desc
        limit 1
      )
      select count(*)::int as queue_position
      from queued_tasks
      cross join current_task
      where (
          queued_tasks.effective_business_value > current_task.effective_business_value
          or (
            queued_tasks.effective_business_value = current_task.effective_business_value
            and queued_tasks.scheduled_for < current_task.scheduled_for
          )
          or (
            queued_tasks.effective_business_value = current_task.effective_business_value
            and queued_tasks.scheduled_for = current_task.scheduled_for
            and queued_tasks.created_at <= current_task.created_at
          )
        )
    `;

    queuePosition = Number(positions[0]?.queue_position ?? queuePosition);
  }

  const healthScore = asRecord(row.health_score);

  return {
    ...(typeof healthScore.score === "number"
      ? { healthScore: healthScore as AssessmentSnapshot["healthScore"] }
      : {}),
    plan: fromStoredPlan(row.selected_plan),
    planId: row.plan_id,
    queuePosition: status === "queued" ? Math.max(1, queuePosition) : 0,
    status,
    steps: buildAssessmentSteps(status)
  } satisfies AssessmentSnapshot;
}

export async function getStoredHealthScoreAnalysisSnapshot(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureAssessmentSchema();

  const rows = await sql`
    select
      plan_id::text,
      selected_plan::text,
      health_score
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const healthScore = asRecord(row.health_score);

  if (typeof healthScore.score !== "number") {
    return null;
  }

  const hasAdvice = hasHealthScoreAdvice(healthScore);
  const taskRows = hasAdvice
    ? []
    : await sql<{ status: string }[]>`
        select status::text
        from public.tasks
        where plan_id = ${planId}::uuid
          and task_type = 'analyze_healthscore'
        order by created_at desc
        limit 20
      `;
  const analysisStatus = healthScoreAnalysisStatusFromTaskStatuses(
    hasAdvice,
    taskRows.map((task) => task.status)
  );

  return createHealthScoreAnalysisSnapshot({
    healthScore: healthScore as NonNullable<AssessmentSnapshot["healthScore"]>,
    plan: row.selected_plan,
    planId: row.plan_id,
    status: analysisStatus
  });
}

export async function getStoredAssessmentPrefill(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  await ensureAssessmentSchema();

  const rows = await sql`
    select
      answers,
      health_score,
      selected_plan::text
    from assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const healthScore = asRecord(row.health_score);

  return {
    answers: asRecord(row.answers),
    healthScore:
      typeof healthScore.score === "number"
        ? (healthScore as AssessmentSnapshot["healthScore"])
        : null,
    plan: row.selected_plan ? fromStoredPlan(row.selected_plan) : null,
    planId
  };
}

export async function getStoredFormulationResult(
  planId: string,
  options: Readonly<{
    mode?: "full" | "preview";
  }> = {}
) {
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return null;
  }

  const mode = options.mode ?? "full";
  const exampleModelPattern = "%:example";
  const formulationModeFilter =
    mode === "preview"
      ? sql`and formulations.model_version like ${exampleModelPattern}`
      : sql`and (
          formulations.model_version is null
          or formulations.model_version not like ${exampleModelPattern}
        )`;
  const foodGuidanceModeFilter =
    mode === "preview"
      ? sql`and food_guidance.model_version like ${exampleModelPattern}`
      : sql`and (
          food_guidance.model_version is null
          or food_guidance.model_version not like ${exampleModelPattern}
        )`;
  const assessmentAccessFilter =
    mode === "preview"
      ? sql`and assessments.selected_plan is null`
      : sql`and assessments.selected_plan is not null`;

  const rows = await sql`
    select
      assessments.answers,
      assessments.locale,
      assessments.selected_plan::text,
      assessments.updated_at as assessment_updated_at,
      formulations.formulation,
      formulations.generated_at,
      formulations.model_version,
      food_guidance.guidance as food_guidance,
      food_guidance.generated_at as food_guidance_generated_at,
      food_guidance.model_version as food_guidance_model_version,
      recommendations.recommendations
    from assessments
    left join lateral (
      select formulation, generated_at, model_version
      from formulations
      where formulations.plan_id = assessments.plan_id
        ${formulationModeFilter}
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance, generated_at, model_version
      from food_guidance
      where food_guidance.plan_id = assessments.plan_id
        ${foodGuidanceModeFilter}
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    left join lateral (
      select recommendations
      from recommendations
      where recommendations.plan_id = assessments.plan_id
      order by version desc, generated_at desc
      limit 1
    ) recommendations on true
    where assessments.plan_id = ${planId}::uuid
      ${assessmentAccessFilter}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  if (mode === "preview" && (!row.formulation || !row.food_guidance)) {
    return null;
  }

  const locale = normalizeLocale(row.locale);
  const plan = fromStoredPlan(row.selected_plan);
  const storedFormulation = asRecord(row.formulation);
  const storedFoodGuidance = asRecord(row.food_guidance);
  const supplementBreakdown = asArray<FormulationIngredient>(
    storedFormulation.supplementBreakdown ?? storedFormulation.formula
  );
  const marketingPoints = asArray<MarketingPoint>(
    storedFormulation.marketingPoints
  );
  const foodGuidance = asArray<FoodGuidanceItem>(
    storedFoodGuidance.foodGuidance
  );
  const safetySummary = safetySummaryFromRecord(storedFormulation.safetySummary);
  const foodSafetySummary = safetySummaryFromRecord(
    storedFoodGuidance.foodSafetySummary
  );

  const recommendations = asArray<RecommendedProduct>(row.recommendations);
  const generatedDates = [row.generated_at, row.food_guidance_generated_at]
    .filter(Boolean)
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((date) => Number.isFinite(date.getTime()));
  const generatedAt = (
    generatedDates.length > 0
      ? new Date(Math.max(...generatedDates.map((date) => date.getTime())))
      : row.assessment_updated_at instanceof Date
        ? row.assessment_updated_at
        : new Date(row.assessment_updated_at)
  ).toISOString();
  const supplementsReady = Boolean(row.formulation);
  const foodsReady = Boolean(row.food_guidance);

  const result = {
    access:
      mode === "preview" || isExampleFormulationModelVersion(row.model_version)
        ? "preview"
        : "full",
    assessmentSummary: buildAssessmentSummary({
      answers: row.answers,
      locale,
      plan
    }),
    generatedAt,
    planId,
    recommendations,
    schemaVersion: 1,
    sectionStatuses: {
      foods: foodsReady ? "ready" : "pending",
      supplements: supplementsReady ? "ready" : "pending"
    },
    ...(safetySummary ? { safetySummary } : {}),
    ...(foodSafetySummary ? { foodSafetySummary } : {}),
    ...(marketingPoints.length > 0 ? { marketingPoints } : {}),
    foodGuidance,
    supplementBreakdown
  } satisfies FormulationResult;

  return mode === "preview" ? toFreePreviewFormulationResult(result) : result;
}
