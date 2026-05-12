import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { updateBlogPost, updateTestimonial } from "@/lib/blog";
import { writeBpmEvent } from "@/lib/bpm";
import {
  recordEmailCommunicationDelivery,
  sendClientSafetyFollowupTask
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import { applyFormulationSafety } from "@/lib/formulation-safety";
import type { FormulationBlueprint } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import { isLocale, type Locale } from "@/lib/i18n";
import { enqueueExampleEmailTask } from "@/lib/task-worker";
import {
  addTaskEvent,
  getTaskBundle,
  type ReservedTask,
  type TaskRecord
} from "@/lib/task-service";

type AuditLevel = "critical" | "high" | "low" | "medium";

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function payloadText(payload: unknown, key: string) {
  return textValue(objectValue(payload)[key]);
}

function modelVersion(analysis: Record<string, unknown>, suffix = "") {
  const model = textValue(analysis.model) || "unknown";
  const reasoningEffort = textValue(analysis.reasoningEffort) || "unknown";
  const promptVersion = textValue(analysis.promptVersion) || "unknown";

  return `xai:${model}:${reasoningEffort}:${promptVersion}${suffix}`;
}

function analysisPayload(resultPayload: unknown) {
  const analysis = objectValue(objectValue(resultPayload).analysis);
  const formulation = objectValue(analysis.formulation);

  if (!Array.isArray(formulation.supplementBreakdown)) {
    throw new Error("Task completion result is missing formulation analysis");
  }

  return analysis as Record<string, unknown> & {
    formulation: FormulationBlueprint;
  };
}

async function addWorkEvent(
  task: Pick<TaskRecord, "goalId" | "id">,
  eventType: string,
  level: AuditLevel = "low",
  eventPayload: Record<string, unknown> = {}
) {
  await addTaskEvent({
    eventPayload,
    eventStatus:
      level === "critical" || level === "high" ? "observed" : "succeeded",
    eventType,
    goalId: task.goalId,
    severity: level,
    taskId: task.id
  });
}

async function recordTaskEmailCommunication(input: Readonly<{
  body: string;
  emailHtml: string;
  metadata?: Record<string, unknown>;
  messageType: string;
  payload: Record<string, unknown>;
  task: TaskRecord;
}>) {
  if (!input.task.planId) {
    return;
  }

  try {
    await recordEmailCommunicationDelivery({
      body: input.body,
      emailHtml: input.emailHtml,
      goalId: input.task.goalId,
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
      subject: textValue(input.payload.subject),
      taskId: input.task.id,
      to: textValue(input.payload.to)
    });
  } catch (error) {
    await addWorkEvent(input.task, "communication_record_failed", "medium", {
      error: error instanceof Error ? error.message : "Unable to record email",
      messageType: input.messageType
    });
  }
}

async function applyHealthScoreResult(
  task: TaskRecord,
  resultPayload: unknown
) {
  const sql = getSql();
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

  await sql`
    update public.assessments set
      health_score = ${sql.json(toJsonValue(healthScore))},
      updated_at = now()
    where plan_id = ${task.planId}::uuid
  `;
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

  if (fallbackUsed) {
    await addWorkEvent(task, "healthscore_analysis_fallback_used", "high", {
      errorMessage: fallbackErrorMessage,
      fallback: "static_healthscore_copy"
    });
  }
}

async function applyPaidFormulationResult(
  task: TaskRecord,
  resultPayload: unknown
) {
  const sql = getSql();
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
  const safeFormulation = await applyFormulationSafety(sql, {
    audit: async ({ eventType, level, payload }) =>
      addWorkEvent(task, eventType, level ?? "low", payload),
    formulation: analysis.formulation,
    locale,
    plan: plan === "pro" ? "pro" : "precision",
    planId,
    taskId: task.id
  });

  await sql.begin(async (transaction) => {
    const versionRows = await transaction<{ version: number }[]>`
      select greatest(
        (
          select coalesce(max(version), 0)
          from public.formulations
          where plan_id = ${planId}::uuid
        ),
        (
          select coalesce(max(version), 0)
          from public.recommendations
          where plan_id = ${planId}::uuid
        )
      ) + 1 as version
    `;
    const version = Number(versionRows[0]?.version ?? 1);

    await transaction`
      insert into public.formulations (
        plan_id,
        version,
        formulation,
        model_version,
        generated_at,
        updated_at
      )
      values (
        ${planId}::uuid,
        ${version},
        ${transaction.json(toJsonValue(safeFormulation))},
        ${modelVersion(analysis)},
        now(),
        now()
      )
    `;
    await transaction`
      insert into public.recommendations (
        plan_id,
        version,
        recommendations,
        generated_at,
        updated_at
      )
      values (
        ${planId}::uuid,
        ${version},
        ${transaction.json(toJsonValue([]))},
        now(),
        now()
      )
    `;
    await transaction`
      update public.assessments set
        status = 'ready',
        queue_position = 0,
        error_message = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where plan_id = ${planId}::uuid
    `;
  });

  await addWorkEvent(task, "formulation_version_written", "medium", {
    attempts: analysis.attempts,
    model: analysis.model,
    promptVersion: analysis.promptVersion,
    reasoningEffort: analysis.reasoningEffort,
    responseId: analysis.responseId,
    safetySummary: safeFormulation.safetySummary
  });
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
      taskId: task.id
    },
    selectedPlan: plan === "pro" ? "pro" : "precision"
  });
}

