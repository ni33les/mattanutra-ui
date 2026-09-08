import type { PlanSuccessWire, PlanConversationWire, PlanDetailsWire } from "@/lib/agentic/contract/outputs";
import { CONVERSATION_OPTION_KEYS } from "@/lib/agentic/contract/outputs";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { canonicalHash } from "@/lib/agentic/value/canonical";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { conversationAdvice } from "@/lib/agentic/presentation/conversation-advice";
import { PLAN_PRESENTATION_VERSION } from "@/lib/agentic/presentation/version";

export type PlanSection = "request" | "products" | "coverage" | "advice" | "score" | "economics";
export type PlanViewInput = Readonly<{ responseView?: "full" | "conversation" | "details"; expectedRevision?: number; sections?: readonly PlanSection[]; optionIds?: readonly string[] }>;
export function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) as Pick<T, K>;
}
const availableDetails: PlanSection[] = ["request", "products", "coverage", "advice", "score", "economics"];
export function planResultVersion(plan: PlanSuccessWire) { return canonicalHash({ presentation: PLAN_PRESENTATION_VERSION, plan }); }
export function projectPlan(plan: PlanSuccessWire, input: PlanViewInput & { responseView: "conversation" }): PlanConversationWire;
export function projectPlan(plan: PlanSuccessWire, input: PlanViewInput & { responseView: "details" }): PlanDetailsWire | AgenticErrorResult;
export function projectPlan(plan: PlanSuccessWire, input: PlanViewInput): PlanSuccessWire | PlanConversationWire | PlanDetailsWire | AgenticErrorResult;
export function projectPlan(plan: PlanSuccessWire, input: PlanViewInput): PlanSuccessWire | PlanConversationWire | PlanDetailsWire | AgenticErrorResult {
  if (!input.responseView || input.responseView === "full") return plan;
  const base = { ...pick(plan, ["ok", "planHandle", "revision", "locale", "status"]), resultVersion: planResultVersion(plan), contractVersion: AGENTIC_CONTRACT_VERSION };
  if (input.responseView === "details") {
    if (input.expectedRevision !== plan.revision) return businessError({ reasonCode: "stale_revision", fieldPath: "expectedRevision", currentRevision: plan.revision, requestedRevision: input.expectedRevision, message: "Reload the plan and request details for its current revision." });
    if (!input.sections?.length) return businessError({ reasonCode: "invalid_request", fieldPath: "sections", message: "Choose at least one documented detail section." });
    const all = plan.options ?? [];
    if (input.optionIds?.some(id => !all.some(option => option.optionId === id))) return businessError({ reasonCode: "invalid_request", fieldPath: "optionIds", message: "Use option IDs returned for this revision." });
    const sections = input.sections;
    return { ...base, responseView: "details", sections: [...sections],
      ...(sections.includes("request") ? pick(plan, ["originalRequest"]) : {}),
      ...(sections.includes("advice") ? pick(plan, ["researchVersion", "claimIds", "safetyGuidance"]) : {}),
      ...(sections.includes("economics") ? pick(plan, ["orderSchedule", "comparisonBasis", "unavailableReasons", "cash30DayMinor", "cash90DayMinor", "nextReplenishmentDay"]) : {}),
      options: all.filter(option => !input.optionIds || input.optionIds.includes(option.optionId)).map(option => ({ optionId: option.optionId,
        ...(sections.includes("products") ? pick(option, ["basket"]) : {}),
        ...(sections.includes("coverage") ? pick(option, ["coverage"]) : {}),
        ...(sections.includes("advice") ? pick(option, ["advice"]) : {}),
        ...(sections.includes("score") ? pick(option, ["doseFit"]) : {}),
        ...(sections.includes("economics") ? pick(option, ["economics"]) : {}) })) };
  }
  const selectedOptionId = plan.optionId ?? plan.compactDecision?.optionId ?? null;
  const highlightedAlternativeOptionId = plan.compactDecision?.highlightedAlternativeOptionId ?? null;
  const { advice, planAdviceIds } = conversationAdvice(plan, [selectedOptionId, highlightedAlternativeOptionId]);
  const options = (plan.options ?? []).map(option => ({ ...pick(option, CONVERSATION_OPTION_KEYS), roles: option.roles ?? [],
    reason: [...option.reason].length > 160 ? [...option.reason].slice(0, 159).join("").trimEnd() + "…" : option.reason }));
  return { ...base, responseView: "conversation", ...pick(plan, ["summary", "operationalDecision", "nextActions", "purchaseRequiredNow", "nextReplenishmentDay", "shippingMinor", "estimatedOrderTotalMinor", "questions", "pollAfterSeconds", "searchSummary", "refreshRequired", "sourceContractVersion", "reasonCode", "suggestedGroups", "unsupportedTargets", "evidenceHandle", "alternativeSearch"]), selectedOptionId, highlightedAlternativeOptionId, options, advice, planAdviceIds, availableDetails: options.length || planAdviceIds.length ? availableDetails : [] };
}
