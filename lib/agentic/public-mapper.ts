import type { BasketItem, CoverageRow, PlanResult, StackOption } from "@/lib/agentic/plan/types";

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
  | "status"
  | "summary"
  | "unmetRequirements"
>) {
  return {
    availabilityAsOf: result.availabilityAsOf,
    basket: result.basket.map(publicBasketItem),
    catalogueVersion: result.catalogueVersion,
    changeSummary: result.changeSummary,
    coverage: result.coverage.map(publicCoverage),
    guidanceRulesVersion: result.guidanceRulesVersion,
    questions: result.questions,
    requestSnapshot: result.requestSnapshot,
    safetyGuidance: result.safetyGuidance,
    status: result.status,
    summary: result.summary,
    unmetRequirements: result.unmetRequirements,
    alternatives: result.alternatives.map(publicOption)
  };
}

export function publicFrozenItems(items: readonly BasketItem[]) {
  return items.map(publicBasketItem);
}
