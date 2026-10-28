import { randomUUID } from "node:crypto";
import { normalizeAssessmentContactEmail } from "@/lib/assessment-contact";
import { isUuid } from "@/lib/assessment-store";
import { recordEmailCommunicationDelivery, upsertCommunicationChannel } from "@/lib/communications-dispatch";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { FunnelError } from "@/lib/funnel-errors";
import { isLocale, type Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { buildAssessmentResultsUrl } from "@/lib/site-url";
import { sendTransactionalEmail, type SendTransactionalEmailResult } from "@/lib/smtp-email";
import { requiredCapabilitiesForWorkTaskType } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";
import { isPublicWebAssessment, isWebProductJourney } from "@/lib/web-product-journey";

export const SAVED_PLAN_DELIVERY_TASK = "send_saved_plan_email";
type DeliveryStatus = "queued" | "sending" | "sent" | "failed" | "unknown" | "superseded";
type DeliveryRow = {
  id: string; plan_id: string; locale: Locale; email: string; status: DeliveryStatus;
  task_id: string | null; attempts: number; error_message: string | null;
};
export type SavedPlanDeliveryReceipt = { id: string; planId: string; locale: Locale; status: DeliveryStatus };
const receipt = (row: DeliveryRow): SavedPlanDeliveryReceipt => ({ id: row.id, planId: row.plan_id, locale: row.locale, status: row.status });
const terminal = (status: DeliveryStatus) => ["sent", "unknown", "superseded"].includes(status);

async function disableSupersededContactChannels(sql: NonNullable<ReturnType<typeof getSql>>, planId: string, email: string | null) {
  // Only manage addresses captured by this flow; unrelated channels keep their preferences.
  await sql`update public.communication_channels c set status='disabled',updated_at=now()
    from public.plan_communication_identities i
    where i.identity_id=c.identity_id and i.plan_id=${planId}::uuid and i.is_primary
      and c.channel_type='email' and c.metadata->>'savedPlanContact'='true'
      and (${email}::text is null or lower(c.address)<>${email}) and c.status<>'disabled'`;
}

/** Capture/contact calls this inside its transaction; no provider I/O or generation occurs here. */
export async function requestSavedPlanDelivery(planId: string, input: { email: unknown; locale?: unknown }) {
  if (!isUuid(planId)) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
  const email = normalizeAssessmentContactEmail(input.email);
  if (!email) throw new FunnelError("Enter a valid email address", 400, "invalid_email");
  if (input.locale !== undefined && !isLocale(input.locale)) throw new FunnelError("Invalid display locale", 400, "invalid_locale");
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  return withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select contact_email, locale, journey_version, answers from public.assessments
      where plan_id=${planId}::uuid for no key update`;
    if (!assessment) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    if (!isWebProductJourney(assessment.journey_version) || !isPublicWebAssessment(assessment.answers)) return null;
    if (normalizeAssessmentContactEmail(assessment.contact_email) !== email) {
      throw new FunnelError("Save the current email address before requesting delivery", 409, "contact_changed");
    }
    const locale: Locale = isLocale(input.locale) ? input.locale : isLocale(assessment.locale) ? assessment.locale : "en";
    // getSql() in the communications service joins this same transaction.
    await upsertCommunicationChannel({ planId, address: email, channelType: "email", displayName: "Email",
      actorType: "human", preferenceRank: 80, status: "active", metadata: { source: "saved_plan_email", savedPlanContact: true } });
    await disableSupersededContactChannels(tx, planId, email);
    await tx`update public.saved_plan_delivery_requests set status='superseded', updated_at=now()
      where plan_id=${planId}::uuid and email<>${email} and status in ('queued','failed')`;
    const [row] = await tx<DeliveryRow[]>`insert into public.saved_plan_delivery_requests (id,plan_id,locale,email)
      values (${randomUUID()}::uuid,${planId}::uuid,${locale},${email})
      on conflict (plan_id,email) do update set
        status=case when saved_plan_delivery_requests.status='superseded' and saved_plan_delivery_requests.attempts<3
          then 'queued' else saved_plan_delivery_requests.status end,
        updated_at=now()
      returning *`;
    // Locale is frozen on first admission; editing answers or switching languages never resends.
    if (row.status === "queued") {
      const { task } = await createTask({ actorType: "deterministic", title: "Email saved supplement plan link",
        taskType: SAVED_PLAN_DELIVERY_TASK, planId, payload: { deliveryRequestId: row.id },
        requiredCapabilities: requiredCapabilitiesForWorkTaskType(SAVED_PLAN_DELIVERY_TASK),
        idempotencyKey: `saved-plan-delivery:${row.id}`, idempotencyScope: "active", idempotencyScopeKey: `saved-plan-delivery:${row.id}`,
        reasoningEffort: "none", businessValue: 200,
        retryPolicy: { maxRetries: 2, initialDelaySeconds: 15, backoffMultiplier: 2, maxDelaySeconds: 120 }
      }, tx);
      await tx`update public.saved_plan_delivery_requests set task_id=${task.id}::uuid where id=${row.id}::uuid`;
    }
    return receipt(row);
  });
}

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function savedPlanDeliveryEmail(locale: Locale, planId: string) {
  const copy = getNamespace<{ subject: string; body: string; cta: string; privacy: string }>(locale, "outbound.savedPlanEmail");
  const url = buildAssessmentResultsUrl(locale, planId);
  return {
    subject: copy.subject,
    body: `${copy.body}\n\n${copy.cta}: ${url}\n\n${copy.privacy}`,
    html: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="margin:0;background:#f7f4ea;font-family:Arial,sans-serif;color:#20343A"><div style="max-width:640px;margin:0 auto;padding:28px 18px"><div style="background:#fffef8;border-radius:18px;padding:28px;border:1px solid #ded6bd"><p style="color:#1FA77A;font-weight:700">MattaNutra</p><h1>${escape(copy.subject)}</h1><p style="line-height:1.6">${escape(copy.body)}</p><a href="${escape(url)}" style="display:inline-block;margin:18px 0;background:#1FA77A;color:#fff;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:700">${escape(copy.cta)}</a><p style="font-size:13px;color:#5c6670">${escape(copy.privacy)}</p></div></div></body></html>`
  };
}

