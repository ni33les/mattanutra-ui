import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { hasHealthScoreAiCopy, isUuid } from "@/lib/assessment-store";
import { FUNNEL_GENERATOR_VERSION } from "@/lib/assessment-revisions";
import { normalizeAssessmentContactEmail } from "@/lib/assessment-contact";
import { FunnelError } from "@/lib/funnel-errors";
import { isLocale, type Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { nutritionHealthScorePath } from "@/lib/nutrition-paths";
import { siteBaseUrl } from "@/lib/site-url";
import { createTask } from "@/lib/task-service";
import { enqueueHealthScoreAnalysisTask } from "@/lib/task-worker";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";
import { recordEmailCommunicationDelivery } from "@/lib/communications-dispatch";
import { sendTransactionalEmail, type SendTransactionalEmailResult } from "@/lib/smtp-email";

type Db = postgres.Sql | postgres.TransactionSql;
export const HEALTHSCORE_DELIVERY_TASK = "send_healthscore_email";
type DeliveryRow = { id: string; plan_id: string; revision: number; locale: Locale; email: string; status: string; task_id: string | null; attempts: number; error_message: string | null };
const receipt = (row: DeliveryRow) => ({ id: row.id, planId: row.plan_id, revision: Number(row.revision), locale: row.locale, status: row.status, error: row.error_message });

async function adviceReady(sql: Db, planId: string, revision: number, locale: Locale) {
  const [row] = await sql`select r.result from public.assessment_healthscore_results r
    join public.assessments a on a.plan_id = r.plan_id and a.input_revision = r.revision
    where r.plan_id = ${planId}::uuid and r.revision = ${revision} and r.locale = ${locale}
      and r.generator_version = ${FUNNEL_GENERATOR_VERSION}`;
  return hasHealthScoreAiCopy(row?.result);
}

/** Called inside capture/completion/request transactions; never sends email here. */
export async function enqueueReadyHealthScoreDeliveries(sql: Db, planId: string, revision: number, locale: Locale) {
  if (!await adviceReady(sql, planId, revision, locale)) return;
  const rows = await sql<DeliveryRow[]>`select * from public.healthscore_delivery_requests
    where plan_id = ${planId}::uuid and revision = ${revision} and locale = ${locale} and status = 'waiting' for update`;
  for (const row of rows) {
    const { task } = await createTask({ actorType: "deterministic", title: "Deliver completed HealthScore", taskType: HEALTHSCORE_DELIVERY_TASK,
      planId, payload: { deliveryRequestId: row.id }, requiredCapabilities: requiredCapabilitiesForWorkTaskType(HEALTHSCORE_DELIVERY_TASK),
      idempotencyKey: `healthscore-delivery:${row.id}`, idempotencyScope: "active", idempotencyScopeKey: `healthscore-delivery:${row.id}`,
      reasoningEffort: "none", businessValue: 200,
      retryPolicy: { maxRetries: 2, initialDelaySeconds: 15, backoffMultiplier: 2, maxDelaySeconds: 120 }
    }, sql);
    await sql`update public.healthscore_delivery_requests set status = 'queued', task_id = ${task.id}::uuid, updated_at = now() where id = ${row.id}::uuid`;
  }
}

export async function requestHealthScoreDelivery(planId: string, input: { locale?: unknown; email?: unknown }) {
  if (!input || typeof input !== "object" || !isUuid(planId) || !isLocale(input.locale)) throw new FunnelError("Invalid assessment request", 400, "invalid_request");
  const email = normalizeAssessmentContactEmail(input.email);
  if (!email) throw new FunnelError("Enter a valid email address", 400, "invalid_email");
  const locale = input.locale;
  const sql = getSql(); if (!sql) throw new Error("Database is not configured");
  return withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select input_revision from public.assessments where plan_id = ${planId}::uuid for update`;
    if (!assessment) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    const revision = Number(assessment.input_revision);
    await tx`insert into public.healthscore_delivery_requests (id, plan_id, revision, locale, email)
      values (${randomUUID()}::uuid, ${planId}::uuid, ${revision}, ${locale}, ${email}) on conflict (plan_id, revision, locale, email) do nothing`;
    await enqueueReadyHealthScoreDeliveries(tx, planId, revision, locale);
    const [row] = await tx<DeliveryRow[]>`select * from public.healthscore_delivery_requests
      where plan_id = ${planId}::uuid and revision = ${revision} and locale = ${locale} and email = ${email}`;
    if (row.status === "waiting") await enqueueHealthScoreAnalysisTask({ planId, locale });
    return receipt(row);
  });
}

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function healthScoreDeliveryEmail(locale: Locale, planId: string) {
  const copy = getNamespace<{ subject: string; body: string; cta: string }>(locale, "outbound.healthscoreReadyEmail");
  const url = `${siteBaseUrl()}${nutritionHealthScorePath(locale, planId)}`;
  return { subject: copy.subject, body: copy.body,
    html: `<!doctype html><html lang="${locale}"><body><h1>${escape(copy.subject)}</h1><p>${escape(copy.body)}</p><a href="${escape(url)}">${escape(copy.cta)}</a></body></html>` };
}

type SendEmail = typeof sendTransactionalEmail;
/** Email acceptance has a deliberate uncertainty state. Replayed sends never guess that SMTP rejected a message. */
export async function deliverHealthScore(requestId: string, send: SendEmail = sendTransactionalEmail) {
  const sql = getSql(); if (!sql) throw new Error("Database is not configured");
  const [initial] = await sql<DeliveryRow[]>`select * from public.healthscore_delivery_requests where id = ${requestId}::uuid`;
  if (!initial) throw new Error("Delivery request not found");
  const prepared = await withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select input_revision from public.assessments where plan_id = ${initial.plan_id}::uuid for update`;
    const [row] = await tx<DeliveryRow[]>`select * from public.healthscore_delivery_requests where id = ${requestId}::uuid for update`;
    if (["sent", "unknown", "superseded"].includes(row.status)) return { row, send: false };
    if (row.status === "sending") {
      await tx`update public.healthscore_delivery_requests set status = 'unknown', error_message = 'Previous SMTP acceptance could not be confirmed; manual reconciliation required', updated_at = now() where id = ${requestId}::uuid`;
      return { row: { ...row, status: "unknown" }, send: false };
    }
    if (!assessment || Number(assessment.input_revision) !== Number(row.revision)) {
      await tx`update public.healthscore_delivery_requests set status = 'superseded', updated_at = now() where id = ${requestId}::uuid`;
      return { row: { ...row, status: "superseded" }, send: false };
    }
    if (!await adviceReady(tx, row.plan_id, Number(row.revision), row.locale)) {
      await tx`update public.healthscore_delivery_requests set status = 'waiting', updated_at = now() where id = ${requestId}::uuid`;
      return { row: { ...row, status: "waiting" }, send: false };
    }
    if (row.attempts >= 3) return { row, send: false };
    await tx`update public.healthscore_delivery_requests set status = 'sending', attempts = attempts + 1, error_message = null, updated_at = now() where id = ${requestId}::uuid`;
    return { row, send: true };
  });
  if (!prepared.send) return receipt(prepared.row);
  const row = prepared.row;
  const email = healthScoreDeliveryEmail(row.locale, row.plan_id);
  let result: SendTransactionalEmailResult;
  try { result = await send({ ...email, to: row.email, messageId: `<healthscore-${row.id}@mattanutra.com>` }); }
  catch (error) { result = { sent: false, outcome: "unknown", reason: error instanceof Error ? error.message : "SMTP acceptance is unknown" }; }
  const status = result.sent ? "sent" : result.outcome === "rejected" ? "failed" : "unknown";
  await withDatabaseTransaction(sql, async tx => {
    await tx`update public.healthscore_delivery_requests set status = ${status}, provider_message_id = ${result.messageId ?? null},
      error_message = ${result.reason ?? null}, sent_at = ${result.sent ? new Date() : null}, updated_at = now() where id = ${requestId}::uuid`;
    await recordEmailCommunicationDelivery({ ...email, emailHtml: email.html, messageId: result.messageId, messageType: "healthscore_ready",
      planId: row.plan_id, reason: result.reason, sent: result.sent, sql: tx, subject: email.subject, taskId: row.task_id, to: row.email,
      metadata: { deliveryRequestId: row.id, revision: Number(row.revision), locale: row.locale, acceptance: status } });
  });
  if (status === "failed") throw new Error(result.reason ?? "Email provider rejected delivery");
  return { ...receipt(row), status };
}
