import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { updateBlogPost, updateTestimonial } from "@/lib/blog";
import { writeBpmEvent } from "@/lib/bpm";
import { recordEmailCommunicationDelivery } from "@/lib/communications";
import { getSql } from "@/lib/db";
import {
  buildDigitalOceanBillingCostEntries,
  recordFinanceTransaction,
  recordXaiUsageCost
} from "@/lib/finance-ledger";
import { applyFormulationSafety } from "@/lib/formulation-safety";
import type { FormulationBlueprint } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import { isLocale, type Locale } from "@/lib/i18n";
import { enqueueExampleEmailTask } from "@/lib/task-worker";
import {
  addTaskEvent,
  addTaskEventToTransaction,
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
  task: Pick<TaskRecord, "goalId" | "id">,
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
    goalId: task.goalId,
    severity: level,
    taskId: task.id
  } as const;

  if (sql) {
    await addTaskEventToTransaction(sql, event);
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

  const versionRows = await sql<{ version: number }[]>`
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

  await sql`
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
      ${sql.json(toJsonValue(safeFormulation))},
      ${modelVersion(analysis)},
      now(),
      now()
    )
  `;
  await sql`
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
      ${sql.json(toJsonValue([]))},
      now(),
      now()
    )
  `;
  await sql`
    update public.assessments set
      status = 'ready',
      queue_position = 0,
      error_message = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where plan_id = ${planId}::uuid
  `;

  await eventually(afterCommit, async () => {
    await addWorkEvent(task, "formulation_version_written", "medium", {
      attempts: analysis.attempts,
      model: analysis.model,
      promptVersion: analysis.promptVersion,
      reasoningEffort: analysis.reasoningEffort,
      responseId: analysis.responseId,
      safetySummary: safeFormulation.safetySummary
    });
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
        taskId: task.id
      },
      selectedPlan: plan === "pro" ? "pro" : "precision"
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

  const versionRows = await sql<{ version: number }[]>`
    select coalesce(max(version), 0) + 1 as version
    from public.formulations
    where plan_id = ${planId}::uuid
  `;
  const version = Number(versionRows[0]?.version ?? 1);

  await sql`
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
      ${sql.json(toJsonValue(safeFormulation))},
      ${modelVersion(analysis, ":example")},
      now(),
      now()
    )
  `;
  await sql`
    update public.assessment_example_requests set
      status = 'formulation_ready',
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
      safetySummary: safeFormulation.safetySummary
    });
  });
  await eventually(afterCommit, async () => {
    await enqueueExampleEmailTask(planId, requestId);
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
        taskId: task.id
      },
      selectedPlan: plan
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

  if (task.taskType === "generate_formulation") {
    await applyPaidFormulationResult(task, resultPayload, sql, afterCommit);
    return resultPayload;
  }

  if (task.taskType === "generate_example_formulation") {
    await applyExampleFormulationResult(task, resultPayload, sql, afterCommit);
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

  if (task.planId && task.taskType === "generate_formulation") {
    await sql`
      update public.assessments set
        status = ${retryWillBeScheduled ? "queued" : "failed"},
        error_message = ${retryWillBeScheduled ? null : errorMessage},
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
    await sql`
      update public.assessment_example_requests set
        status = ${retryWillBeScheduled
          ? task.taskType === "send_example_email"
            ? "email_queued"
            : "formulation_queued"
          : "failed"},
        error_message = ${retryWillBeScheduled ? null : errorMessage},
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