/** Definite SMTP rejection can retry. Ambiguous acceptance must never resend automatically. */
export async function deliverSavedPlan(requestId: string, send: typeof sendTransactionalEmail = sendTransactionalEmail) {
  if (!isUuid(requestId)) throw new Error("Saved plan delivery request is invalid");
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  const [initial] = await sql<DeliveryRow[]>`select * from public.saved_plan_delivery_requests where id=${requestId}::uuid`;
  if (!initial) throw new Error("Saved plan delivery request was not found");
  if (terminal(initial.status)) return receipt(initial);
  // A rendering/configuration failure is safely retryable: no SMTP attempt has begun.
  const message = savedPlanDeliveryEmail(initial.locale, initial.plan_id);
  const prepared = await withDatabaseTransaction(sql, async tx => {
    // Keep the same assessment -> receipt lock order as contact correction.
    const [assessment] = await tx`select contact_email,journey_version,answers from public.assessments
      where plan_id=${initial.plan_id}::uuid for no key update`;
    const [row] = await tx<DeliveryRow[]>`select * from public.saved_plan_delivery_requests where id=${requestId}::uuid for update`;
    if (!row) throw new Error("Saved plan delivery request was not found");
    if (terminal(row.status)) return { row, send: false };
    if (row.status === "sending") {
      await tx`update public.saved_plan_delivery_requests set status='unknown',
        error_message='Previous SMTP acceptance could not be confirmed; manual reconciliation required',updated_at=now() where id=${row.id}::uuid`;
      return { row: { ...row, status: "unknown" as const }, send: false };
    }
    if (!assessment || !isWebProductJourney(assessment.journey_version) || !isPublicWebAssessment(assessment.answers)
      || normalizeAssessmentContactEmail(assessment.contact_email) !== row.email) {
      await tx`update public.saved_plan_delivery_requests set status='superseded',updated_at=now() where id=${row.id}::uuid`;
      return { row: { ...row, status: "superseded" as const }, send: false };
    }
    if (row.attempts >= 3) return { row, send: false };
    await tx`update public.saved_plan_delivery_requests set status='sending',attempts=attempts+1,error_message=null,updated_at=now()
      where id=${row.id}::uuid`;
    return { row, send: true };
  });
  if (!prepared.send) return receipt(prepared.row);
  const row = prepared.row;
  let result: SendTransactionalEmailResult;
  try { result = await send({ ...message, to: row.email, messageId: `<saved-plan-${row.id}@mattanutra.com>` }); }
  catch (error) { result = { sent: false, outcome: "unknown", reason: error instanceof Error ? error.message : "SMTP acceptance is unknown" }; }
  const status = result.sent ? "sent" : result.outcome === "rejected" ? "failed" : "unknown";
  await withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select contact_email from public.assessments
      where plan_id=${row.plan_id}::uuid for no key update`;
    await tx`update public.saved_plan_delivery_requests set status=${status},provider_message_id=${result.messageId ?? null},
      error_message=${result.reason ?? null},sent_at=${result.sent ? new Date() : null},updated_at=now() where id=${row.id}::uuid`;
    await recordEmailCommunicationDelivery({ ...message, emailHtml: message.html, messageId: result.messageId,
      messageType: "saved_plan_link", planId: row.plan_id, reason: result.reason, sent: result.sent,
      sql: tx, taskId: row.task_id, to: row.email, metadata: { deliveryRequestId: row.id, locale: row.locale, acceptance: status } });
    // Delivery logging upserts its recipient. An older in-flight send must not reactivate a corrected address.
    await disableSupersededContactChannels(tx, row.plan_id, normalizeAssessmentContactEmail(assessment?.contact_email));
  });
  if (status === "failed") throw new Error(result.reason ?? "Email provider rejected delivery");
  return { ...receipt(row), status };
}
