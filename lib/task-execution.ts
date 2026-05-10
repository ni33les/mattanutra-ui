import { validateLeadEmail } from "@/lib/email-validation";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "@/lib/example-email";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import type { HealthScoreResult } from "@/lib/health-score";
import { analyzeHealthScoreAdvice } from "@/lib/health-score-analysis";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "@/lib/reassessment-email";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import type { TaskWorkItem } from "@/lib/task-work-items";

function hasHealthScoreAdvice(value: unknown): value is HealthScoreResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "advice" in value &&
    Boolean((value as HealthScoreResult).advice)
  );
}

export async function executeTaskWorkItem(workItem: TaskWorkItem) {
  if (workItem.taskType === "analyze_healthscore") {
    const healthScore = hasHealthScoreAdvice(workItem.healthScore)
      ? workItem.healthScore
      : (Object.assign({}, workItem.healthScore, {
          advice: await analyzeHealthScoreAdvice({
            answers: workItem.answers,
            cache: false,
            healthScore: workItem.healthScore,
            locale: workItem.locale
          })
        }) satisfies HealthScoreResult);

    return {
      cachedOrExisting: hasHealthScoreAdvice(workItem.healthScore),
      healthScore
    };
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
      planId: workItem.planId
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
    const delivery = await sendTransactionalEmail({
      html: emailHtml,
      subject: buildExampleEmailSubject(workItem.locale, workItem.healthScore),
      to: emailValidation.email
    });

    return {
      emailHtml,
      emailType: "example_preview",
      messageId: delivery.messageId,
      reason: delivery.reason,
      sent: delivery.sent,
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
    const delivery = await sendTransactionalEmail({
      html: emailHtml,
      subject: buildReassessmentEmailSubject(workItem.locale),
      to: emailValidation.email
    });

    return {
      emailHtml,
      emailType: "reassessment",
      messageId: delivery.messageId,
      reason: delivery.reason,
      recurrenceDays: workItem.recurrenceDays,
      sent: delivery.sent,
      to: emailValidation.email,
      unsubscribeToken: workItem.unsubscribeToken
    };
  }

  if (workItem.taskType === "client_safety_followup") {
    return { accepted: true };
  }

  throw new Error(`Unsupported task type: ${workItem.taskType}`);
}
