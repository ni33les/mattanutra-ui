import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { PlanResult } from "@/lib/agentic/plan/types";

export type OperationalNextAction = "review_options" | "poll_plan" | "answer_questions" | "change_request" | "confirm_with_user" | "replenish_later" | "no_purchase" | "split_request";

export type OperationalDecision = Readonly<{
  status: PlanResult["status"];
  nextAction: OperationalNextAction;
  purchaseEligible: boolean;
}>;

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
}>): OperationalDecision {
  const scheduledForLater = input.purchaseRequiredNow === false && input.replenishesLater;
  const status = input.status === "ready" && input.hasSelectedOption === false && !scheduledForLater
    ? "no_purchase" : input.status;
  const nextAction: OperationalNextAction = status === "processing" ? "poll_plan"
    : input.tooBroad ? "split_request"
    : status === "blocked" ? "change_request"
    : status === "needs_input" ? input.hasQuestions === false ? "change_request" : "answer_questions"
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
