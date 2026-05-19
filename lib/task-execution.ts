import { validateLeadEmail } from "@/lib/email-validation";
import { analyzeFoodGuidanceWithGrok } from "@/lib/food-guidance-analysis";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import { fetchDigitalOceanInvoicePreview } from "@/lib/finance-ledger";
import type { HealthScoreResult } from "@/lib/health-score";
import { analyzeHealthScoreAdviceWithUsage } from "@/lib/health-score-analysis";
import {
  analyzeNutritionPlanChatWithGrok,
  analyzeNutritionReportWithGrok
} from "@/lib/nutrition-plan-advisor-analysis";
import { recommendProductStack } from "@/lib/product-recommendations";
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
      const analysis = await analyzeHealthScoreAdviceWithUsage({
        answers: workItem.answers,
        cache: false,
        healthScore: workItem.healthScore,
        locale: workItem.locale
      });

      return {
        cachedOrExisting: false,
        healthScore: Object.assign({}, workItem.healthScore, {
          advice: analysis.advice
        }) satisfies HealthScoreResult,
        xaiUsage: {
          metadata: {
            promptVersion: analysis.promptVersion,
            taskId: workItem.taskId
          },
          model: analysis.model,
          purpose: "healthscore_advice",
          reasoningEffort: analysis.reasoningEffort,
          responseId: analysis.responseId,
          usage: analysis.usage
        }
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
    workItem.taskType === "generate_supplement_guidance" ||
    workItem.taskType === "generate_example_supplement_guidance"
  ) {
    const analysis = await analyzeFormulationWithGrok({
      answers: workItem.answers,
      audit: async () => undefined,
      canonicalSupplements: workItem.canonicalSupplements,
      chatMessages: workItem.chatMessages,
      locale: workItem.locale,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      previousFoodGuidance: workItem.previousFoodGuidance,
      previousFormulation: workItem.previousFormulation,
      taskId: workItem.taskId
    });

    return { analysis };
  }

  if (
    workItem.taskType === "generate_food_guidance" ||
    workItem.taskType === "generate_example_food_guidance"
  ) {
    const analysis = await analyzeFoodGuidanceWithGrok({
      answers: workItem.answers,
      audit: async () => undefined,
      chatMessages: workItem.chatMessages,
      locale: workItem.locale,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      previousFoodGuidance: workItem.previousFoodGuidance,
      previousFormulation: workItem.previousFormulation,
      taskId: workItem.taskId
    });

    return { analysis };
  }

  if (workItem.taskType === "send_example_email") {
    const emailValidation = validateLeadEmail(workItem.to || workItem.email);

    if (!emailValidation.ok) {
      throw new Error("Example email request has an invalid recipient");
    }

    const delivery = await sendTransactionalEmail({
      html: workItem.html,
      subject: workItem.subject,
      to: emailValidation.email
    });
    requireSentEmail(delivery, "Example preview");

    return {
      emailHtml: workItem.html,
      emailType: "example_preview",
      messageId: delivery.messageId,
      reason: delivery.reason,
      sent: delivery.sent,
      subject: workItem.subject,
      to: emailValidation.email
    };
  }

  if (workItem.taskType === "send_reassessment_email") {
    const emailValidation = validateLeadEmail(workItem.to || workItem.email);

    if (!emailValidation.ok) {
      throw new Error("Scheduled reassessment email is invalid");
    }

    const delivery = await sendTransactionalEmail({
      html: workItem.html,
      subject: workItem.subject,
      to: emailValidation.email
    });
    requireSentEmail(delivery, "Reassessment");

    return {
      emailHtml: workItem.html,
      emailType: "reassessment",
      messageId: delivery.messageId,
      reason: delivery.reason,
      recurrenceDays: workItem.recurrenceDays,
      sent: delivery.sent,
      subject: workItem.subject,
      to: emailValidation.email,
      unsubscribeToken: workItem.unsubscribeToken
    };
  }

  if (workItem.taskType === "client_safety_followup") {
    return { accepted: true };
  }

  if (workItem.taskType === "nutrition_plan_chat_reply") {
    const analysis = await analyzeNutritionPlanChatWithGrok({
      answers: workItem.answers,
      chatMessages: workItem.chatMessages,
      foodGuidance: workItem.foodGuidance,
      formulation: workItem.formulation,
      guidanceAdjustments: workItem.guidanceAdjustments,
      locale: workItem.locale,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      taskId: workItem.taskId,
      userMessage: workItem.userMessage
    });

    return { analysis };
  }

  if (workItem.taskType === "generate_nutrition_report") {
    const analysis = await analyzeNutritionReportWithGrok({
      answers: workItem.answers,
      chatMessages: workItem.chatMessages,
      foodGuidance: workItem.foodGuidance,
      formulation: workItem.formulation,
      guidanceAdjustments: workItem.guidanceAdjustments,
      locale: workItem.locale,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      taskId: workItem.taskId
    });

    return { analysis };
  }

  if (workItem.taskType === "generate_product_recommendations") {
    const recommendations = recommendProductStack({
      candidates: workItem.candidates,
      clientSex: workItem.clientSex,
      needs: workItem.needs
    });

    return {
      discovery: {
        diagnostics: [],
        products: []
      },
      recommendations
    };
  }

  if (
    workItem.taskType === "discover_products" ||
    workItem.taskType === "parse_product_label" ||
    workItem.taskType === "refresh_marketplace_product"
  ) {
    return {
      accepted: true,
      reason: "Marketplace official adapter is not configured yet.",
      skipped: true,
      taskType: workItem.taskType
    };
  }

  if (workItem.taskType === "refine_nutrition_plan") {
    return {
      accepted: true,
      planId: workItem.planId,
      refinementHash: workItem.refinementHash
    };
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
    const digitalOcean = await fetchDigitalOceanInvoicePreview();

    return {
      digitalOcean,
      projectNames: workItem.projectNames
    };
  }

  throw new Error(`Unsupported task type: ${workItem.taskType}`);
}
