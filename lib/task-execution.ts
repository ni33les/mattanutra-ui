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
import { analyzePanyaCustomerChatWithGrok } from "@/lib/panya-chat-agent";
import {
  adminCataloguePotentialCandidates,
  buildAdminCataloguePotentialTraceChunk,
  runAdminCatalogueOptimizationFast,
  runAdminCataloguePotentialOptimizationFromTraces,
  type AdminPlanCoverageSimulationSampleTrace
} from "@/lib/admin-product-coverage";
import {
  adminCataloguePotentialCandidateHash
} from "@/lib/admin-catalogue-optimization-jobs";
import {
  PRODUCT_STACK_VARIANT_CONFIGS,
  recommendProductStackFullBeam,
  type ProductRecommendationResult
} from "@/lib/product-recommendations";
import type { ProductRecommendationRetailerCandidateSet } from "@/lib/admin-products";
import { isRetailAgentExecutableTaskType } from "@/lib/retail-task-policy";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import type { TaskWorkItem } from "@/lib/task-work-items";
import type { SendTransactionalEmailResult } from "@/lib/smtp-email";

export type TaskExecutionRuntime = Readonly<{
  reportProgress?: (resultPayload: Record<string, unknown>) => Promise<unknown> | unknown;
  signal?: AbortSignal;
}>;

const catalogueOptimizationJobChunkSize = 4;

function analysisErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown HealthScore analysis error";
}

