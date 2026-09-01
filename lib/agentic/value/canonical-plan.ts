import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import type { CanonicalPlanStamp, StackOption } from "@/lib/agentic/plan/types";
import { canonicalHash, canonicalJson } from "@/lib/agentic/value/canonical";

export const CUSTOMER_VALUE_PACK_VERSION = "dev-customer-value-v1.0";
export const CANONICAL_PLAN_VERSION = "cv-1.3";

function canonicalOptionValue(option: StackOption) {
  return {
    burden: {
      administrations: option.burden?.administrations ?? 0,
      pills: option.burden?.pills ?? 0,
      productCount: option.burden?.productCount ?? 0
    },
    cash30DayMinor: option.economics?.cash30DayMinor ?? null,
    cash90DayMinor: option.economics?.cash90DayMinor ?? option.cash90DayMinor ?? null,
    cashComplete: option.economics?.cashComplete ?? null,
    comparisonComplete: option.economics?.comparisonComplete ?? null,
    consumptionComplete: option.economics?.consumptionComplete ?? null,
    consumption90DayMinor: option.economics?.consumption90DayMinor ?? null,
    coverage: [...option.coverage]
      .map((row) => ({
        contributors: [...(row.contributors ?? [])]
          .map((item) => ({
            productId: item.productId ?? null,
            source: item.source ?? null
          }))
          .sort((left, right) =>
            String(left.productId).localeCompare(String(right.productId))
          ),
        status: row.status,
        supplementId: row.supplementId
      }))
      .sort((left, right) => left.supplementId.localeCompare(right.supplementId)),
    equivalent: option.economics?.equivalent ?? null,
    optionId: option.optionId,
    products: option.basket
      .map((item) => ({
        daysOfSupply: item.daysOfSupply ?? null,
        productId: item.productId,
        quantity: item.quantity,
        servingsPerPack: item.servingsPerPack ?? null
      }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
    recommended: Boolean(option.recommended),
    role: option.role ?? null,
    safetyCodes: [...(option.safety?.guidance ?? [])]
      .map((row) => row.code)
      .slice()
      .sort(),
    savingClaim: option.economics?.savingClaim ?? null,
    savings90DayMinor: option.economics?.savings90DayMinor ?? null,
    shippingMinor: option.economics?.shippingMinor ?? null
  };
}

export function canonicalPlanValue(input: Readonly<{
  inventoryDays?: readonly number[];
  leftovers: readonly unknown[];
  nextReplenishmentDay?: number | null;
  orders?: readonly Readonly<{
    day: number;
    lines?: readonly Readonly<{
      productId: string;
      quantity: number;
      unitPriceMinor: number;
    }>[];
    productIds: readonly string[];
    quantities: readonly number[];
    shippingMinor?: number;
    shippingRuleId?: string;
    totalMinor?: number;
    type?: string;
  }>[];
  options: readonly StackOption[];
  questions?: readonly Readonly<{ questionId: string }>[];
  reasonCode?: string | null;
  safetyGuidance: readonly Readonly<{ action: string; code: string }>[];
  selectedOptionId?: string | null;
  snapshotId?: string;
  status: string;
}>) {
  const selected =
    input.options.find((item) => item.optionId === input.selectedOptionId) ??
    input.options.find((item) => item.recommended) ??
    null;
  return {
    inventoryDays: [...(input.inventoryDays ?? [])].slice().sort((left, right) => left - right),
    leftovers: [...input.leftovers].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right))
    ),
    nextReplenishmentDay: input.nextReplenishmentDay ?? null,
    orders: [...(input.orders ?? [])]
      .map((item) => ({
        day: item.day,
        lines: [...(item.lines ?? [])]
          .map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor
          }))
          .sort((left, right) => left.productId.localeCompare(right.productId)),
        productIds: [...item.productIds].slice().sort(),
        quantities: [...item.quantities],
        shippingMinor: item.shippingMinor ?? null,
        shippingRuleId: item.shippingRuleId ?? null,
        totalMinor: item.totalMinor ?? null,
        type: item.type ?? null
      }))
      .sort((left, right) => left.day - right.day || left.productIds.join().localeCompare(right.productIds.join())),
    questions: [...(input.questions ?? [])].map((item) => item.questionId).slice().sort(),
    reasonCode: input.reasonCode ?? null,
    selected: selected ? canonicalOptionValue(selected) : null,
    selectedOptionId: input.selectedOptionId ?? selected?.optionId ?? null,
    snapshotId: input.snapshotId ?? "",
    safety: [...input.safetyGuidance]
      .map((row) => ({ action: row.action, code: row.code }))
      .sort(
        (left, right) =>
          left.code.localeCompare(right.code) || left.action.localeCompare(right.action)
      ),
    status: input.status
  };
}

export function buildCanonicalPlanStamp(input: Readonly<{
  inventoryDays?: readonly number[];
  leftovers: readonly unknown[];
  matcherVersion: string;
  nextReplenishmentDay?: number | null;
  orders?: readonly Readonly<{
    day: number;
    lines?: readonly Readonly<{
      productId: string;
      quantity: number;
      unitPriceMinor: number;
    }>[];
    productIds: readonly string[];
    quantities: readonly number[];
    shippingMinor?: number;
    shippingRuleId?: string;
    totalMinor?: number;
    type?: string;
  }>[];
  options: readonly StackOption[];
  questions?: readonly Readonly<{ questionId: string }>[];
  reasonCode?: string | null;
  safetyGuidance: readonly Readonly<{ action: string; code: string }>[];
  selectedOptionId?: string | null;
  snapshotId: string;
  status: string;
}>): CanonicalPlanStamp {
  const value = canonicalPlanValue(input);
  return {
    buildId:
      process.env.AGENTIC_BUILD_ID?.trim() ||
      process.env.COMMIT_SHA?.trim() ||
      process.env.COMMIT_HASH?.trim() ||
      `local-${AGENTIC_SERVICE_VERSION}`,
    canonicalVersion: CANONICAL_PLAN_VERSION,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    hash: canonicalHash(value),
    matcherVersion: input.matcherVersion,
    packVersion: CUSTOMER_VALUE_PACK_VERSION,
    snapshotId: input.snapshotId
  };
}
