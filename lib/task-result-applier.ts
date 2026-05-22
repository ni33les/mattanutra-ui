import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { updateBlogPost, updateTestimonial } from "@/lib/blog";
import { writeBpmEvent } from "@/lib/bpm";
import { recordEmailCommunicationDelivery } from "@/lib/communications";
import { getSql } from "@/lib/db";
import { appendAssessmentVersion } from "@/lib/domain-versions";
import {
  getProductRecommendationCandidates
} from "@/lib/admin-products";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import type {
  ProductSnapshot,
  MarketplaceSearchDiagnostic
} from "@/lib/product-adapters";
import {
  analysisPayload,
  foodGuidanceAnalysisPayload,
  modelVersion,
  nutritionChatAnalysisPayload,
  nutritionReportAnalysisPayload,
  objectValue,
  payloadText,
  refinementQueuedReply,
  textValue
} from "@/lib/task-result-payloads";
import {
  buildDigitalOceanBillingCostEntries,
  recordFinanceTransaction,
  recordXaiUsageCost
} from "@/lib/finance-ledger";
import { applyFoodGuidanceSafety } from "@/lib/food-guidance-safety";
import { applyFormulationSafety } from "@/lib/formulation-safety";
import { inferGuidanceRemovalAdjustments } from "@/lib/plan-guidance-adjustments";
import {
  insertFoodGuidanceVersion,
  insertFormulationVersion
} from "@/lib/plan-version-writes";
import {
  inferPlanFeedbackFromMessage,
  isPlanRefinementRequest,
  savePlanFeedback
} from "@/lib/plan-feedback";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint
} from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  enqueueExampleEmailIfPreviewReady,
  enqueueExampleEmailsForReadyFullPlan,
  enqueueNutritionPlanRefinementTask,
  enqueueProductRecommendationsTask,
  enqueueRefinedNutritionPlanTasks
} from "@/lib/task-worker";
import {
  PRODUCT_STACK_VARIANT_CONFIGS,
  normalizeProductStackPreference,
  recommendProductStackFullBeam,
  toRecommendedProduct,
  type ProductClientSex,
  type ProductRecommendationResult,
  type ProductStackPreference
} from "@/lib/product-recommendations";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import {
  addTaskEvent,
  addTaskEventWithDb,
  createTask,
  getTaskBundle,
  type TaskAfterCommitEffect,
  type TaskServiceDb,
  type TaskRecord
} from "@/lib/task-service";

type AuditLevel = "critical" | "high" | "low" | "medium";
type AfterCommitScheduler = (effect: TaskAfterCommitEffect) => void;

async function eventually(
  afterCommit: AfterCommitScheduler | undefined,
  effect: TaskAfterCommitEffect
) {
  if (afterCommit) {
    afterCommit(effect);
    return;
  }

  await effect();
}

async function updateAssessmentReadyIfNutritionReady(
  sql: TaskServiceDb,
  planId: string
) {
  const rows = await sql<Array<{
    formulation_ready: boolean;
  }>>`
    select
      exists (
        select 1
        from public.formulations
        where plan_id = ${planId}::uuid
          and (
            model_version is null
            or model_version not like '%:example'
          )
      ) as formulation_ready
  `;
  const ready = rows[0]?.formulation_ready === true;

  await appendAssessmentVersion(sql, {
    afterPayload: {
      completedAt: ready ? "coalesce_current_or_now" : "unchanged",
      errorMessage: null,
      queuePosition: 0,
      status: ready ? "ready" : "preparing"
    },
    changeReason: "nutrition_readiness_refreshed",
    eventPayload: { formulationReady: ready },
    eventType: "assessment_status_projection_update",
    planId,
    source: "task_result_applier"
  });

  await sql`
    update public.assessments set
      status = ${ready ? "ready" : "preparing"}::public.assessment_status,
      queue_position = 0,
      error_message = null,
      completed_at = case
        when ${ready} then coalesce(completed_at, now())
        else completed_at
      end,
      updated_at = now()
    where plan_id = ${planId}::uuid
  `;

  return ready;
}

async function refreshAssessmentReadyIfNutritionReady(planId: string) {
  const sql = getSql();

  if (!sql) {
    return false;
  }

  return updateAssessmentReadyIfNutritionReady(sql, planId);
}

async function queueProductRecommendationsForReadyPlan({
  planId,
  source,
  task
}: Readonly<{
  planId: string;
  source: string;
  task: TaskRecord;
}>) {
  try {
    return await enqueueProductRecommendationsTask({
      parentTaskId: task.id,
      planId,
      taskGroupId: task.taskGroupId
    });
  } catch (error) {
    console.error("Unable to queue product recommendations", error);
    await addWorkEvent(task, "product_recommendations_queue_failed", "medium", {
      errorMessage:
        error instanceof Error ? error.message : "Unknown product queue error",
      source
    });

    return null;
  }
}

async function refreshPaidNutritionReadinessAfterCommit(
  task: TaskRecord,
  planId: string,
  initiallyReady: boolean
) {
  const ready = await refreshAssessmentReadyIfNutritionReady(planId);

  if (ready && !initiallyReady) {
    await addWorkEvent(task, "nutrition_plan_ready", "medium", {
      source: "post_commit_readiness_refresh"
    });

    await queueProductRecommendationsForReadyPlan({
      planId,
      source: "post_commit_readiness_refresh",
      task
    });
  }

  if (ready) {
    await enqueueExampleEmailsForReadyFullPlan(planId);
  }
}

async function recordTaskXaiUsageCost({
  analysis,
  metadata,
  purpose,
  sql,
  task
}: Readonly<{
  analysis: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  purpose: string;
  sql?: TaskServiceDb;
  task: TaskRecord;
}>) {
  const usage = analysis.usage;

  if (!usage) {
    return;
  }

  await recordXaiUsageCost({
    metadata: {
      ...metadata,
      promptVersion: textValue(analysis.promptVersion),
      taskId: task.id
    },
    model: textValue(analysis.model) || "unknown",
    purpose,
    reasoningEffort: textValue(analysis.reasoningEffort),
    responseId: textValue(analysis.responseId),
    sql,
    taskId: task.id,
    usage
  });
}

async function addWorkEvent(
  task: Pick<TaskRecord, "id">,
  eventType: string,
  level: AuditLevel = "low",
  eventPayload: Record<string, unknown> = {},
  sql?: TaskServiceDb
) {
  const event = {
    eventPayload,
    eventStatus:
      level === "critical" || level === "high" ? "observed" : "succeeded",
    eventType,
    severity: level,
    taskId: task.id
  } as const;

  if (sql) {
    await addTaskEventWithDb(sql, event);
    return;
  }

  await addTaskEvent(event);
}