async function applyExampleFormulationResult(
  task: TaskRecord,
  resultPayload: unknown
) {
  const sql = getSql();
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
  const safeFormulation = await applyFormulationSafety(sql, {
    audit: async ({ eventType, level, payload }) =>
      addWorkEvent(task, eventType, level ?? "low", { ...payload, requestId }),
    formulation: analysis.formulation,
    locale,
    plan,
    planId,
    requestId,
    taskId: task.id
  });

  await sql.begin(async (transaction) => {
    const versionRows = await transaction<{ version: number }[]>`
      select coalesce(max(version), 0) + 1 as version
      from public.formulations
      where plan_id = ${planId}::uuid
    `;
    const version = Number(versionRows[0]?.version ?? 1);

    await transaction`
      insert into public.formulations (
        plan_id,
        version,
        formulation,
        model_version,
        generated_at,
        updated_at
      )
      values (
        ${planId}::uuid,
        ${version},
        ${transaction.json(toJsonValue(safeFormulation))},
        ${modelVersion(analysis, ":example")},
        now(),
        now()
      )
    `;
    await transaction`
      update public.assessment_example_requests set
        status = 'formulation_ready',
        updated_at = now()
      where id = ${requestId}::uuid
    `;
  });

  await addWorkEvent(task, "example_formulation_version_written", "medium", {
    attempts: analysis.attempts,
    model: analysis.model,
    promptVersion: analysis.promptVersion,
    reasoningEffort: analysis.reasoningEffort,
    requestId,
    responseId: analysis.responseId,
    safetySummary: safeFormulation.safetySummary
  });
  await enqueueExampleEmailTask(planId, requestId);
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
      taskId: task.id
    },
    selectedPlan: plan
  });
}

async function applyExampleEmailResult(task: TaskRecord, resultPayload: unknown) {
  const sql = getSql();
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
  await recordTaskEmailCommunication({
    body: "Free nutrition plan email",
    emailHtml: textValue(payload.emailHtml),
    metadata: { requestId },
    messageType: "example_preview",
    payload,
    task
  });
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
}

async function applyReassessmentEmailResult(
  task: TaskRecord,
  resultPayload: unknown
) {
  const sql = getSql();
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
  await recordTaskEmailCommunication({
    body: "60-day reassessment invite",
    emailHtml: textValue(payload.emailHtml),
    metadata: { cronId },
    messageType: "reassessment",
    payload,
    task
  });
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
}