function throwIfTaskExecutionAborted(runtime: TaskExecutionRuntime) {
  if (runtime.signal?.aborted) {
    throw new Error("Task execution aborted");
  }
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

async function configuredSql() {
  const { getSql } = await import("@/lib/db");

  return getSql();
}

async function executeRetailAgentCommandForTask(input: Parameters<
  typeof import("@/lib/admin-retail-stock")["executeRetailAgentCommand"]
>[0]) {
  const { executeRetailAgentCommand } = await import("@/lib/admin-retail-stock");

  return executeRetailAgentCommand(input);
}

async function sourceProductFdaApprovalNumbersForTask(input: Parameters<
  typeof import("@/lib/product-fda-sourcing")["sourceProductFdaApprovalNumbers"]
>[0]) {
  const { sourceProductFdaApprovalNumbers } = await import(
    "@/lib/product-fda-sourcing"
  );

  return sourceProductFdaApprovalNumbers(input);
}

async function sourceProductIdentifiersForTask(input: Parameters<
  typeof import("@/lib/product-identifiers")["sourceProductIdentifiers"]
>[0]) {
  const { sourceProductIdentifiers } = await import("@/lib/product-identifiers");

  return sourceProductIdentifiers(input);
}

async function reportExecutionProgress(
  runtime: TaskExecutionRuntime,
  resultPayload: Record<string, unknown>
) {
  if (runtime.reportProgress) {
    await runtime.reportProgress(resultPayload);
  }
}

type RetailerRecommendationOption = Readonly<{
  backorderCount: number;
  currency: string;
  dispatchCity: string | null;
  etaDate: string | null;
  organisationId: string;
  organisationName: string;
  productCount: number;
  recommendations: ProductRecommendationResult;
  subtotalAmount: number;
  supplementProductCoveragePercent: number;
  totalPlanCoveragePercent: number;
  unavailableReason: string | null;
}>;

function latestEtaDate(values: readonly (string | null | undefined)[]) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function compareNullableEta(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  return left.localeCompare(right);
}

function retailerRecommendationSubtotal(result: ProductRecommendationResult) {
  return result.recommendations.reduce(
    (total, item) => total + (item.unitPriceAmount ?? item.product.priceAmount ?? 0),
    0
  );
}

function retailerRecommendationOption(input: Readonly<{
  candidateSet: ProductRecommendationRetailerCandidateSet;
  recommendations: ProductRecommendationResult;
}>): RetailerRecommendationOption {
  const selectedItems = input.recommendations.recommendations;
  const etaDate = latestEtaDate(
    selectedItems.map((item) => item.etaDate ?? item.product.retailEtaDate)
  );

  return {
    backorderCount: selectedItems.filter((item) =>
      (item.availabilityStatus ?? item.product.retailAvailabilityStatus) === "backorder"
    ).length,
    currency:
      selectedItems.find((item) => item.product.currency)?.product.currency ??
      input.candidateSet.currency,
    dispatchCity: input.candidateSet.dispatchCity,
    etaDate,
    organisationId: input.candidateSet.organisationId,
    organisationName: input.candidateSet.organisationName,
    productCount: selectedItems.length,
    recommendations: input.recommendations,
    subtotalAmount: retailerRecommendationSubtotal(input.recommendations),
    supplementProductCoveragePercent:
      input.recommendations.supplementProductCoveragePercent,
    totalPlanCoveragePercent: input.recommendations.totalPlanCoveragePercent,
    unavailableReason:
      selectedItems.length > 0 ? null : "No retailer products matched the client needs."
  };
}

function retailerOptionSummary(option: RetailerRecommendationOption) {
  return {
    backorderCount: option.backorderCount,
    currency: option.currency,
    dispatchCity: option.dispatchCity,
    etaDate: option.etaDate,
    organisationId: option.organisationId,
    organisationName: option.organisationName,
    productCount: option.productCount,
    subtotalAmount: option.subtotalAmount,
    supplementProductCoveragePercent: option.supplementProductCoveragePercent,
    totalPlanCoveragePercent: option.totalPlanCoveragePercent,
    unavailableReason: option.unavailableReason
  };
}

function selectRetailerRecommendationOption(
  options: readonly RetailerRecommendationOption[]
) {
  return [...options].sort((left, right) =>
    right.supplementProductCoveragePercent - left.supplementProductCoveragePercent ||
    right.totalPlanCoveragePercent - left.totalPlanCoveragePercent ||
    left.subtotalAmount - right.subtotalAmount ||
    compareNullableEta(left.etaDate, right.etaDate)
  )[0] ?? null;
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

export async function executeTaskWorkItem(
  workItem: TaskWorkItem,
  runtime: TaskExecutionRuntime = {}
) {
  if (workItem.taskType === "admin_catalogue_optimization_job") {
    const simulationData = workItem.simulationData;
    const totalSamples = simulationData.sampleTraces.length;

    await reportExecutionProgress(runtime, {
      completedSamples: 0,
      message: "Calculating approved basket",
      stage: "starting",
      totalSamples
    });
    throwIfTaskExecutionAborted(runtime);
    const approvedOptimization = runAdminCatalogueOptimizationFast({
      includeReviewPriorityProducts: false,
      simulationData
    });
    throwIfTaskExecutionAborted(runtime);

    await reportExecutionProgress(runtime, {
      completedSamples: 0,
      message: "Approved basket calculated",
      stage: "loading_catalogue",
      totalSamples
    });

    if (!workItem.includePendingReviewProducts) {
      const optimization = {
        ...approvedOptimization,
        potential: null
      };

      return {
        approvedOptimization,
        candidateCount: 0,
        candidateHash: null,
        completedSamples: optimization.sampleSize,
        message: "Optimum basket ready",
        optimization,
        stage: "completed",
        totalSamples: optimization.sampleSize
      };
    }

    await reportExecutionProgress(runtime, {
      completedSamples: 0,
      message: "Loading potential product catalogue",
      stage: "loading_catalogue",
      totalSamples
    });

    const potentialCandidates = workItem.potentialCandidates;
    const candidateCount = adminCataloguePotentialCandidates(
      potentialCandidates
    ).length;
    const candidateHash = adminCataloguePotentialCandidateHash(
      potentialCandidates
    );
    let potentialTraces: AdminPlanCoverageSimulationSampleTrace[] =
      workItem.existingCandidateHash === candidateHash
        ? [...workItem.existingPotentialTraces]
        : [];

    await reportExecutionProgress(runtime, {
      candidateCount,
      candidateHash,
      completedSamples: potentialTraces.length,
      message: "Evaluating potential basket",
      potentialTraces,
      stage: "evaluating",
      totalSamples
    });

    for (
      let startIndex = potentialTraces.length;
      startIndex < totalSamples;
      startIndex += catalogueOptimizationJobChunkSize
    ) {
      throwIfTaskExecutionAborted(runtime);
      const chunk = buildAdminCataloguePotentialTraceChunk({
        chunkSize: catalogueOptimizationJobChunkSize,
        potentialCandidates,
        simulationData,
        startIndex
      });

      potentialTraces = [
        ...potentialTraces,
        ...chunk.sampleTraces
      ];

      await reportExecutionProgress(runtime, {
        candidateCount: chunk.candidateCount,
        candidateHash,
        completedSamples: potentialTraces.length,
        message: "Evaluating potential basket",
        potentialTraces,
        stage: "evaluating",
        totalSamples: chunk.totalSamples
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throwIfTaskExecutionAborted(runtime);

    await reportExecutionProgress(runtime, {
      candidateCount,
      candidateHash,
      completedSamples: potentialTraces.length,
      message: "Finalizing optimum basket",
      potentialTraces,
      stage: "finalizing",
      totalSamples
    });

    const potential = runAdminCataloguePotentialOptimizationFromTraces({
      coverageLossTolerancePercent: 0,
      potentialCandidates,
      sampleTraces: potentialTraces,
      simulationData
    });
    const optimization = {
      ...approvedOptimization,
      potential
    };

    return {
      approvedOptimization,
      candidateCount,
      candidateHash,
      completedSamples: optimization.sampleSize,
      message: "Optimum basket ready",
      optimization,
      stage: "completed",
      totalSamples: optimization.sampleSize
    };
  }

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
        cache: true,
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
            locale: workItem.locale,
            outputLocaleMode: "single_display_locale",
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

  if (workItem.taskType === "send_retail_order_workflow_email") {
    const sql = await configuredSql();

    if (!sql) {
      throw new Error("Retail order email task cannot run without a database");
    }

    const { sendRetailOrderWorkflowEmailNow } = await import(
      "@/lib/retail-order-workflow"
    );
    const delivery = await sendRetailOrderWorkflowEmailNow({
      event: workItem.event,
      locale: workItem.locale,
      orderId: workItem.orderId,
      paymentId: workItem.paymentId,
      planId: workItem.planId,
      sql
    });

    return {
      emailType: `retail_order_${workItem.event}`,
      orderId: workItem.orderId,
      paymentId: workItem.paymentId,
      planId: workItem.planId,
      reason: delivery.reason,
      sent: delivery.sent,
      taskId: workItem.taskId
    };
  }

  if (workItem.taskType === "route_admin_communication") {
    const { executeAdminCommunicationRouteTask } = await import(
      "@/lib/communications"
    );
    const routed = await executeAdminCommunicationRouteTask({
      body: workItem.body,
      channelType: workItem.channelType,
      eventKey: workItem.eventKey,
      metadata: workItem.metadata,
      organisationId: workItem.organisationId,
      resourceId: workItem.resourceId,
      resourceType: workItem.resourceType,
      subject: workItem.subject,
      taskId: workItem.taskId
    });

    return {
      dispatchTaskCount: routed.dispatchTasks.length,
      messageCount: routed.messages.length,
      messageIds: routed.messages.map((message) => message.id),
      organisationId: workItem.organisationId
    };
  }

  if (
    workItem.taskType === "dispatch_chat_communication_message" ||
    workItem.taskType === "dispatch_email_communication_message"
  ) {
    const { executeCommunicationDispatchTask } = await import(
      "@/lib/communications"
    );
    const dispatch = await executeCommunicationDispatchTask({
      messageId: workItem.messageId
    });

    return {
      attempted: dispatch.attempted,
      messageId: dispatch.message.id,
      organisationId: workItem.organisationId,
      provider: dispatch.provider,
      reason: dispatch.reason,
      status: dispatch.message.status
    };
  }

  if (workItem.taskType === "client_safety_followup") {
    return { accepted: true };
  }

  if (workItem.taskType === "customer_chat_reply") {
    const analysis = await analyzePanyaCustomerChatWithGrok(workItem);

    return { analysis };
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
    const retailerCandidateSets = workItem.retailerCandidateSets ?? [];
    const recommendationVariants = PRODUCT_STACK_VARIANT_CONFIGS.map((config) => {
      const variantStartedAt = Date.now();
      const retailerOptions = retailerCandidateSets.map((candidateSet) =>
        retailerRecommendationOption({
          candidateSet,
          recommendations: recommendProductStackFullBeam({
            candidates: candidateSet.candidates,
            clientContext: workItem.clientContext,
            clientSex: workItem.clientSex,
            countryCode: workItem.countryCode,
            maxProducts: config.maxProducts,
            needs: workItem.needs,
            stackPreference: config.stackPreference,
            targetProducts: config.targetProducts
          })
        })
      );
      const selectedRetailerOption =
        selectRetailerRecommendationOption(retailerOptions);
      const recommendations = selectedRetailerOption?.recommendations ??
        recommendProductStackFullBeam({
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
            retailerOptions: retailerOptions.map(retailerOptionSummary),
            selectedRetailer: selectedRetailerOption
              ? retailerOptionSummary(selectedRetailerOption)
              : null,
            stackPreference: config.stackPreference,
            trace: {
              ...recommendations.diagnostics.trace,
              maxProducts: config.maxProducts,
              retailerCandidateSetCount: retailerCandidateSets.length,
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

  if (workItem.taskType === "source_product_fda_approvals") {
    return sourceProductFdaApprovalNumbersForTask({
      includeManufacturerEvidence: workItem.includeManufacturerEvidence,
      limit: workItem.limit,
      maxRunMs: workItem.maxRunMs,
      productId: workItem.productId
    });
  }

  if (workItem.taskType === "source_product_identifiers") {
    return sourceProductIdentifiersForTask({
      limit: workItem.limit,
      productId: workItem.productId
    });
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

  if (workItem.taskType === "retail_stock_forecast_refresh") {
    return executeRetailAgentCommandForTask({
      organisationId: workItem.organisationId,
      payload: {
        productId: workItem.productId,
        source: workItem.source,
        stockId: workItem.stockId
      },
      sourceEntityId: workItem.stockId,
      sourceEntityType: "retail_product_stock",
      taskId: workItem.taskId,
      taskType: workItem.taskType
    });
  }

  if (
    workItem.taskType === "carrier_event_process" ||
    workItem.taskType === "carrier_label_generate" ||
    workItem.taskType === "carrier_pickup_book" ||
    workItem.taskType === "carrier_shipment_create" ||
    workItem.taskType === "carrier_tracking_sync"
  ) {
    const { executeCarrierShipmentTask } = await import(
      "@/lib/retail-carrier-shipments"
    );

    return executeCarrierShipmentTask(workItem);
  }

  if (workItem.taskType.startsWith("retail_")) {
    if (!isRetailAgentExecutableTaskType(workItem.taskType)) {
      throw new Error(
        `Retail task ${workItem.taskType} is human-only or not agent-executable`
      );
    }

    const retailWorkItem = workItem as Extract<
      TaskWorkItem,
      { organisationId: string }
    >;

    if (!("taskId" in retailWorkItem)) {
      throw new Error(`Retail task ${workItem.taskType} is missing a task id`);
    }

    return executeRetailAgentCommandForTask({
      organisationId: retailWorkItem.organisationId,
      payload: "payload" in retailWorkItem ? retailWorkItem.payload : {},
      sourceEntityId: "sourceEntityId" in retailWorkItem
        ? retailWorkItem.sourceEntityId
        : null,
      sourceEntityType: "sourceEntityType" in retailWorkItem
        ? retailWorkItem.sourceEntityType
        : null,
      taskId: retailWorkItem.taskId,
      taskType: retailWorkItem.taskType
    });
  }

  throw new Error(`Unsupported task type: ${workItem.taskType}`);
}