async function recordTaskEmailCommunication(input: Readonly<{
  body: string;
  emailHtml: string;
  metadata?: Record<string, unknown>;
  messageType: string;
  payload: Record<string, unknown>;
  sql?: TaskServiceDb;
  task: TaskRecord;
}>) {
  if (!input.task.planId) {
    return;
  }

  try {
    await recordEmailCommunicationDelivery({
      body: input.body,
      emailHtml: input.emailHtml,
      messageId: textValue(input.payload.messageId),
      messageType: input.messageType,
      metadata: {
        emailType: textValue(input.payload.emailType),
        ...(input.metadata ?? {}),
        source: "task_email_delivery"
      },
      planId: input.task.planId,
      reason: textValue(input.payload.reason),
      sent: input.payload.sent === true,
      sql: input.sql,
      subject: textValue(input.payload.subject),
      taskId: input.task.id,
      to: textValue(input.payload.to)
    });
  } catch (error) {
    await addWorkEvent(
      input.task,
      "communication_record_failed",
      "medium",
      {
        error: error instanceof Error ? error.message : "Unable to record email",
        messageType: input.messageType
      },
      input.sql
    );
  }
}

async function applyHealthScoreResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const payload = objectValue(resultPayload);
  const healthScore = payload.healthScore as HealthScoreResult | undefined;
  const fallbackUsed = payload.fallbackUsed === true;
  const fallbackErrorMessage =
    textValue(payload.errorMessage) || "HealthScore AI advice failed";

  if (!sql || !task.planId || !healthScore) {
    throw new Error("HealthScore completion result is incomplete");
  }

  const rows = await sql`
    select locale
    from public.assessments
    where plan_id = ${task.planId}::uuid
    limit 1
  `;
  const locale: Locale = isLocale(rows[0]?.locale) ? rows[0].locale : "en";

  await appendAssessmentVersion(sql, {
    actor: task.reservedByAgentId,
    afterPayload: {
      healthScore,
      updatedAt: "now"
    },
    changeReason: "healthscore_completed",
    eventPayload: {
      fallbackErrorMessage,
      fallbackUsed,
      locale,
      taskType: task.taskType
    },
    eventType: "healthscore_snapshot_recorded",
    planId: task.planId,
    source: "task_result_applier",
    taskId: task.id
  });

  await sql`
    update public.assessments set
      health_score = ${sql.json(toJsonValue(healthScore))},
      updated_at = now()
    where plan_id = ${task.planId}::uuid
  `;
  await eventually(afterCommit, async () => {
    await recordTaskXaiUsageCost({
      analysis: objectValue(payload.xaiUsage),
      metadata: objectValue(objectValue(payload.xaiUsage).metadata),
      purpose: textValue(objectValue(payload.xaiUsage).purpose) || "healthscore_advice",
      task
    });
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "healthscore_analysis_completed",
      eventType: "funnel",
      locale,
      planId: task.planId,
      properties: {
        cachedOrExisting: payload.cachedOrExisting === true,
        errorMessage: fallbackUsed ? fallbackErrorMessage : undefined,
        fallbackUsed,
        taskId: task.id
      }
    });
  });

  if (fallbackUsed) {
    await eventually(afterCommit, async () => {
      await addWorkEvent(task, "healthscore_analysis_fallback_used", "high", {
        errorMessage: fallbackErrorMessage,
        fallback: "static_healthscore_copy"
      });
    });
  }
}

async function applyPaidFormulationResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;

  if (!sql || !planId) {
    throw new Error("Formulation completion result is missing a plan");
  }

  const rows = await sql`
    select locale, selected_plan::text
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const plan = textValue(row.selected_plan) || "precision";
  const analysis = analysisPayload(resultPayload);
  await eventually(afterCommit, async () => {
    await recordTaskXaiUsageCost({
      analysis,
      metadata: {
        plan,
        planId
      },
      purpose: "formulation_analysis",
      task
    });
  });
  const safeFormulation = await applyFormulationSafety(sql, {
    afterCommit,
    audit: async ({ eventType, level, payload }) =>
      eventually(afterCommit, async () =>
        addWorkEvent(task, eventType, level ?? "low", payload)
      ),
    formulation: analysis.formulation,
    locale,
    plan: plan === "pro" ? "pro" : "precision",
    planId,
    taskId: task.id
  });

  const version = await insertFormulationVersion(sql, {
    formulation: safeFormulation,
    includeEmptyRecommendations: true,
    modelVersion: modelVersion(analysis),
    planId
  });
  const nutritionReady = await updateAssessmentReadyIfNutritionReady(sql, planId);
  const productRecommendationsQueued = nutritionReady
    ? Boolean(
        await queueProductRecommendationsForReadyPlan({
          planId,
          source: "formulation_completion",
          task
        })
      )
    : false;

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "formulation_version_written", "medium", {
      attempts: analysis.attempts,
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      responseId: analysis.responseId,
      safetySummary: safeFormulation.safetySummary,
      nutritionReady,
      version
    });
  });
  await eventually(afterCommit, async () => {
    await refreshPaidNutritionReadinessAfterCommit(task, planId, nutritionReady);
    if (nutritionReady && !productRecommendationsQueued) {
      await queueProductRecommendationsForReadyPlan({
        planId,
        source: "formulation_completion_recovery",
        task
      });
    }
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "formulation_ready",
      eventType: "formulation",
      locale,
      metrics: {
        attempts: analysis.attempts
      },
      planId,
      properties: {
        model: analysis.model,
        promptVersion: analysis.promptVersion,
        reasoningEffort: analysis.reasoningEffort,
        responseId: analysis.responseId,
        nutritionReady,
        taskId: task.id,
        version
      },
      selectedPlan: plan === "pro" ? "pro" : "precision"
    });
  });
}

async function applyPaidFoodGuidanceResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;

  if (!sql || !planId) {
    throw new Error("Food guidance completion result is missing a plan");
  }

  const rows = await sql`
    select answers, locale
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Assessment submission not found");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const analysis = foodGuidanceAnalysisPayload(resultPayload);
  await eventually(afterCommit, async () => {
    await recordTaskXaiUsageCost({
      analysis,
      metadata: { planId },
      purpose: "food_guidance_analysis",
      task
    });
  });
  const safeFoodGuidance = await applyFoodGuidanceSafety(sql, {
    afterCommit,
    answers: row.answers,
    audit: async ({ eventType, level, payload }) =>
      eventually(afterCommit, async () =>
        addWorkEvent(task, eventType, level ?? "low", payload)
      ),
    foodGuidance: analysis.foodGuidance,
    locale,
    planId,
    taskId: task.id
  });
  const version = await insertFoodGuidanceVersion(sql, {
    foodGuidance: safeFoodGuidance,
    modelVersion: modelVersion(analysis),
    planId
  });
  const nutritionReady = await updateAssessmentReadyIfNutritionReady(sql, planId);
  const productRecommendationsQueued = nutritionReady
    ? Boolean(
        await queueProductRecommendationsForReadyPlan({
          planId,
          source: "food_guidance_completion",
          task
        })
      )
    : false;

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "food_guidance_version_written", "medium", {
      attempts: analysis.attempts,
      foodSafetySummary: safeFoodGuidance.foodSafetySummary,
      model: analysis.model,
      nutritionReady,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      responseId: analysis.responseId,
      version
    });
  });
  await eventually(afterCommit, async () => {
    await refreshPaidNutritionReadinessAfterCommit(task, planId, nutritionReady);
    if (nutritionReady && !productRecommendationsQueued) {
      await queueProductRecommendationsForReadyPlan({
        planId,
        source: "food_guidance_completion_recovery",
        task
      });
    }
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "food_guidance_ready",
      eventType: "formulation",
      locale,
      metrics: {
        attempts: analysis.attempts
      },
      planId,
      properties: {
        foodSafetySummary: safeFoodGuidance.foodSafetySummary,
        model: analysis.model,
        nutritionReady,
        promptVersion: analysis.promptVersion,
        reasoningEffort: analysis.reasoningEffort,
        responseId: analysis.responseId,
        taskId: task.id,
        version
      }
    });
  });
}

