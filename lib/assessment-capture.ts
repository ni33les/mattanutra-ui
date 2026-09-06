import { deserializeState } from "@/lib/questionnaire/engine";
import { buildInitialAnswers } from "@/components/assessment-flow-state";
import { createAssessmentSnapshot, DEFAULT_ASSESSMENT_PLAN, type AssessmentSnapshot } from "@/lib/assessment-snapshot";
import { getStoredAssessmentPrefill, isUuid, persistAssessmentSubmission, toJsonValue } from "@/lib/assessment-store";
import { normalizeAssessmentContactEmail } from "@/lib/assessment-contact";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";
import { getAssessmentResumeDraft, finalizeAssessmentResumeDraft } from "@/lib/assessment-resume-store";
import { appendAssessmentVersion } from "@/lib/domain-versions";
import { claimFunnelRequest, completeFunnelRequest } from "@/lib/funnel-idempotency";
import { FunnelError } from "@/lib/funnel-errors";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { computeHealthScore } from "@/lib/health-score";
import { isLocale } from "@/lib/i18n";
import { mergeInStorePharmacyAnswers, resolveCapturePharmacy } from "@/lib/pharmacy-in-store";
import { bindPaidReservationToAssessment } from "@/lib/stripe-payments";
import { enqueueAssessmentPregenerationTasks, enqueueHealthScoreAnalysisTask, enqueueNutritionPlanTasks, scheduleReassessmentAction } from "@/lib/task-worker";
import { cachedEvaluatedIngredientCatalogueCount } from "@/lib/supplement-catalogue-count";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";

export type CaptureReceipt = AssessmentSnapshot & {
  revision: number; inputHash: string; firstName: string | null; generationStatus: "pending";
  paymentId: string | null; taskIds: unknown;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FunnelError("Invalid assessment input", 400, "invalid_capture");
  return value as Record<string, unknown>;
}

/** Validate the existing answer shape without changing scoring values or optional questions. */
export function validateCaptureAnswers(value: unknown) {
  const answers = record(value);
  if (!Object.keys(answers).length || JSON.stringify(answers).length > 65_536) throw new FunnelError("Assessment answers are required", 400, "invalid_answers");
  const shape = { ...buildInitialAnswers(), reassessmentEmail: "" } as Record<string, unknown>;
  for (const [key, answer] of Object.entries(answers)) {
    if (!(key in shape)) throw new FunnelError(`Unknown assessment answer: ${key}`, 400, "invalid_answers");
    const expected = shape[key];
    const valid = Array.isArray(expected)
      ? Array.isArray(answer) && answer.length <= 100 && answer.every(v => typeof v === "string" && v.length <= 1000)
      : expected && typeof expected === "object"
        ? answer && typeof answer === "object" && !Array.isArray(answer) && Object.entries(answer).every(([k, v]) => k.length <= 100 && typeof v === "string" && v.length <= 1000)
        : typeof answer === typeof expected && (typeof answer !== "string" || answer.length <= 5000);
    if (!valid) throw new FunnelError(`Invalid assessment answer: ${key}`, 400, "invalid_answers");
  }
  return { ...buildInitialAnswers(answers), ...(answers.reassessmentEmail ? { reassessmentEmail: answers.reassessmentEmail } : {}) };
}

