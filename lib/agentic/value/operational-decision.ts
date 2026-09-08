import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { PlanResult } from "@/lib/agentic/plan/types";
import { continuedIntakeCoversTargets } from "@/lib/agentic/value/customer-choice";
import { matchingExplanationFor } from "@/lib/agentic/value/matching-explanation";

export type OperationalNextAction = "review_options" | "poll_plan" | "answer_questions" | "change_request" | "confirm_with_user" | "replenish_later" | "no_purchase" | "split_request";

export type OperationalDecision = Readonly<{
  status: PlanResult["status"];
  nextAction: OperationalNextAction;
  purchaseEligible: boolean;
}>;

/** Shared by the lightweight status reader and the full result mapper. */
export function planOperationalContext(result: Pick<PlanResult, "selected" | "alternatives" | "coverage" | "status" | "questions"> &
  Partial<Pick<PlanResult, "breadth" | "horizon" | "matchingDiagnostics" | "searchSummary" | "requestSnapshot">>) {
  const empty = !result.selected?.basket.length;
  const continuedTargetsCovered = empty && continuedIntakeCoversTargets(result.coverage);
  const horizonUnavailable = result.horizon?.complete === false || Boolean(result.horizon?.durationUnknown);
  const replenishesLater = continuedTargetsCovered ? (result.horizon?.nextReplenishmentDay ?? 0) > 0 : !horizonUnavailable && Boolean(
    result.horizon?.orders.some(item => item.day > 0 && item.day < 90) ||
    (typeof result.horizon?.nextReplenishmentDay === "number" && result.horizon.nextReplenishmentDay > 0 && result.horizon.nextReplenishmentDay < 90));
  const hasPurchaseOptions = result.alternatives.some(option => option.basket.length > 0 && option.purchaseEligible !== false);
  const tooBroad = result.breadth?.reasonCode === "request_too_broad";
  const matchingExplanation = matchingExplanationFor({ diagnostics: result.matchingDiagnostics, empty, hasPurchaseOptions,
    canExpand: result.searchSummary?.canExpand, durationUnknown: result.horizon?.durationUnknown,
    hasUnmetTargets: result.coverage.some(row => row.remainingGap > 0 || row.unresolved), locale: result.requestSnapshot?.locale });
  const decision = operationalDecision({ continuedTargetsCovered, canRefine: matchingExplanation?.recoveryActions.includes("refine_request"),
    status: result.status, hasSelectedOption: !empty, hasPurchaseOptions, hasQuestions: result.questions.length > 0,
    purchaseRequiredNow: result.horizon?.purchaseRequiredNow, replenishesLater, tooBroad });
  return { decision, matchingExplanation, tooBroad };
}

/** Health findings never change this projection. Ready means operationally ready. */
export function operationalDecision(input: Readonly<{
  status: PlanResult["status"];
  hasSelectedOption?: boolean;
  hasPurchaseOptions?: boolean;
  hasQuestions?: boolean;
  purchaseRequiredNow?: boolean;
  replenishesLater?: boolean;
  tooBroad?: boolean;
  canRefine?: boolean;
  continuedTargetsCovered?: boolean;
}>): OperationalDecision {
  const scheduledForLater = input.purchaseRequiredNow === false && input.replenishesLater;
  const status = input.continuedTargetsCovered && input.hasSelectedOption === false && ["ready", "no_purchase"].includes(input.status) ? "no_purchase" : input.status === "ready" && input.hasSelectedOption === false && !scheduledForLater
    ? "no_purchase" : input.status;
  const nextAction: OperationalNextAction = status === "processing" ? "poll_plan"
    : input.tooBroad ? "split_request"
    : status === "blocked" ? "change_request"
    : status === "needs_input" ? input.hasQuestions === false ? "change_request" : "answer_questions"
    : status === "no_purchase" && input.continuedTargetsCovered ? input.replenishesLater ? "replenish_later" : "no_purchase"
    : status === "no_purchase" && input.hasPurchaseOptions ? "review_options"
    : status === "no_purchase" && input.canRefine ? "change_request"
    : status === "no_purchase" ? input.replenishesLater ? "replenish_later" : "no_purchase"
    : input.purchaseRequiredNow === false && input.replenishesLater ? "replenish_later"
    : "confirm_with_user";
  return { status, nextAction, purchaseEligible: status === "ready" && input.hasSelectedOption !== false };
}

export function operationalActionText(decision: OperationalDecision, localeInput?: string) {
  const locale = negotiateLocale(localeInput);
  return agenticMessage(locale, `plan.next_action.${decision.nextAction}`);
}