async function applyExampleFormulationResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;
  const requestId = payloadText(task.payload, "requestId");

  if (!sql || !planId || !isUuid(requestId)) {
    throw new Error("Example formulation completion result is missing identifiers");
  }

  const rows = await sql`
    select assessments.locale, assessments.selected_plan::text
    from public.assessments
    join public.assessment_example_requests
      on assessment_example_requests.plan_id = assessments.plan_id
    where assessments.plan_id = ${planId}::uuid
      and assessment_example_requests.id = ${requestId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Example request not found");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const plan = textValue(row.selected_plan) === "pro" ? "pro" : "precision";
  const analysis = analysisPayload(resultPayload);
  await eventually(afterCommit, async () => {
    await recordTaskXaiUsageCost({
      analysis,
      metadata: {
        plan,
        planId,
        requestId
      },
      purpose: "formulation_analysis",
      task
    });
  });
  const safeFormulation = await applyFormulationSafety(sql, {
    afterCommit,
    audit: async ({ eventType, level, payload }) =>
      eventually(afterCommit, async () =>
        addWorkEvent(task, eventType, level ?? "low", { ...payload, requestId })
      ),
    formulation: analysis.formulation,
    locale,
    plan,
    planId,
    requestId,
    taskId: task.id
  });

  const version = await insertFormulationVersion(sql, {
    formulation: safeFormulation,
    modelVersion: modelVersion(analysis, ":example"),
    planId
  });
  await sql`
    update public.assessment_example_requests set
      status = 'formulation_ready',
      formulation_status = 'ready',
      updated_at = now()
    where id = ${requestId}::uuid
  `;

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "example_formulation_version_written", "medium", {
      attempts: analysis.attempts,
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      requestId,
      responseId: analysis.responseId,
      safetySummary: safeFormulation.safetySummary,
      version
    });
  });
  await eventually(afterCommit, async () => {
    await enqueueExampleEmailIfPreviewReady(planId, requestId);
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "free_example_formulation_ready",
      eventType: "formulation",
      exampleRequestId: requestId,
      locale,
      metrics: {
        attempts: analysis.attempts,
        safetySummary: safeFormulation.safetySummary
      },
      planId,
      properties: {
        model: analysis.model,
        promptVersion: analysis.promptVersion,
        reasoningEffort: analysis.reasoningEffort,
        responseId: analysis.responseId,
        taskId: task.id,
        version
      },
      selectedPlan: plan
    });
  });
}

async function applyExampleFoodGuidanceResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;
  const requestId = payloadText(task.payload, "requestId");

  if (!sql || !planId || !isUuid(requestId)) {
    throw new Error("Example food guidance completion result is missing identifiers");
  }

  const rows = await sql`
    select assessments.answers, assessments.locale
    from public.assessments
    join public.assessment_example_requests
      on assessment_example_requests.plan_id = assessments.plan_id
    where assessments.plan_id = ${planId}::uuid
      and assessment_example_requests.id = ${requestId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Example request not found");
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const analysis = foodGuidanceAnalysisPayload(resultPayload);
  await eventually(afterCommit, async () => {
    await recordTaskXaiUsageCost({
      analysis,
      metadata: {
        planId,
        requestId
      },
      purpose: "food_guidance_analysis",
      task
    });
  });
  const safeFoodGuidance = await applyFoodGuidanceSafety(sql, {
    afterCommit,
    answers: row.answers,
    audit: async ({ eventType, level, payload }) =>
      eventually(afterCommit, async () =>
        addWorkEvent(task, eventType, level ?? "low", { ...payload, requestId })
      ),
    foodGuidance: analysis.foodGuidance,
    locale,
    planId,
    requestId,
    taskId: task.id
  });
  const version = await insertFoodGuidanceVersion(sql, {
    foodGuidance: safeFoodGuidance,
    modelVersion: modelVersion(analysis, ":example"),
    planId
  });
  await sql`
    update public.assessment_example_requests set
      status = 'formulation_ready',
      food_guidance_status = 'ready',
      updated_at = now()
    where id = ${requestId}::uuid
  `;

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "example_food_guidance_version_written", "medium", {
      attempts: analysis.attempts,
      foodSafetySummary: safeFoodGuidance.foodSafetySummary,
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      requestId,
      responseId: analysis.responseId,
      version
    });
  });
  await eventually(afterCommit, async () => {
    await enqueueExampleEmailIfPreviewReady(planId, requestId);
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "free_example_food_guidance_ready",
      eventType: "formulation",
      exampleRequestId: requestId,
      locale,
      metrics: {
        attempts: analysis.attempts,
        foodSafetySummary: safeFoodGuidance.foodSafetySummary
      },
      planId,
      properties: {
        model: analysis.model,
        promptVersion: analysis.promptVersion,
        reasoningEffort: analysis.reasoningEffort,
        responseId: analysis.responseId,
        taskId: task.id,
        version
      }
    });
  });
}

async function applyExampleEmailResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;
  const requestId = payloadText(task.payload, "requestId");
  const payload = objectValue(resultPayload);

  if (!sql || !planId || !isUuid(requestId)) {
    throw new Error("Example email completion result is missing identifiers");
  }

  await sql`
    update public.assessment_example_requests set
      status = ${payload.sent === true ? "email_sent" : "email_rendered"},
      email_html = ${textValue(payload.emailHtml)},
      updated_at = now()
    where id = ${requestId}::uuid
  `;
  await eventually(afterCommit, async () => {
    await recordTaskEmailCommunication({
      body: "Free nutrition plan email",
      emailHtml: textValue(payload.emailHtml),
      metadata: { requestId },
      messageType: "example_preview",
      payload,
      task
    });
  });
  await eventually(afterCommit, async () => {
    await addWorkEvent(
      task,
      payload.sent === true ? "example_email_sent" : "example_email_rendered_not_sent",
      "medium",
      {
        emailType: "example_preview",
        messageId: payload.messageId,
        reason: payload.reason,
        requestId,
        sent: payload.sent === true,
        to: payload.to
      }
    );
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      email: textValue(payload.to),
      eventName: payload.sent === true ? "free_email_sent" : "free_email_rendered",
      eventType: "email",
      exampleRequestId: requestId,
      planId,
      properties: {
        messageId: payload.messageId,
        reason: payload.reason,
        taskId: task.id
      }
    });
  });
}

