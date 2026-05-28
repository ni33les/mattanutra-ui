import { validateLeadEmail } from "@/lib/email-validation";
import { analyzeFoodGapSupportDeterministically } from "@/lib/food-gap-support";
import { analyzeFoodGuidanceWithGrok } from "@/lib/food-guidance-analysis";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import { fetchDigitalOceanInvoicePreview } from "@/lib/finance-ledger";
import type {
  HealthScoreAdvice,
  HealthScorePageAiCard,
  HealthScorePageAiCopy,
  HealthScorePaywallFeature,
  HealthScoreResult
} from "@/lib/health-score";
import { analyzeHealthScoreAdviceWithUsage } from "@/lib/health-score-analysis";
import {
  analyzeNutritionPlanChatWithGrok,
  analyzeNutritionReportWithGrok
} from "@/lib/nutrition-plan-advisor-analysis";
import {
  PRODUCT_STACK_VARIANT_CONFIGS,
  recommendProductStackFullBeam
} from "@/lib/product-recommendations";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import type { TaskWorkItem } from "@/lib/task-work-items";
import type { SendTransactionalEmailResult } from "@/lib/smtp-email";

function analysisErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown HealthScore analysis error";
}

function hasHealthScoreAdvice(value: unknown) {
  const record =
    value !== null && typeof value === "object"
      ? (value as HealthScoreResult)
      : null;

  return (
    Boolean(record?.advice) ||
    Boolean(record?.pageContent?.aiCopy)
  );
}

function localizedFallback(text: string | null | undefined) {
  const fallback = text?.trim() || "Your HealthScore is ready.";

  return {
    en: fallback,
    th: fallback
  };
}

function localizedFallbackCard(
  title: string | null | undefined,
  body: string | null | undefined
): HealthScorePageAiCard {
  return {
    body: localizedFallback(body),
    headline: localizedFallback(title)
  };
}

function deterministicPaywallFeatures(
  healthScore: HealthScoreResult
): HealthScorePaywallFeature[] {
  const seedCards = healthScore.pageContent?.copySeeds.methodCards ?? [];
  const fallbackCards = [
    {
      body: "Your goals, routine, and safety context stay connected to the plan.",
      title: "Personalized from your answers"
    },
    {
      body: "The formula keeps only what fits your score and disclosed constraints.",
      title: "Built by subtraction"
    },
    {
      body: "The next step turns the score into supplement and product choices.",
      title: "Ready for the full plan"
    }
  ];

  return [...seedCards, ...fallbackCards].slice(0, 3).map((card) => ({
    description: localizedFallback(card.body),
    name: localizedFallback(card.title)
  }));
}

function deterministicHealthScoreAdvice(
  healthScore: HealthScoreResult
): HealthScoreAdvice {
  const seeds = healthScore.pageContent?.copySeeds;

  return {
    focusArea: localizedFallback(seeds?.pillarHeadline ?? healthScore.headline),
    howToImprove: localizedFallback(
      seeds?.highestLeverage?.text ??
      healthScore.movers[0]?.label ??
      healthScore.summary
    ),
    overview: localizedFallback(seeds?.heroBody ?? healthScore.summary),
    paywallEyebrow: localizedFallback("Your plan is ready"),
    paywallFeatures: deterministicPaywallFeatures(healthScore),
    paywallSubtitle: localizedFallback(
      "Open the full plan to turn this score into the exact formula and product stack."
    ),
    paywallTitle: localizedFallback("Turn your HealthScore into a plan")
  };
}

function deterministicHealthScorePageCopy(
  healthScore: HealthScoreResult
): HealthScorePageAiCopy {
  const seeds = healthScore.pageContent?.copySeeds;

  return {
    bandLine: localizedFallback(seeds?.bandLine ?? healthScore.headline),
    findings: (seeds?.findings ?? []).slice(0, 3).map((finding) =>
      localizedFallbackCard(finding.headline, finding.body)
    ),
    findingsHeadline: localizedFallback(seeds?.findingsHeadline),
    findingsSub: localizedFallback(seeds?.findingsSub),
    gapTrio: (seeds?.gapTrio ?? []).slice(0, 3).map((card) =>
      localizedFallbackCard(card.headline, card.body)
    ),
    heroBody: localizedFallback(seeds?.heroBody ?? healthScore.summary),
    heroTitle: localizedFallback(seeds?.goalMirror ?? healthScore.headline),
    highestLeverageBody: localizedFallback(seeds?.highestLeverage?.text),
    methodCards: (seeds?.methodCards ?? []).slice(0, 3).map((card) => ({
      body: localizedFallback(card.body),
      title: localizedFallback(card.title)
    })),
    methodHeadline: localizedFallback(seeds?.methodHeadline),
    overview: localizedFallback(healthScore.summary),
    paywallFeatures: deterministicPaywallFeatures(healthScore),
    paywallSubtitle: localizedFallback(
      "Open the full plan to turn this score into the exact formula and product stack."
    ),
    paywallTitle: localizedFallback("Turn your HealthScore into a plan"),
    pillarHeadline: localizedFallback(seeds?.pillarHeadline),
    relativityHeadline: localizedFallback(seeds?.relativity.headline),
    relativitySub: localizedFallback(seeds?.relativity.sub),
    strengthNote: localizedFallback(seeds?.strengthNote),
    subtractionBody: localizedFallback(seeds?.subtraction.body)
  };
}

