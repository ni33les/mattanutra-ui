import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type {
  CoverageRow,
  PlanExplanation,
  StackOption
} from "@/lib/agentic/plan/types";

export function buildExplanation(input: Readonly<{
  acknowledgementStatus: string;
  coverage: readonly CoverageRow[];
  locale: string;
  nextActions: readonly string[];
  option: StackOption;
  status: string;
}>): PlanExplanation {
  const coverage = input.option.coverage.length > 0 ? input.option.coverage : input.coverage;
  const omitted = coverage.filter((row) => row.status === "optional_omitted");
  const deferred = coverage.filter((row) => row.status === "conditional_deferred");
  const deferredAction = deferred.find((row) => row.nextAction)?.nextAction ?? null;
  const nextActionKey = deferredAction
    ? "plan.explanation.conditional_next_action"
    : input.nextActions[0] === "answer_questions"
      ? "plan.explanation.answer_questions"
      : "plan.explanation.confirm_with_user";
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
    nextAction: deferredAction ?? agenticMessage(locale, nextActionKey),
    nextActionKey,
    optionalOmissions: omitted.map((row) => ({
      status: row.status,
      supplementId: row.supplementId
    })),
    pills: input.option.burden?.pills ?? 0,
    productCount:
      input.option.burden?.productCount ??
      input.option.basket.length + (input.option.retainedCurrent?.length ?? 0),
    purchases: input.option.basket.map((item) => ({
      lineTotalMinor: item.lineTotalMinor,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity
    })),
    recommendedOptionId: input.option.optionId,
    retainedCurrent: input.option.retainedCurrent ?? [],
    safetyState: input.acknowledgementStatus || input.status,
    savings90DayMinor:
      input.option.economics?.savingClaim === "none"
        ? null
        : input.option.economics?.savings90DayMinor ?? null
  };
}
