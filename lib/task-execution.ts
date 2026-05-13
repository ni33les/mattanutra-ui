import { validateLeadEmail } from "@/lib/email-validation";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "@/lib/example-email";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import { syncDigitalOceanBillingCosts } from "@/lib/finance-ledger";
import type { HealthScoreResult } from "@/lib/health-score";
import { analyzeHealthScoreAdvice } from "@/lib/health-score-analysis";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import type { TaskWorkItem } from "@/lib/task-work-items";
import type { SendTransactionalEmailResult } from "@/lib/smtp-email";

function analysisErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown HealthScore analysis error";
}

function hasHealthScoreAdvice(value: unknown): value is HealthScoreResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "advice" in value &&
    Boolean((value as HealthScoreResult).advice)
  );
}

function requireSentEmail(
  delivery: SendTransactionalEmailResult,
  emailType: string
) {
  if (delivery.sent) {
    return;
  }

  throw new Error(
    `${emailType} email was not sent${delivery.reason ? `: ${delivery.reason}` : ""}`
  );
}

export async function executeTaskWorkItem(workItem: TaskWorkItem) {
  if (workItem.taskType === "analyze_healthscore") {
    if (hasHealthScoreAdvice(workItem.healthScore)) {
      return {
        cachedOrExisting: true,
        healthScore: workItem.healthScore
      };
    }

    try {
      const advice = await analyzeHealthScoreAdvice({
        answers: workItem.answers,
        cache: false,
        healthScore: workItem.healthScore,
        locale: workItem.locale,
        taskId: workItem.taskId
      });

      return {
        cachedOrExisting: false,
        healthScore: Object.assign({}, workItem.healthScore, {
          advice
        }) satisfies HealthScoreResult
      };
    } catch (error) {
      return {
        cachedOrExisting: false,
        errorMessage: analysisErrorMessage(error),
        fallbackUsed: true,
        healthScore: workItem.healthScore
      };
    }
  }

  if (
    workItem.taskType === "generate_formulation" ||
    workItem.taskType === "generate_example_formulation"
  ) {
    const analysis = await analyzeFormulationWithGrok({
      answers: workItem.answers,
      audit: async () => undefined,
      locale: workItem.locale,
      plan: workItem.plan,
      planId: workItem.planId,
      taskId: workItem.taskId
    });

    return { analysis };
  }

  if (workItem.taskType === "send_example_email") {
    const emailValidation = validateLeadEmail(workItem.email);

    if (!emailValidation.ok) {
      throw new Error("Example email request has an invalid recipient");
    }

    const emailHtml = buildExampleEmailHtml({
      formulation: workItem.formulation,
      healthScore: workItem.healthScore,
      locale: workItem.locale,
      planId: workItem.planId,
      unsubscribeToken: workItem.unsubscribeToken
    });
    const subject = buildExampleEmailSubject(workItem.locale, workItem.healthScore);
    const delivery = await sendTransactionalEmail({
      html: emailHtml,
      subject,
      to: emailValidation.email
    });
    requireSentEmail(delivery, "Example preview");

    return {
      emailHtml,
      emailType: "example_preview",
      messageId: delivery.messageId,
      reason: delivery.reason,
      sent: delivery.sent,
      subject,
      to: emailValidation.email
    };
  }

  if (workItem.taskType === "send_reassessment_email") {
    const emailValidation = validateLeadEmail(workItem.email);

    if (!emailValidation.ok) {
      throw new Error("Scheduled reassessment email is invalid");
    }

    const emailHtml = buildReassessmentEmailHtml({
      locale: workItem.locale,
      planId: workItem.planId,
      unsubscribeToken: workItem.unsubscribeToken
    });
    const subject = buildReassessmentEmailSubject(workItem.locale);
    const delivery = await sendTransactionalEmail({
      html: emailHtml,
      subject,
      to: emailValidation.email
    });
    requireSentEmail(delivery, "Reassessment");

    return {
      emailHtml,
      emailType: "reassessment",
      messageId: delivery.messageId,
      reason: delivery.reason,
      recurrenceDays: workItem.recurrenceDays,
      sent: delivery.sent,
      subject,
      to: emailValidation.email,
      unsubscribeToken: workItem.unsubscribeToken
    };
  }

  if (workItem.taskType === "client_safety_followup") {
    return { accepted: true };
  }

  if (workItem.taskType === "content_status_change") {
    return {
      accepted: true,
      contentId: workItem.contentId,
      contentType: workItem.contentType,
      targetStatus: workItem.targetStatus
    };
  }

  if (workItem.taskType === "sync_digitalocean_billing") {
    const digitalOcean = await syncDigitalOceanBillingCosts({
      taskId: workItem.taskId
    });

    return {
      digitalOcean,
      projectNames: workItem.projectNames
    };
  }

  throw new Error(`Unsupported task type: ${workItem.taskType}`);
}
