import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import type { CanonicalPlanStamp, StackOption } from "@/lib/agentic/plan/types";
import { canonicalHash, canonicalJson } from "@/lib/agentic/value/canonical";
import { amountFromScaled, scaleAmount } from "@/lib/matcher/dose";
import type { MatcherUnit } from "@/lib/matcher/types";

export const CUSTOMER_VALUE_PACK_VERSION = "dev-customer-value-v1.0";
export const CANONICAL_PLAN_VERSION = "cv-1.4";

function canonicalContributors(
  items: readonly Readonly<{
    amount?: number | null;
    productId?: string | null;
    productName?: string | null;
    source?: string | null;
    unit?: string | null;
  }>[]
) {
  return [...items]
    .map((item) => ({
      amount: item.amount ?? null,
      productId: item.productId ?? null,
      productName: item.productName ?? null,
      source: item.source ?? null,
      unit: item.unit ?? null
    }))
    .sort(
      (left, right) =>
        String(left.source).localeCompare(String(right.source)) ||
        String(left.productId).localeCompare(String(right.productId)) ||
        String(left.productName).localeCompare(String(right.productName)) ||
        Number(left.amount) - Number(right.amount)
    );
}

function canonicalComparator(row: Readonly<{
  action?: string | null;
  comparator?: string | null;
}>) {
  if (typeof row.comparator === "string" && row.comparator.length > 0) {
    return row.comparator;
  }
  if (row.action === "block") {
    return "gt";
  }
  if (row.action === "acknowledge") {
    return "gte";
  }
  return "lt";
}

function canonicalMassUnit(unit: string | null | undefined): MatcherUnit | null {
  if (unit === "g" || unit === "mg" || unit === "mcg") {
    return "mg";
  }
  return (unit as MatcherUnit | undefined) ?? null;
}

function canonicalAmount(
  amount: number | null | undefined,
  unit: string | null | undefined,
  name: string,
  supplementId: string
) {
  if (amount == null || !unit) {
    return { amount: amount ?? null, unit: unit ?? null };
  }
  const targetUnit = canonicalMassUnit(unit) ?? (unit as MatcherUnit);
  const scaled = scaleAmount({
    amount,
    subjectId: supplementId,
    subjectName: name,
    unit: unit as MatcherUnit
  });
  if ("reason" in scaled) {
    return { amount, unit };
  }
  return {
    amount: amountFromScaled(scaled, targetUnit, name) ?? amount,
    unit: targetUnit
  };
}

function canonicalCoverageRow(row: StackOption["coverage"][number]) {
  const requested = canonicalAmount(
    row.requestedAmount,
    row.unit,
    row.name,
    row.supplementId
  );
  const current = canonicalAmount(
    row.currentAmount,
    row.unit,
    row.name,
    row.supplementId
  );
  const exposure = canonicalAmount(
    row.totalExposureAmount,
    row.unit,
    row.name,
    row.supplementId
  );
  return {
    contributors: canonicalContributors(row.contributors ?? []).map((item) => {
      const dose = canonicalAmount(
        item.amount,
        item.unit,
        row.name,
        row.supplementId
      );
      return { ...item, amount: dose.amount, unit: dose.unit };
    }),
    currentAmount: current.amount,
    population: row.populationScope ?? null,
    requestedAmount: requested.amount,
    ruleId: row.ruleId ?? null,
    rulesVersion: row.rulesVersion ?? null,
    status: row.status,
    supplementId: row.supplementId,
    threshold: row.upperLimitAmount ?? null,
    totalExposureAmount: exposure.amount,
    unit: requested.unit
  };
}

function canonicalSafetyRow(row: Readonly<{
  action: string;
  code: string;
  comparator?: string | null;
  contributors?: readonly Readonly<{
    amount?: number | null;
    productId?: string | null;
    productName?: string | null;
    source?: string | null;
    unit?: string | null;
  }>[];
  exposure?: number | null;
  nutrientName?: string | null;
  population?: string | null;
  populationScope?: string | null;
  ruleId?: string | null;
  rulesVersion?: string | null;
  severity?: string | null;
  supplementIds?: readonly string[];
  threshold?: number | null;
  unit?: string | null;
}>) {
  return {
    action: row.action,
    code: row.code,
    comparator: canonicalComparator(row),
    contributors: canonicalContributors(row.contributors ?? []),
    exposure: row.exposure ?? null,
    nutrientName: row.nutrientName ?? null,
    population: row.population ?? row.populationScope ?? null,
    ruleId: row.ruleId ?? null,
    rulesVersion: row.rulesVersion ?? null,
    severity: row.severity ?? null,
    supplementIds: [...(row.supplementIds ?? [])].slice().sort(),
    threshold: row.threshold ?? null,
    unit: row.unit ?? null
  };
}

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
      .map(canonicalCoverageRow)
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
    safety: [...(option.safety?.guidance ?? [])]
      .map(canonicalSafetyRow)
      .sort(
        (left, right) =>
          String(left.ruleId).localeCompare(String(right.ruleId)) ||
          left.code.localeCompare(right.code) ||
          left.action.localeCompare(right.action)
      ),
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
  safetyGuidance: readonly Readonly<{
    action: string;
    code: string;
    comparator?: string | null;
    contributors?: readonly Readonly<{
      amount?: number | null;
      productId?: string | null;
      productName?: string | null;
      source?: string | null;
      unit?: string | null;
    }>[];
    exposure?: number | null;
    nutrientName?: string | null;
    population?: string | null;
    populationScope?: string | null;
    ruleId?: string | null;
    rulesVersion?: string | null;
    severity?: string | null;
    supplementIds?: readonly string[];
    threshold?: number | null;
    unit?: string | null;
  }>[];
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
      .map(canonicalSafetyRow)
      .sort(
        (left, right) =>
          String(left.ruleId).localeCompare(String(right.ruleId)) ||
          left.code.localeCompare(right.code) ||
          left.action.localeCompare(right.action)
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