async function applyReassessmentEmailResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const planId = task.planId;
  const cronId = payloadText(task.payload, "cronId");
  const payload = objectValue(resultPayload);
  const recurrenceDays = Number(payload.recurrenceDays ?? 60);

  if (!sql || !planId || !isUuid(cronId)) {
    throw new Error("Reassessment completion result is missing identifiers");
  }

  await sql`
    update public.cron set
      status = case
        when coalesce(recurrence_days, ${recurrenceDays}) > 0
        then 'scheduled'
        else 'complete'
      end,
      scheduled_for = case
        when coalesce(recurrence_days, ${recurrenceDays}) > 0
        then now() + (coalesce(recurrence_days, ${recurrenceDays}) * interval '1 day')
        else scheduled_for
      end,
      unsubscribe_token = ${textValue(payload.unsubscribeToken)},
      result_payload = ${sql.json(
        toJsonValue({
          email: textValue(payload.to),
          lastRenderedAt: new Date().toISOString(),
          lastRunTaskId: task.id,
          messageId: payload.messageId,
          reason: payload.reason,
          recurrenceDays,
          sent: payload.sent === true
        })
      )},
      completed_at = now(),
      updated_at = now()
    where id = ${cronId}::uuid
  `;
  await eventually(afterCommit, async () => {
    await recordTaskEmailCommunication({
      body: "60-day reassessment invite",
      emailHtml: textValue(payload.emailHtml),
      metadata: { cronId },
      messageType: "reassessment",
      payload,
      task
    });
  });
  await eventually(afterCommit, async () => {
    await addWorkEvent(
      task,
      payload.sent === true ? "reassessment_email_sent" : "reassessment_rendered_not_sent",
      "medium",
      {
        cronId,
        emailType: "reassessment",
        messageId: payload.messageId,
        reason: payload.reason,
        recurrenceDays,
        sent: payload.sent === true,
        to: payload.to
      }
    );
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      cronId,
      email: textValue(payload.to),
      eventName:
        payload.sent === true
          ? "reassessment_email_sent"
          : "reassessment_email_rendered",
      eventType: "reassessment",
      planId,
      properties: {
        messageId: payload.messageId,
        reason: payload.reason,
        recurrenceDays,
        taskId: task.id
      }
    });
  });
}

function safetyReviewIdsFromTask(task: TaskRecord) {
  const payload = objectValue(task.payload);
  const reviewedItems = Array.isArray(payload.reviewedItems)
    ? payload.reviewedItems.map(objectValue)
    : [];

  return [
    ...reviewedItems
      .map((item) => textValue(item.safetyReviewId))
      .filter((id) => isUuid(id)),
    ...(isUuid(textValue(payload.safetyReviewId))
      ? [textValue(payload.safetyReviewId)]
      : [])
  ];
}

async function applyCommunicationFollowupResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const payload = objectValue(resultPayload);
  const communication = objectValue(payload.communication ?? payload);
  const message = objectValue(communication.message);
  const channel = objectValue(communication.channel);
  const messageStatus = textValue(message.status) || textValue(payload.status);
  const status =
    messageStatus === "sent" || messageStatus === "delivered"
      ? "sent"
      : messageStatus === "queued"
        ? "queued"
        : "failed";
  const messageId = textValue(message.id) || textValue(payload.messageId);
  const channelType =
    textValue(channel.channelType) || textValue(payload.channelType);
  const safetyReviewIds = safetyReviewIdsFromTask(task);

  if (sql && safetyReviewIds.length > 0) {
    await sql`
      update public.safety_reviews
      set
        client_notification_status = ${status},
        client_informed_at = case
          when ${status} = 'sent' then coalesce(client_informed_at, now())
          else client_informed_at
        end,
        safety_context = safety_context || ${sql.json(
          toJsonValue({
            communicationChannelType: channelType || null,
            communicationMessageId: messageId || null
          })
        )}::jsonb,
        updated_at = now()
      where id = any(${safetyReviewIds}::uuid[])
    `;
  }

  await eventually(afterCommit, async () => {
    await addWorkEvent(
      task,
      status === "failed"
        ? "communication_channel_unavailable"
        : "communication_task_completed",
      status === "failed" ? "medium" : "low",
      {
        channelType,
        messageId,
        status
      }
    );
  });

  return {
    channelId: textValue(channel.id) || null,
    channelType: channelType || null,
    messageId: messageId || null,
    status
  };
}

function contentStatus(value: unknown) {
  return value === "archived" ||
    value === "draft" ||
    value === "published" ||
    value === "review"
    ? value
    : null;
}

async function applyContentStatusChangeResult(
  task: TaskRecord,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const payload = objectValue(task.payload);
  const contentType = payloadText(payload, "contentType");
  const contentId = payloadText(payload, "contentId");
  const targetStatus = contentStatus(payload.targetStatus);
  const publishAt = payloadText(payload, "publishAt");

  if (
    (contentType !== "blog_post" && contentType !== "testimonial") ||
    !isUuid(contentId) ||
    !targetStatus
  ) {
    throw new Error("Content status change task is incomplete");
  }

  const updated =
    contentType === "blog_post"
      ? await updateBlogPost(contentId, {
          publishedAt:
            targetStatus === "published"
              ? publishAt || new Date().toISOString()
              : null,
          status: targetStatus
        })
      : await updateTestimonial(contentId, { status: targetStatus });

  if (!updated) {
    throw new Error("Content item not found");
  }

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "content_status_changed", "medium", {
      contentId,
      contentType,
      targetStatus
    });
  });
  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "content_status_changed",
      eventType: "content",
      properties: {
        contentId,
        contentType,
        targetStatus,
        taskId: task.id
      }
    });
  });

  return {
    contentId,
    contentType,
    status: targetStatus,
    updated
  };
}