/** Shared HTTP and server-coordinator capture. The receipt, revision, binding and jobs commit together. */
export async function captureAssessment(bodyValue: unknown, options: { planId?: string | null; idempotencyKey: string }): Promise<CaptureReceipt> {
  const body = record(bodyValue);
  if (body.intent === "process") throw new FunnelError("Payment is required before plan processing", 402, "payment_required");
  if (!isLocale(body.locale)) throw new FunnelError("Invalid assessment locale", 400, "invalid_locale");
  const locale = body.locale;
  const contactEmail = body.contactEmail == null || body.contactEmail === "" ? null : normalizeAssessmentContactEmail(body.contactEmail);
  if (body.contactEmail && !contactEmail) throw new FunnelError("Enter a valid email address", 400, "invalid_email");
  const token = typeof body.resumeToken === "string" ? body.resumeToken : "";
  const resume = token ? await getAssessmentResumeDraft(token) : null;
  if (token && !resume) throw new FunnelError("This resume link is invalid or expired", 400, "invalid_resume");
  const requestedPlanId = options.planId || resume?.planId || null;
  if (requestedPlanId && !isUuid(requestedPlanId)) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
  if (resume && requestedPlanId !== resume.planId) throw new FunnelError("Resume link belongs to another assessment", 409, "resume_conflict");
  const paymentId = body.paymentId || resume?.paymentId || null;
  if (paymentId && (typeof paymentId !== "string" || !isUuid(paymentId))) throw new FunnelError("Invalid payment reservation", 400, "invalid_payment");
  const rawAnswers = validateCaptureAnswers(body.answers);
  const existing = requestedPlanId ? await getStoredAssessmentPrefill(requestedPlanId) : null;
  const { invalidRequested, pharmacy } = await resolveCapturePharmacy(body.pharmacyId, existing?.answers);
  if (invalidRequested) throw new FunnelError("Pharmacy not found", 404, "pharmacy_not_found");
  const answers = pharmacy ? mergeInStorePharmacyAnswers(rawAnswers, pharmacy) : rawAnswers;
  const skipHealthScore = Boolean(pharmacy);
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  const result = await withDatabaseTransaction(sql, async tx => {
    const claimed = await claimFunnelRequest(tx, "assessment-capture", options.idempotencyKey, {
      planId: requestedPlanId, answers, locale, contactEmail, paymentId, expectedRevision: body.expectedRevision ?? null
    });
    if (claimed.response) return claimed.response as CaptureReceipt;
    const planId = requestedPlanId ?? claimed.resourceId;
    const [current] = await tx`select selected_plan, input_revision from public.assessments where plan_id = ${planId}::uuid for update`;
    if (requestedPlanId && !current && resume?.planId !== planId) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    if (current && body.expectedRevision !== undefined && Number(body.expectedRevision) !== Number(current.input_revision)) {
      throw new FunnelError("Assessment answers changed. Reload the saved assessment before editing.", 409, "assessment_changed");
    }
    const selectedPlan = current?.selected_plan ?? (skipHealthScore ? DEFAULT_ASSESSMENT_PLAN : null);
    const snapshot = createAssessmentSnapshot({ planId, plan: selectedPlan ?? DEFAULT_ASSESSMENT_PLAN, status: "queued",
      healthScore: skipHealthScore ? undefined : computeHealthScore(answers, locale, { evaluatedIngredientCount: cachedEvaluatedIngredientCatalogueCount() }) });
    const identity = await persistAssessmentSubmission({ answers, contactEmail, locale, selectedPlan, skipHealthScore, snapshot, status: "captured" });
    if (body.questionnaireState !== undefined) {
      const state = deserializeState(JSON.stringify(body.questionnaireState));
      if (!state) throw new FunnelError("Invalid questionnaire state", 400, "invalid_questionnaire_state");
      await tx`update public.assessments set questionnaire_state = ${tx.json(toJsonValue({ ...state, planId, assessmentRevision: identity.revision }))}
        where plan_id = ${planId}::uuid`;
    } else {
      await tx`update public.assessments set questionnaire_state = null where plan_id = ${planId}::uuid`;
    }
    if (paymentId && !await bindPaidReservationToAssessment({ locale, paymentId: String(paymentId), planId })) {
      throw new FunnelError("Paid reservation could not be applied", 409, "reservation_conflict");
    }
    const taskIds = await enqueueAssessmentPregenerationTasks({ answers, locale, planId });
    if (selectedPlan) await enqueueNutritionPlanTasks({ answers, locale, planId, plan: selectedPlan });
    if (resume) await finalizeAssessmentResumeDraft({ planId, token });
    if (typeof rawAnswers.reassessmentEmail === "string" && rawAnswers.reassessmentEmail) {
      if (!normalizeAssessmentContactEmail(rawAnswers.reassessmentEmail)) throw new FunnelError("Invalid reassessment email", 400, "invalid_email");
      await scheduleReassessmentAction({ email: rawAnswers.reassessmentEmail, locale, planId });
    }
    const receipt: CaptureReceipt = { ...snapshot, ...identity, firstName: firstNameFromAssessmentAnswers(answers), generationStatus: "pending", paymentId: paymentId ? String(paymentId) : null, taskIds };
    await completeFunnelRequest(tx, "assessment-capture", options.idempotencyKey, receipt);
    return receipt;
  });
  const bpm = bpmContextFromBody(body);
  void writeBpmEvent({ actorType: "visitor", attribution: bpm.attribution, eventName: requestedPlanId ? "assessment_recaptured" : "assessment_captured",
    eventType: "funnel", locale, planId: result.planId, ray: typeof bpm.ray === "string" ? bpm.ray : null,
    properties: { revision: result.revision } }).catch(() => undefined);
  return result;
}

export async function updateAssessmentContact(planId: string, emailValue: unknown) {
  if (!isUuid(planId)) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
  const email = normalizeAssessmentContactEmail(emailValue);
  if (!email) throw new FunnelError("Enter a valid email address", 400, "invalid_email");
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  return withDatabaseTransaction(sql, async tx => {
    const [row] = await tx`update public.assessments set contact_email = ${email}, contact_email_captured_at = coalesce(contact_email_captured_at, now()),
      updated_at = now() where plan_id = ${planId}::uuid returning input_revision`;
    if (!row) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    await appendAssessmentVersion(tx, { planId, actor: "assessment_api", source: "assessment_contact", changeReason: "contact_updated",
      eventType: "assessment_contact_updated", afterPayload: { contactEmail: email }, eventPayload: {} });
    return { planId, contactEmail: email, revision: Number(row.input_revision) };
  });
}

export async function retryAssessmentHealthScore(planId: string, locale: unknown) {
  if (!isUuid(planId) || !isLocale(locale)) throw new FunnelError("Invalid assessment request", 400, "invalid_request");
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  return withDatabaseTransaction(sql, async tx => {
    const [row] = await tx`select input_revision from public.assessments where plan_id = ${planId}::uuid for update`;
    if (!row) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    const taskId = await enqueueHealthScoreAnalysisTask({ planId, locale });
    return { planId, revision: Number(row.input_revision), taskId, generationStatus: taskId ? "pending" : "ready" };
  });
}