function withDeterministicHealthScoreFallback(
  healthScore: HealthScoreResult
): HealthScoreResult {
  return {
    ...healthScore,
    advice: healthScore.advice ?? deterministicHealthScoreAdvice(healthScore),
    ...(healthScore.pageContent
      ? {
          pageContent: {
            ...healthScore.pageContent,
            aiCopy:
              healthScore.pageContent.aiCopy ??
              deterministicHealthScorePageCopy(healthScore)
          }
        }
      : {})
  };
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
        healthScore: {
          ...workItem.healthScore,
          advice: analysis.advice,
          ...(workItem.healthScore.pageContent
            ? {
                pageContent: {
                  ...workItem.healthScore.pageContent,
                  aiCopy: analysis.aiCopy
                }
              }
            : {})
        } satisfies HealthScoreResult,
        xaiUsage: {
          metadata: {
            promptVersion: analysis.promptVersion,
            taskId: workItem.taskId
          },
          model: analysis.model,
          purpose: "healthscore_page_copy",
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
        healthScore: withDeterministicHealthScoreFallback(workItem.healthScore)
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

  if (workItem.taskType === "generate_food_guidance") {
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

  if (workItem.taskType === "generate_food_gap_guidance") {
    const analysis = await analyzeFoodGapSupportDeterministically({
      answers: workItem.answers,
      audit: async () => undefined,
      chatMessages: workItem.chatMessages,
      locale: workItem.locale,
      managedFoods: workItem.managedFoods,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      previousFoodGuidance: workItem.previousFoodGuidance,
      previousFormulation: workItem.previousFormulation,
      productVariants: workItem.productVariants,
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
      firstName: workItem.firstName,
      foodGuidance: workItem.foodGuidance,
      formulation: workItem.formulation,
      guidanceAdjustments: workItem.guidanceAdjustments,
      healthScore: workItem.healthScore,
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
      firstName: workItem.firstName,
      foodGuidance: workItem.foodGuidance,
      formulation: workItem.formulation,
      guidanceAdjustments: workItem.guidanceAdjustments,
      healthScore: workItem.healthScore,
      locale: workItem.locale,
      plan: workItem.plan,
      planFeedback: workItem.planFeedback,
      planId: workItem.planId,
      taskId: workItem.taskId
    });

    return { analysis };
  }

  if (workItem.taskType === "generate_product_recommendations") {
    const matcherStartedAt = Date.now();
    const recommendationVariants = PRODUCT_STACK_VARIANT_CONFIGS.map((config) => {
      const variantStartedAt = Date.now();
      const recommendations = recommendProductStackFullBeam({
        candidates: workItem.candidates,
        clientContext: workItem.clientContext,
        clientSex: workItem.clientSex,
        countryCode: workItem.countryCode,
        maxProducts: config.maxProducts,
        needs: workItem.needs,
        stackPreference: config.stackPreference,
        targetProducts: config.targetProducts
      });
      const variantMatcherMs = Date.now() - variantStartedAt;

      return {
        maxProducts: config.maxProducts,
        recommendations: {
          ...recommendations,
          diagnostics: {
            ...recommendations.diagnostics,
            stackPreference: config.stackPreference,
            trace: {
              ...recommendations.diagnostics.trace,
              maxProducts: config.maxProducts,
              targetProducts: config.targetProducts,
              timingMs: {
                ...(recommendations.diagnostics.trace?.timingMs ?? {}),
                candidateLoadMs: workItem.candidateLoadMs ?? 0,
                matcherMs: variantMatcherMs
              }
            }
          }
        },
        stackPreference: config.stackPreference
      };
    });
    const recommendations =
      recommendationVariants.find((variant) =>
        variant.stackPreference === workItem.stackPreference
      )?.recommendations ?? recommendationVariants[1]?.recommendations ??
      recommendationVariants[0].recommendations;
    const matcherMs = Date.now() - matcherStartedAt;

    return {
      discovery: {
        diagnostics: [],
        products: []
      },
      recommendationVariants,
      recommendations: {
        ...recommendations,
        diagnostics: {
          ...recommendations.diagnostics,
          trace: {
            ...recommendations.diagnostics.trace,
            timingMs: {
              ...(recommendations.diagnostics.trace?.timingMs ?? {}),
              candidateLoadMs: workItem.candidateLoadMs ?? 0,
              matcherMs
            }
          }
        }
      }
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
