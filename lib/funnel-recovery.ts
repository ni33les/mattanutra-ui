import { recoverMissingFunnelGeneration } from "@/lib/funnel-generation-recovery";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { getFunnelReadiness } from "@/lib/funnel-readiness";
import { isUuid } from "@/lib/assessment-store";
import { isLocale } from "@/lib/i18n";
import { loadGenerationInput, withGenerationInput } from "@/lib/assessment-revisions";
import { enqueueAssessmentPregenerationTasks, enqueueHealthScoreAnalysisTask, enqueueNutritionPlanTasks, ensureFreshProductRecommendationsForReveal } from "@/lib/task-worker";
import { enqueueWebPaymentFulfillment } from "@/lib/web-payment-fulfillment";
import { fulfillCheckoutSession, type PaymentRow } from "@/lib/stripe-payments";
import { FunnelError } from "@/lib/funnel-errors";

/** Explicit recovery: no charge creation, and no render-time task scheduling. */
export async function recoverFunnelWork(planId: string, locale: unknown, refreshOnly = false) {
  if (!isUuid(planId) || !isLocale(locale)) throw new FunnelError("Invalid assessment request", 400, "invalid_request");
  const sql = getSql(); if (!sql) throw new Error("Database is not configured");
  const [legacy] = await sql<PaymentRow[]>`select * from public.payments where plan_id = ${planId}::uuid
    and paid_at is not null and status = 'fulfillment_failed' order by created_at desc limit 1`;
  if (legacy?.stripe_checkout_session_id) await fulfillCheckoutSession(legacy.stripe_checkout_session_id, { source: "return_page" });
  await withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select selected_plan, answers from public.assessments where plan_id = ${planId}::uuid for no key update`;
    if (!assessment) throw new FunnelError("Assessment not found", 404, "assessment_not_found");
    const generation = await loadGenerationInput(tx, planId, locale);
    if (!generation) throw new FunnelError("Assessment changed; please retry", 409, "assessment_changed");
    await withGenerationInput(planId, generation, async () => {
      const [payment] = await tx<PaymentRow[]>`select * from public.payments where plan_id = ${planId}::uuid
        and status in ('paid', 'bound') order by created_at desc limit 1 for update`;
      if (payment) await enqueueWebPaymentFulfillment(tx, payment);
      if (!refreshOnly) {
        await enqueueHealthScoreAnalysisTask({ planId, locale });
        if (assessment.selected_plan) await enqueueNutritionPlanTasks({ planId, plan: assessment.selected_plan, answers: generation.answers, locale });
        else if (payment) await enqueueAssessmentPregenerationTasks({ planId, answers: generation.answers, locale });
      }
      if (assessment.selected_plan) await ensureFreshProductRecommendationsForReveal(planId);
    });
  });
  const readiness = await getFunnelReadiness(planId, locale);
  if (refreshOnly && readiness) await recoverMissingFunnelGeneration({ planId, locale,
    healthScoreMissing: !readiness.copyReady && !readiness.copyFailed,
    formulationMissing: readiness.hasPaidPlan && readiness.fulfillmentStatus === "complete" && readiness.formulationStatus === "pending" });
  return readiness;
}