async function applyDigitalOceanBillingSyncResult(
  task: TaskRecord,
  resultPayload: unknown,
  _sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const payload = objectValue(resultPayload);
  const digitalOcean = objectValue(payload.digitalOcean);
  const invoiceItems = Array.isArray(digitalOcean.invoiceItems)
    ? digitalOcean.invoiceItems.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
  const projectNames = Array.isArray(payload.projectNames)
    ? payload.projectNames.filter((item): item is string => typeof item === "string")
    : [];
  const reportedSynced = Number(digitalOcean.synced ?? 0);
  const skipped = digitalOcean.skipped === true;
  const errorMessage = textValue(digitalOcean.error);
  const reason = textValue(digitalOcean.reason);

  await eventually(afterCommit, async () => {
    let synced = Number.isFinite(reportedSynced) ? reportedSynced : 0;

    if (invoiceItems.length > 0 && projectNames.length > 0) {
      synced = 0;

      for (const entry of buildDigitalOceanBillingCostEntries({
        items: invoiceItems,
        projectNames
      })) {
        const id = await recordFinanceTransaction({
          ...entry,
          taskId: task.id
        });

        if (id) {
          synced += 1;
        }
      }
    }

    await addWorkEvent(
      task,
      skipped
        ? "digitalocean_billing_sync_skipped"
        : "digitalocean_billing_sync_completed",
      errorMessage ? "medium" : "low",
      {
        error: errorMessage || undefined,
        projectNames: Array.isArray(payload.projectNames)
          ? payload.projectNames
          : [],
        reason: reason || undefined,
        skipped,
        synced
      }
    );
  });

  return resultPayload;
}

async function applyNutritionPlanChatResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const analysis = nutritionChatAnalysisPayload(resultPayload);
  const messageId = payloadText(task.payload, "messageId");

  if (!sql || !task.planId || !isUuid(messageId)) {
    throw new Error("Nutrition plan chat result is missing identifiers");
  }

  const contextRows = await sql<Array<{
    food_guidance: FoodGuidanceBlueprint | null;
    formulation: FormulationBlueprint | null;
    user_message: string | null;
  }>>`
    select
      user_message.body as user_message,
      formulations.formulation,
      food_guidance.guidance as food_guidance
    from public.plan_chat_messages user_message
    left join lateral (
      select formulation
      from public.formulations
      where formulations.plan_id = user_message.plan_id
        and (
          model_version is null
          or model_version not like '%:example'
        )
      order by version desc, generated_at desc
      limit 1
    ) formulations on true
    left join lateral (
      select guidance
      from public.food_guidance
      where food_guidance.plan_id = user_message.plan_id
        and (
          model_version is null
          or model_version not like '%:example'
        )
      order by version desc, generated_at desc
      limit 1
    ) food_guidance on true
    where user_message.id = ${messageId}::uuid
      and user_message.plan_id = ${task.planId}::uuid
    limit 1
  `;
  const context = contextRows[0];
  const userMessage = textValue(context?.user_message);
  const guidanceAdjustments = [
    ...analysis.adjustments,
    ...inferGuidanceRemovalAdjustments({
      foodGuidance: context?.food_guidance ?? null,
      formulation: context?.formulation ?? null,
      userMessage
    })
  ];
  const planFeedback = [
    ...analysis.feedback,
    ...inferPlanFeedbackFromMessage({
      adjustments: guidanceAdjustments,
      message: userMessage
    })
  ];
  const feedbackCount = await savePlanFeedback(sql, {
    feedback: planFeedback,
    metadata: {
      source: "nutrition_plan_chat_reply"
    },
    messageId,
    planId: task.planId,
    taskId: task.id
  });

  await sql`
    update public.plan_chat_messages set
      status = 'ready',
      task_id = ${task.id}::uuid,
      updated_at = now()
    where id = ${messageId}::uuid
      and plan_id = ${task.planId}::uuid
  `;

  const refinementRequested = isPlanRefinementRequest(userMessage);
  const refinementQueued = refinementRequested
    ? await enqueueNutritionPlanRefinementTask({
        planId: task.planId,
        requestedBy: "chat"
      })
    : null;
  const assistantReply =
    refinementQueued?.taskId ? refinementQueuedReply(userMessage) : analysis.reply;

  await sql`
    insert into public.plan_chat_messages (
      id,
      plan_id,
      task_id,
      reply_to_message_id,
      role,
      body,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      ${task.planId}::uuid,
      ${task.id}::uuid,
      ${messageId}::uuid,
      'assistant',
      ${assistantReply},
      'ready',
      ${sql.json(toJsonValue({
        model: textValue(analysis.model),
        planFeedback,
        promptVersion: textValue(analysis.promptVersion),
        refinementRequested,
        refinementTaskId: refinementQueued?.taskId ?? null,
        refinementTaskReason: refinementQueued?.reason ?? null,
        responseId: textValue(analysis.responseId),
        taskId: task.id
      }))}::jsonb,
      now(),
      now()
    )
    on conflict (reply_to_message_id)
    where role = 'assistant'
      and reply_to_message_id is not null
    do update set
      body = excluded.body,
      status = excluded.status,
      metadata = excluded.metadata,
      task_id = excluded.task_id,
      updated_at = now()
  `;

  await recordTaskXaiUsageCost({
    analysis,
    purpose: "nutrition_plan_chat_reply",
    sql,
    task
  });

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "nutrition_plan_chat_reply_completed", "low", {
      feedbackCount,
      messageId,
      refinementRequested,
      refinementTaskId: refinementQueued?.taskId ?? null
    });
  });

  return resultPayload;
}

async function applyNutritionPlanRefinementResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const payload = objectValue(resultPayload);
  const refinementHash =
    textValue(payload.refinementHash) ||
    payloadText(task.payload, "refinementHash");

  if (!sql || !task.planId || !refinementHash) {
    throw new Error("Nutrition plan refinement result is missing identifiers");
  }

  const queued = await enqueueRefinedNutritionPlanTasks({
    parentTaskId: task.id,
    planId: task.planId,
    refinementHash,
    taskGroupId: task.taskGroupId
  });

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "nutrition_plan_refinement_queued", "medium", {
      foodGuidanceTaskId: queued.foodGuidanceTaskId,
      nutritionReportTaskId: queued.nutritionReportTaskId,
      refinementHash,
      supplementGuidanceTaskId: queued.supplementGuidanceTaskId
    });
  });

  return {
    ...payload,
    queued
  };
}

async function applyNutritionReportResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const analysis = nutritionReportAnalysisPayload(resultPayload);

  if (!sql || !task.planId) {
    throw new Error("Nutrition report result is missing plan");
  }

  await sql`
    insert into public.nutrition_reports (
      plan_id,
      version,
      task_id,
      report,
      model_version,
      generated_at,
      updated_at
    )
    values (
      ${task.planId}::uuid,
      coalesce((
        select max(version) + 1
        from public.nutrition_reports
        where plan_id = ${task.planId}::uuid
      ), 1),
      ${task.id}::uuid,
      ${sql.json(toJsonValue(analysis.report))}::jsonb,
      ${modelVersion(analysis)},
      now(),
      now()
    )
    on conflict (task_id)
    where task_id is not null
    do update set
      report = excluded.report,
      model_version = excluded.model_version,
      updated_at = now()
  `;
  const productRecommendationsQueued = task.planId
    ? Boolean(
        await queueProductRecommendationsForReadyPlan({
          planId: task.planId,
          source: "nutrition_report_completion",
          task
        })
      )
    : false;

  await recordTaskXaiUsageCost({
    analysis,
    purpose: "nutrition_report",
    sql,
    task
  });

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "nutrition_report_completed", "medium", {
      planId: task.planId
    });
    if (task.planId && !productRecommendationsQueued) {
      await queueProductRecommendationsForReadyPlan({
        planId: task.planId,
        source: "nutrition_report_completion_recovery",
        task
      });
    }
  });

  return resultPayload;
}

