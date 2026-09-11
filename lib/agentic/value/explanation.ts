import { negotiateLocale } from "@/lib/agentic/i18n";
import type {
  CoverageRow,
  PlanExplanation,
  StackOption
} from "@/lib/agentic/plan/types";
import { operationalActionText, operationalDecision } from "@/lib/agentic/value/operational-decision";

export function buildExplanation(input: Readonly<{
  acknowledgementStatus: string;
  coverage: readonly CoverageRow[];
  locale: string;
  nextActions: readonly string[];
  option: StackOption;
  status: "blocked" | "needs_input" | "no_purchase" | "processing" | "ready";
}>): PlanExplanation {
  const coverage = input.option.coverage.length > 0 ? input.option.coverage : input.coverage;
  const omitted = coverage.filter((row) => row.status === "optional_omitted");
  const deferred = coverage.filter((row) => row.status === "conditional_deferred");
  const decision = operationalDecision({ status: input.status,
    hasQuestions: input.nextActions.includes("answer_questions"),
    hasSelectedOption: Boolean(input.option.basket.length),
    hasPurchaseOptions: input.nextActions.includes("review_options"),
    canRefine: input.nextActions.includes("change_request"),
    replenishesLater: input.nextActions.includes("replenish_later"),
    purchaseRequiredNow: !input.nextActions.includes("replenish_later") });
  const nextActionKey = `plan.next_action.${decision.nextAction}`;
  const locale = negotiateLocale(input.locale);

  return {
    administrations: input.option.burden?.administrations ?? 0,
    cash30DayMinor: input.option.economics?.cash30DayMinor ?? null,
    cash90DayMinor:
      input.option.economics?.cash90DayMinor ?? input.option.cash90DayMinor ?? null,
    conditionalDeferrals: deferred.map((row) => ({
      nextAction: row.nextAction ?? null,
      reasonCode: row.reasonCode ?? null,
      status: row.status,
      supplementId: row.supplementId
    })),
    firstOrderCashMinor: input.option.economics?.cashTotalMinor ?? null,
    nextAction: operationalActionText(decision, locale),
    nextActionKey,
    optionalOmissions: omitted.map((row) => ({
      status: row.status,
      supplementId: row.supplementId
    })),
    pills: input.option.basket.some(item => item.pillCountKnown === false) ? null : input.option.burden?.pills ?? 0,
    productCount:
      input.option.burden?.productCount ??
      input.option.basket.length + (input.option.retainedCurrent?.length ?? 0),
    purchases: input.option.basket.map((item) => ({
      lineTotalMinor: item.lineTotalMinor,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity
    })),
    recommendedCandidateKey: input.option.candidateKey,
    retainedCurrent: input.option.retainedCurrent ?? [],
    safetyState: "advisory",
    savings90DayMinor: input.option.economics?.savings90DayMinor ?? null
  };
}
