import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  PlanResult,
  StackOption
} from "@/lib/agentic/plan/types";

export type PublicBasketItem = Readonly<{
  currency: "THB";
  dailyPills: number;
  form: string;
  lineTotalMinor: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
}>;

export function publicBasketItem(item: BasketItem): PublicBasketItem {
  return {
    currency: "THB",
    dailyPills: item.dailyPills,
    form: item.form,
    lineTotalMinor: item.lineTotalMinor,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor
  };
}

export function publicCoverage(row: CoverageRow) {
  return {
    coveragePercent: row.coveragePercent,
    currentAmount: row.currentAmount,
    deliveredAmount: row.deliveredAmount,
    name: row.name,
    requestedAmount: row.requestedAmount,
    status: row.status,
    supplementId: row.supplementId,
    totalExposureAmount: row.totalExposureAmount,
    unit: row.unit,
    ...(row.upperLimitAmount != null
      ? {
          percentOfUpperLimit: row.percentOfUpperLimit,
          upperLimitAmount: row.upperLimitAmount
        }
      : {})
  };
}

export function publicOption(option: StackOption) {
  return {
    basket: option.basket.map(publicBasketItem),
    coverage: option.coverage.map(publicCoverage),
    coveragePercent: option.coveragePercent,
    dailyPills: option.dailyPills,
    optionId: option.optionId,
    reason: option.reason,
    totalPriceMinor: option.totalPriceMinor
  };
}

export function publicQuestions(
  questions: PlanResult["questions"]
) {
  return questions.map((question) => ({
    choices: question.choices.map((choice) => ({
      choice: choice.choice,
      label: choice.label
    })),
    prompt: question.prompt,
    promptKey: question.promptKey,
    questionId: question.questionId
  }));
}

export function publicRequestSnapshot(state: CanonicalPlanState) {
  return {
    currency: state.currency,
    destinationCountry: state.destinationCountry,
    locale: state.locale,
    optimization: state.optimization,
    profile: state.profile,
    requirements: state.requirements,
    targets: state.targets.map((item) => ({
      amount: item.amount,
      name: item.name,
      supplementId: item.supplementId,
      unit: item.unit
    })),
    ...(state.currentSupplements.length > 0
      ? { currentSupplements: state.currentSupplements }
      : {}),
    ...(state.medicationCodes.length > 0
      ? { medicationCodes: state.medicationCodes }
      : {}),
    ...(state.conditionCodes.length > 0
      ? { conditionCodes: state.conditionCodes }
      : {}),
    ...(state.acceptedGaps.length > 0 ? { acceptedGaps: state.acceptedGaps } : {}),
    ...(state.safetyAcknowledgement
      ? { safetyAcknowledgement: state.safetyAcknowledgement }
      : {})
  };
}

export function publicPlanFields(result: Pick<
  PlanResult,
  | "alternatives"
  | "availabilityAsOf"
  | "basket"
  | "catalogueVersion"
  | "changeSummary"
  | "coverage"
  | "guidanceRulesVersion"
  | "questions"
  | "requestSnapshot"
  | "safetyGuidance"
  | "selected"
  | "status"
  | "summary"
  | "unmetRequirements"
>) {
  return {
    availabilityAsOf: result.availabilityAsOf,
    basket: result.basket.map(publicBasketItem),
    catalogueVersion: result.catalogueVersion,
    coverage: result.coverage.map(publicCoverage),
    guidanceRulesVersion: result.guidanceRulesVersion,
    requestSnapshot: publicRequestSnapshot(result.requestSnapshot),
    status: result.status,
    summary: result.summary,
    ...(result.selected ? { optionId: result.selected.optionId } : {}),
    ...(result.changeSummary.length > 0
      ? { changeSummary: result.changeSummary }
      : {}),
    ...(result.questions.length > 0
      ? { questions: publicQuestions(result.questions) }
      : {}),
    ...(result.safetyGuidance.length > 0
      ? { safetyGuidance: result.safetyGuidance }
      : {}),
    ...(result.unmetRequirements.length > 0
      ? { unmetRequirements: result.unmetRequirements }
      : {}),
    ...(result.alternatives.length > 0
      ? { alternatives: result.alternatives.map(publicOption) }
      : {})
  };
}

export function publicFrozenItems(items: readonly BasketItem[]) {
  return items.map(publicBasketItem);
}