function productRecommendationPayload(value: unknown): ProductRecommendationResult {
  const payload = objectValue(value);
  const recommendations = Array.isArray(payload.recommendations)
    ? payload
    : objectValue(payload.recommendations);
  const stackCoveragePercent = Number(recommendations.stackCoveragePercent) || 0;
  const supplementProductCoveragePercent =
    Number(recommendations.supplementProductCoveragePercent) || stackCoveragePercent;
  const foodCoveragePercent = Number(recommendations.foodCoveragePercent) || 0;
  const totalPlanCoveragePercent =
    Number(recommendations.totalPlanCoveragePercent) || stackCoveragePercent;

  return {
    clientNeeds: Array.isArray(recommendations.clientNeeds)
      ? recommendations.clientNeeds as ProductRecommendationResult["clientNeeds"]
      : [],
    diagnostics: objectValue(recommendations.diagnostics) as ProductRecommendationResult["diagnostics"],
    exclusions: Array.isArray(recommendations.exclusions)
      ? recommendations.exclusions as ProductRecommendationResult["exclusions"]
      : [],
    foodCoveragePercent,
    recommendations: Array.isArray(recommendations.recommendations)
      ? recommendations.recommendations as ProductRecommendationResult["recommendations"]
      : [],
    stackCoveragePercent,
    supplementProductCoveragePercent,
    totalPlanCoveragePercent
  };
}

type ProductRecommendationVariantPayload = Readonly<{
  maxProducts: number | null;
  result: ProductRecommendationResult;
  stackPreference: ProductStackPreference;
}>;

function productRecommendationVariantPayloads(
  value: unknown
): ProductRecommendationVariantPayload[] {
  const payload = objectValue(value);
  const variants = Array.isArray(payload.recommendationVariants)
    ? payload.recommendationVariants
    : [];

  return variants.flatMap((item) => {
    const record = objectValue(item);
    const rawResult =
      "recommendations" in record ? record.recommendations : record;
    const result = productRecommendationPayload(rawResult);
    const stackPreference = normalizeProductStackPreference(
      record.stackPreference ?? result.diagnostics?.stackPreference
    );
    const maxProducts = Number(record.maxProducts);

    return [{
      maxProducts: Number.isFinite(maxProducts) && maxProducts > 0
        ? maxProducts
        : null,
      result: {
        ...result,
        diagnostics: {
          ...result.diagnostics,
          stackPreference
        }
      },
      stackPreference
    }];
  });
}

function marketplaceSnapshotPayload(value: unknown): ProductSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = objectValue(item);
    const platform = payloadText(record, "platform");
    const productUrl = payloadText(record, "productUrl");
    const title = payloadText(record, "title");

    if (
      (platform !== "lazada" && platform !== "manual" && platform !== "shopee") ||
      !productUrl ||
      !title
    ) {
      return [];
    }

    return [{
      availabilityStatus:
        record.availabilityStatus === "in_stock" ||
        record.availabilityStatus === "out_of_stock" ||
        record.availabilityStatus === "unavailable"
          ? record.availabilityStatus
          : "unknown",
      brandName: payloadText(record, "brandName") || null,
      currency: "THB",
      imageUrl: payloadText(record, "imageUrl") || null,
      externalProductId: payloadText(record, "externalProductId") || null,
      platform,
      priceAmount: Number(record.priceAmount) || null,
      productUrl,
      region: "TH",
      title
    } satisfies ProductSnapshot];
  });
}

function marketplaceDiagnosticsPayload(value: unknown): MarketplaceSearchDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = objectValue(item);
    const platform = payloadText(record, "platform");
    const query = payloadText(record, "query");

    if (platform !== "lazada" && platform !== "manual" && platform !== "shopee") {
      return [];
    }

    return [{
      configured: record.configured === true,
      error: payloadText(record, "error") || undefined,
      platform,
      query,
      resultCount: Number(record.resultCount) || 0,
      source:
        record.source === "affiliate_api" ||
        record.source === "official_api" ||
        record.source === "scrape_fallback"
          ? record.source
          : "unconfigured"
    } satisfies MarketplaceSearchDiagnostic];
  });
}

function productDiscoveryPayload(value: unknown) {
  const payload = objectValue(value);
  const discovery = objectValue(payload.discovery);

  return {
    diagnostics: marketplaceDiagnosticsPayload(discovery.diagnostics),
    products: marketplaceSnapshotPayload(discovery.products)
  };
}

async function queueUnknownProductReviewTasks(
  task: TaskRecord,
  runId: string,
  result: ProductRecommendationResult
) {
  for (const item of result.recommendations) {
    if (!item.unknownAtRecommendation) {
      continue;
    }

    await createTask({
      actorType: "human",
      businessValue: 420,
      context: {
        source: "product_recommendations",
        taskType: "review_product"
      },
      createdByTaskId: task.id,
      groupLabel: "Review product recommendations",
      idempotencyKey: `review-marketplace-product:${item.product.id}`,
      idempotencyScope: "active",
      idempotencyScopeKey: `review-marketplace-product:${item.product.id}`,
      initialComment: {
        authorName: "Product Matcher",
        authorType: "deterministic",
        body: `${item.product.title} was recommended because it matched this plan, but it is not yet reviewed by the admin team.`,
        commentType: "instruction",
        metadata: {
          productCoveragePercent: item.productCoveragePercent,
          productId: item.product.id,
          recommendationRunId: runId,
          stackContributionPercent: item.stackContributionPercent
        },
        visibility: "admin"
      },
      maxAttempts: 1,
      payload: {
        coveredNeeds: item.coveredNeeds,
        productId: item.product.id,
        productTitle: item.product.title,
        recommendationRunId: runId,
        selectedBecause: item.why
      },
      planId: task.planId,
      rayId: task.rayId,
      reasoningEffort: "none",
      requiredCapabilities: [
        AGENT_CAPABILITIES.humanReview,
        AGENT_CAPABILITIES.productReview,
        AGENT_CAPABILITIES.safetyReview
      ],
      retryPolicy: false,
      taskGroupId: task.taskGroupId,
      taskType: "review_product",
      title: `Review product ${item.product.title}`
    });
  }
}

async function loadProductRecommendationClientSex(
  sql: TaskServiceDb,
  planId: string
): Promise<ProductClientSex | null> {
  const rows = await sql<Array<{ sex: string | null }>>`
    select answers ->> 'sex' as sex
    from public.assessments
    where plan_id = ${planId}::uuid
    order by updated_at desc
    limit 1
  `;
  const sex = rows[0]?.sex;

  return sex === "female" || sex === "male" ? sex : null;
}