async function applyCommunicationFollowupResult(
  task: TaskRecord,
  reservationId: string
) {
  const bundle = await getTaskBundle({ taskId: task.id });
  const result = await sendClientSafetyFollowupTask({
    agent: {
      capabilities: [],
      createdAt: new Date().toISOString(),
      endpointUrl: null,
      id: task.reservedByAgentId ?? "00000000-0000-4000-8000-000000000000",
      lastSeenAt: null,
      metadata: {},
      model: null,
      name: "Internal API worker",
      status: "active",
      type: "system",
      updatedAt: new Date().toISOString()
    },
    comments: bundle.comments,
    reservationId,
    task
  } satisfies ReservedTask);

  await addWorkEvent(
    task,
    result.message.status === "no_channel"
      ? "communication_channel_unavailable"
      : "communication_task_completed",
    result.message.status === "no_channel" ? "medium" : "low",
    {
      channelType: result.channel?.channelType,
      messageId: result.message.id,
      status: result.message.status
    }
  );

  return {
    channelId: result.channel?.id,
    channelType: result.channel?.channelType,
    messageId: result.message.id,
    status: result.message.status
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

async function applyContentStatusChangeResult(task: TaskRecord) {
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

  await addWorkEvent(task, "content_status_changed", "medium", {
    contentId,
    contentType,
    targetStatus
  });
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

  return {
    contentId,
    contentType,
    status: targetStatus,
    updated
  };
}

export async function applyTaskCompletionResult({
  reservationId,
  resultPayload,
  taskId
}: Readonly<{
  reservationId: string;
  resultPayload: unknown;
  taskId: string;
}>) {
  const bundle = await getTaskBundle({ taskId });
  const task = bundle.task;

  if (task.taskType === "analyze_healthscore") {
    await applyHealthScoreResult(task, resultPayload);
    return resultPayload;
  }

  if (task.taskType === "generate_formulation") {
    await applyPaidFormulationResult(task, resultPayload);
    return resultPayload;
  }

  if (task.taskType === "generate_example_formulation") {
    await applyExampleFormulationResult(task, resultPayload);
    return resultPayload;
  }

  if (task.taskType === "send_example_email") {
    await applyExampleEmailResult(task, resultPayload);
    return resultPayload;
  }

  if (task.taskType === "send_reassessment_email") {
    await applyReassessmentEmailResult(task, resultPayload);
    return resultPayload;
  }

  if (task.taskType === "client_safety_followup") {
    return applyCommunicationFollowupResult(task, reservationId);
  }

  if (task.taskType === "content_status_change") {
    return applyContentStatusChangeResult(task);
  }

  return resultPayload;
}

export async function applyTaskFailureResult({
  errorMessage,
  resultPayload,
  taskId
}: Readonly<{
  errorMessage: string;
  resultPayload: unknown;
  taskId: string;
}>) {
  const sql = getSql();
  const bundle = await getTaskBundle({ taskId });
  const task = bundle.task;
  const requestId = payloadText(task.payload, "requestId");
  const cronId = payloadText(task.payload, "cronId");

  if (!sql) {
    return resultPayload;
  }

  await sql.begin(async (transaction) => {
    if (task.planId && task.taskType === "generate_formulation") {
      await transaction`
        update public.assessments set
          status = 'failed',
          error_message = ${errorMessage},
          updated_at = now()
        where plan_id = ${task.planId}::uuid
      `;
    }

    if (
      task.planId &&
      (task.taskType === "generate_example_formulation" ||
        task.taskType === "send_example_email") &&
      isUuid(requestId)
    ) {
      await transaction`
        update public.assessment_example_requests set
          status = 'failed',
          error_message = ${errorMessage},
          updated_at = now()
        where id = ${requestId}::uuid
      `;
    }

    if (task.taskType === "send_reassessment_email" && isUuid(cronId)) {
      await transaction`
        update public.cron set
          status = 'failed',
          error_message = ${errorMessage},
          updated_at = now()
        where id = ${cronId}::uuid
      `;
    }
  });

  await writeBpmEvent({
    actorType: "worker",
    errorCode: "task_failed",
    errorMessage,
    eventName: "worker_task_failed",
    eventType: "error",
    planId: task.planId,
    properties: {
      taskId: task.id,
      taskType: task.taskType
    },
    severity: "critical"
  });

  return resultPayload;
}
