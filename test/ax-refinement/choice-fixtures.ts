import type { CoverageRow, StackOption } from "../../lib/agentic/plan/types.ts";
export function coverage(percent: number, id = "a", current = 0): CoverageRow {
  return { supplementId: id, name: id, requestedAmount: 100, currentAmount: current, deliveredAmount: percent - current,
    coveragePercent: Math.min(100, percent), remainingGap: Math.max(0, 100 - percent), totalExposureAmount: percent,
    status: current >= 100 ? "already_covered" : percent >= 100 ? "covered" : "partial", unit: "mg", intakeCertainty: "known",
    upperLimitAmount: null, percentOfUpperLimit: null };
}
export function choice(id: string, percentages: number[], pills: number | null = 1, price: number | null = 100, count = 1): StackOption {
  return { optionId: id, purchaseEligible: count > 0, basket: Array.from({ length: count }, (_, i) => ({
    availabilityAsOf: "2026-09-07T00:00:00Z", contributionSupplementIds: ["a"], currency: "THB", dailyPills: pills ?? 0,
    pillCountKnown: pills != null, deliveryWindow: null, fixture: true, form: "capsule", imageUrl: null, incidentalNutrientNames: [],
    incidentalNutrients: [], incompleteCommercialFacts: price == null, lineTotalMinor: price ?? 0, pillsPerServing: pills ?? 0,
    productId: `${id}-${i}`, productName: `${id}-${i}`, quantity: 1, requestedNutrientNames: ["a"], retailerSku: `${id}-${i}`,
    sellerId: "fixture", sellerName: "Fixture", servingsPerDay: 1, source: "fixture", stockStatus: "in_stock", unitPriceMinor: price ?? 0
  })), coverage: percentages.map((value, i) => coverage(value, String(i))),
    coveragePercent: percentages.reduce((sum, value) => sum + Math.min(100, value), 0) / percentages.length,
    dailyPills: pills ?? 0, totalPriceMinor: price ?? 0, matcherVersion: "fixture", snapshotId: "fixture", reason: "fixture" };
}