async function loadProductRecommendationCountryCode(
  sql: TaskServiceDb,
  planId: string
) {
  const rows = await sql<Array<{ country: string | null }>>`
    select answers ->> 'country' as country
    from public.assessments
    where plan_id = ${planId}::uuid
    order by updated_at desc
    limit 1
  `;

  return normalizeProductCountryCode(rows[0]?.country) ?? defaultProductCountryCode;
}

async function insertProductRecommendationResult({
  countryCode,
  discoveryNotes,
  maxProducts,
  result,
  sql,
  stackPreference,
  task
}: Readonly<{
  countryCode: string;
  discoveryNotes: string;
  maxProducts: number | null;
  result: ProductRecommendationResult;
  sql: TaskServiceDb;
  stackPreference: ProductStackPreference;
  task: TaskRecord;
}>) {
  const diagnostics = {
    ...result.diagnostics,
    maxProducts,
    stackPreference,
    trace: {
      ...result.diagnostics.trace,
      ...(maxProducts ? { maxProducts } : {}),
      stackPreference
    }
  };
  const runRows = await sql<Array<{ id: string }>>`
    insert into public.product_recommendation_runs (
      plan_id,
      task_id,
      ray_id,
      status,
      market_region,
      stack_coverage_percent,
      supplement_product_coverage_percent,
      food_coverage_percent,
      total_coverage_percent,
      client_needs,
      exclusions,
      diagnostics,
      notes,
      generated_at,
      created_at
    )
    values (
      ${task.planId}::uuid,
      ${task.id}::uuid,
      ${task.rayId ?? null}::uuid,
      ${result.recommendations.length > 0 ? "completed" : "partial"},
      ${result.diagnostics.marketRegion ?? countryCode},
      ${result.stackCoveragePercent},
      ${result.supplementProductCoveragePercent},
      ${result.foodCoveragePercent},
      ${result.totalPlanCoveragePercent},
      ${sql.json(toJsonValue(result.clientNeeds))}::jsonb,
      ${sql.json(toJsonValue(result.exclusions))}::jsonb,
      ${sql.json(toJsonValue(diagnostics))}::jsonb,
      ${discoveryNotes},
      now(),
      now()
    )
    returning id::text
  `;
  const runId = runRows[0]?.id;

  if (!runId) {
    throw new Error("Product recommendation run was not created");
  }

  for (const item of result.recommendations) {
    await sql`
      insert into public.product_recommendation_items (
        run_id,
        product_id,
        rank,
        score,
        product_coverage_percent,
        stack_contribution_percent,
        covered_needs,
        why,
        offer_id,
        url_used,
        price_amount,
        currency,
        image_url,
        unknown_at_recommendation,
        created_at
      )
      values (
        ${runId}::uuid,
        ${item.product.id}::uuid,
        ${item.rank},
        ${item.score},
        ${item.productCoveragePercent},
        ${item.stackContributionPercent},
        ${sql.json(toJsonValue(item.coveredNeeds))}::jsonb,
        ${item.why},
        ${item.offerId}::uuid,
        ${item.url},
        ${item.product.priceAmount ?? null},
        ${item.product.currency || "THB"},
        ${item.product.imageUrl ?? null},
        ${item.unknownAtRecommendation},
        now()
      )
      on conflict (run_id, product_id) do nothing
    `;
  }

  return runId;
}

async function applyProductRecommendationsResult(
  task: TaskRecord,
  resultPayload: unknown,
  sqlOverride?: TaskServiceDb,
  afterCommit?: AfterCommitScheduler
) {
  const sql = sqlOverride ?? getSql();
  const initialResult = productRecommendationPayload(resultPayload);
  const discovery = productDiscoveryPayload(resultPayload);

  if (!sql || !task.planId) {
    throw new Error("Product recommendation result is missing plan");
  }
  const clientSex = await loadProductRecommendationClientSex(sql, task.planId);
  const countryCode = await loadProductRecommendationCountryCode(sql, task.planId);
  const stackPreference = normalizeProductStackPreference(
    initialResult.diagnostics?.stackPreference ??
      payloadText(task.payload, "stackPreference")
  );
  let variants = productRecommendationVariantPayloads(resultPayload);

  if (variants.length < 1 && initialResult.recommendations.length > 0) {
    variants = [{
      maxProducts: Number(initialResult.diagnostics?.trace?.maxProducts) || null,
      result: initialResult,
      stackPreference
    }];
  }

  if (variants.length < 1) {
    const candidates = await getProductRecommendationCandidates({
      countryCode,
      includeIneligible: true
    });

    variants = PRODUCT_STACK_VARIANT_CONFIGS.map((config) => ({
      maxProducts: config.maxProducts,
      result: recommendProductStackFullBeam({
        candidates,
        countryCode,
        clientSex,
        maxProducts: config.maxProducts,
        needs: initialResult.clientNeeds,
        stackPreference: config.stackPreference,
        targetProducts: config.targetProducts
      }),
      stackPreference: config.stackPreference
    }));
  }

  const selectedVariant =
    variants.find((variant) => variant.stackPreference === stackPreference) ??
    variants.find((variant) => variant.stackPreference === "balanced") ??
    variants[0];
  const result = selectedVariant.result;
  const configuredAdapters = discovery.diagnostics.filter(
    (item) => item.configured
  ).length;
  const discoveryResults = discovery.diagnostics.reduce(
    (total, item) => total + item.resultCount,
    0
  );
  const discoveryNotes =
    discovery.diagnostics.length < 1
      ? "Matched against the approved curated product catalogue."
      : configuredAdapters < 1
        ? "Marketplace discovery adapters are not configured."
        : `Marketplace discovery returned ${discoveryResults} products.`;

  const runIds = new Map<ProductStackPreference, string>();

  const variantsToPersist = [
    ...variants.filter((variant) =>
      variant.stackPreference !== selectedVariant.stackPreference
    ),
    selectedVariant
  ];

  for (const variant of variantsToPersist) {
    runIds.set(
      variant.stackPreference,
      await insertProductRecommendationResult({
        countryCode,
        discoveryNotes,
        maxProducts: variant.maxProducts,
        result: variant.result,
        sql,
        stackPreference: variant.stackPreference,
        task
      })
    );
  }
  const runId =
    runIds.get(selectedVariant.stackPreference) ?? [...runIds.values()][0];

  if (!runId) {
    throw new Error("Product recommendation run was not created");
  }

  const legacyRecommendations = result.recommendations.map((item) =>
    toRecommendedProduct(item, result.stackCoveragePercent, runId)
  );

  await sql`
    insert into public.recommendations (
      plan_id,
      version,
      recommendations,
      generated_at,
      updated_at
    )
    select
      ${task.planId}::uuid,
      coalesce(max(version), 0) + 1,
      ${sql.json(toJsonValue(legacyRecommendations))}::jsonb,
      now(),
      now()
    from public.recommendations
    where plan_id = ${task.planId}::uuid
  `;

  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName: "product_recommendations_ready",
      eventType: "affiliate",
      planId: task.planId,
      properties: {
        discoveredProductCount: discovery.products.length,
        importedProductCount: 0,
        productCount: result.recommendations.length,
        recommendationRunId: runId,
        stackCoveragePercent: result.stackCoveragePercent,
        supplementProductCoveragePercent: result.supplementProductCoveragePercent,
        totalPlanCoveragePercent: result.totalPlanCoveragePercent
      },
      severity: "medium"
    });
    await addWorkEvent(task, "product_recommendations_ready", "medium", {
      configuredMarketplaceAdapters: configuredAdapters,
      discoveredProductCount: discovery.products.length,
      discoveryNotes,
      importedProductCount: 0,
      productCount: result.recommendations.length,
      recommendationRunId: runId,
      stackCoveragePercent: result.stackCoveragePercent,
      supplementProductCoveragePercent: result.supplementProductCoveragePercent,
      totalPlanCoveragePercent: result.totalPlanCoveragePercent
    });
    await queueUnknownProductReviewTasks(task, runId, result);
  });

  return {
    ...objectValue(resultPayload),
    recommendationRunId: runId
  };
}

export async function applyTaskCompletionResult({
  afterCommit,
  resultPayload,
  sql,
  task: providedTask,
  taskId
}: Readonly<{
  afterCommit?: AfterCommitScheduler;
  resultPayload: unknown;
  sql?: TaskServiceDb;
  task?: TaskRecord;
  taskId: string;
}>) {
  const task = providedTask ?? (await getTaskBundle({ taskId })).task;

  if (task.taskType === "analyze_healthscore") {
    await applyHealthScoreResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "generate_supplement_guidance") {
    await applyPaidFormulationResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "generate_food_guidance") {
    await applyPaidFoodGuidanceResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "generate_example_supplement_guidance") {
    await applyExampleFormulationResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "generate_example_food_guidance") {
    await applyExampleFoodGuidanceResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "send_example_email") {
    await applyExampleEmailResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "send_reassessment_email") {
    await applyReassessmentEmailResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "client_safety_followup") {
    return applyCommunicationFollowupResult(task, resultPayload, sql, afterCommit);
  }

  if (task.taskType === "content_status_change") {
    return applyContentStatusChangeResult(task, sql, afterCommit);
  }

  if (task.taskType === "sync_digitalocean_billing") {
    return applyDigitalOceanBillingSyncResult(task, resultPayload, sql, afterCommit);
  }

  if (task.taskType === "nutrition_plan_chat_reply") {
    return applyNutritionPlanChatResult(task, resultPayload, sql, afterCommit);
  }

  if (task.taskType === "refine_nutrition_plan") {
    return applyNutritionPlanRefinementResult(task, resultPayload, sql, afterCommit);
  }

  if (task.taskType === "generate_nutrition_report") {
    return applyNutritionReportResult(task, resultPayload, sql, afterCommit);
  }

  if (task.taskType === "generate_product_recommendations") {
    return applyProductRecommendationsResult(task, resultPayload, sql, afterCommit);
  }

  return resultPayload;
}

export async function applyTaskFailureResult({
  afterCommit,
  errorMessage,
  resultPayload,
  retryWillBeScheduled = false,
  sql: sqlOverride,
  task: providedTask,
  taskId
}: Readonly<{
  afterCommit?: AfterCommitScheduler;
  errorMessage: string;
  resultPayload: unknown;
  retryWillBeScheduled?: boolean;
  sql?: TaskServiceDb;
  task?: TaskRecord;
  taskId: string;
}>) {
  const sql = sqlOverride ?? getSql();
  const task = providedTask ?? (await getTaskBundle({ taskId })).task;
  const requestId = payloadText(task.payload, "requestId");
  const cronId = payloadText(task.payload, "cronId");

  if (!sql) {
    return resultPayload;
  }

  if (
    task.planId &&
    (task.taskType === "generate_supplement_guidance" ||
      task.taskType === "generate_food_guidance")
  ) {
    await appendAssessmentVersion(sql, {
      actor: task.reservedByAgentId,
      afterPayload: {
        errorMessage: retryWillBeScheduled ? null : errorMessage,
        status: retryWillBeScheduled ? "queued" : "failed"
      },
      changeReason: "task_failure_projection_update",
      eventPayload: {
        retryWillBeScheduled,
        taskType: task.taskType
      },
      eventType: "assessment_status_projection_update",
      planId: task.planId,
      source: "task_result_applier",
      taskId: task.id
    });

    await sql`
      update public.assessments set
        status = ${retryWillBeScheduled ? "queued" : "failed"},
        error_message = ${retryWillBeScheduled ? null : errorMessage},
        updated_at = now()
      where plan_id = ${task.planId}::uuid
    `;
  }

  if (task.taskType === "nutrition_plan_chat_reply") {
    const messageId = payloadText(task.payload, "messageId");

    if (task.planId && isUuid(messageId)) {
      await sql`
        update public.plan_chat_messages set
          status = ${retryWillBeScheduled ? "queued" : "failed"},
          metadata = metadata || ${sql.json(toJsonValue({ errorMessage }))}::jsonb,
          updated_at = now()
        where id = ${messageId}::uuid
          and plan_id = ${task.planId}::uuid
      `;
    }
  }

  if (
    task.planId &&
    (task.taskType === "generate_example_supplement_guidance" ||
      task.taskType === "generate_example_food_guidance" ||
      task.taskType === "send_example_email") &&
    isUuid(requestId)
  ) {
    await sql`
      update public.assessment_example_requests set
        status = ${retryWillBeScheduled
          ? task.taskType === "send_example_email"
            ? "email_queued"
            : "formulation_queued"
          : "failed"},
        error_message = ${retryWillBeScheduled ? null : errorMessage},
        formulation_status = case
          when ${task.taskType} = 'generate_example_supplement_guidance'
          then ${retryWillBeScheduled ? "queued" : "failed"}
          else formulation_status
        end,
        food_guidance_status = case
          when ${task.taskType} = 'generate_example_food_guidance'
          then ${retryWillBeScheduled ? "queued" : "failed"}
          else food_guidance_status
        end,
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  }

  if (task.taskType === "send_reassessment_email" && isUuid(cronId)) {
    await sql`
      update public.cron set
        status = ${retryWillBeScheduled ? "queued" : "failed"},
        error_message = ${retryWillBeScheduled ? null : errorMessage},
        updated_at = now()
      where id = ${cronId}::uuid
    `;
  }

  await eventually(afterCommit, async () => {
    await writeBpmEvent({
      actorType: "worker",
      errorCode: "task_failed",
      errorMessage,
      eventName: retryWillBeScheduled ? "worker_task_retrying" : "worker_task_failed",
      eventType: "error",
      planId: task.planId,
      properties: {
        taskId: task.id,
        taskType: task.taskType
      },
      severity: retryWillBeScheduled ? "medium" : "critical"
    });
  });

  return resultPayload;
}
