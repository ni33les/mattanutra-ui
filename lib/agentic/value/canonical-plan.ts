import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import type { CanonicalPlanStamp, StackOption } from "@/lib/agentic/plan/types";
import { canonicalHash, canonicalJson } from "@/lib/agentic/value/canonical";
import { amountFromScaled, scaleAmount } from "@/lib/matcher/dose";
import type { MatcherUnit } from "@/lib/matcher/types";

export const CUSTOMER_VALUE_PACK_VERSION = "dev-customer-value-v4.0";
export const CANONICAL_PLAN_VERSION = "cv-4.0";

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

function canonicalComparator(row: Readonly<{ comparator?: string | null }>) {
  return typeof row.comparator === "string" && row.comparator.length > 0 ? row.comparator : null;
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
    requestedTargetId: row.requestedTargetId ?? null,
    unresolved: row.unresolved ?? false,
    intakeCertainty: row.intakeCertainty ?? "unknown",
    totalExposureComplete: row.totalExposureComplete ?? false,
    sourceScope: row.sourceScope ?? null,
    population: row.populationScope ?? null,
    requestedAmount: requested.amount,
    ruleId: row.ruleId ?? null,
    rulesVersion: row.rulesVersion ?? null,
    status: row.status,
    supplementId: row.supplementId,
    basis: row.basis ?? "supplemental",
    threshold: row.upperLimitAmount ?? null,
    totalExposureAmount: exposure.amount,
    unit: requested.unit
  };
}

function canonicalLeftover(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  if (!["g", "mg", "mcg"].includes(String(row.unit))) return value;
  // A weaker-SKU note can carry a unit without claiming a measured gap. Keep
  // that absence while canonicalizing the mass dimension of the annotation.
  if (row.amount == null) return { ...row, unit: "mg" };
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) return value;
  const dose = canonicalAmount(row.amount, String(row.unit), String(row.name ?? ""), String(row.supplementId ?? ""));
  return { ...row, amount: dose.amount, unit: dose.unit };
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
  authorityUrl?: string | null;
  uncertainty?: string;
  uncertaintyCodes?: readonly string[];
  referenceBasis?: string;
  evidence?: readonly string[];
  sourceScope?: string | null;
}>) {
  return {
    authorityUrl: row.authorityUrl ?? null,
    uncertaintyCodes: [...(row.uncertaintyCodes ?? (row.uncertainty ? ["legacy_uncertainty_present"] : []))].sort(),
    referenceBasis: row.referenceBasis ?? null,
    evidence: [...(row.evidence ?? [])].sort(),
    sourceScope: row.sourceScope ?? null,
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
    doseFit: option.doseFit ? {
      version: option.doseFit.version, limitWeight: option.doseFit.limitWeight,
      under: option.doseFit.under, over: option.doseFit.over, limit: option.doseFit.limit,
      weightedLimit: option.doseFit.weightedLimit, total: option.doseFit.total,
      unknownSubjectIds: [...option.doseFit.unknownSubjectIds].sort(),
      estimatedSubjectIds: [...option.doseFit.estimatedSubjectIds].sort(),
      perTarget: option.doseFit.perTarget.map(row => ({
        subjectId: row.subjectId, basis: row.basis ?? "supplemental", under: row.under, over: row.over, certainty: row.certainty,
        target: canonicalAmount(row.target, row.unit, row.name, row.subjectId),
        exposure: canonicalAmount(row.exposure, row.unit, row.name, row.subjectId),
        exposureMinimum: canonicalAmount(row.exposureMinimum, row.unit, row.name, row.subjectId),
        exposureMaximum: canonicalAmount(row.exposureMaximum, row.unit, row.name, row.subjectId)
      })).sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      perContinuedDose: (option.doseFit.perContinuedDose ?? []).map(row => ({
        subjectId: row.subjectId, referenceBasis: row.referenceBasis, over: row.over, certainty: row.certainty,
        sourceIds: [...row.sourceIds].sort(),
        referenceDose: canonicalAmount(row.referenceDose, row.unit, row.name, row.subjectId),
        exposure: canonicalAmount(row.exposure, row.unit, row.name, row.subjectId),
        exposureMinimum: canonicalAmount(row.exposureMinimum, row.unit, row.name, row.subjectId),
        exposureMaximum: canonicalAmount(row.exposureMaximum, row.unit, row.name, row.subjectId),
        conservativeExposure: canonicalAmount(row.conservativeExposure, row.unit, row.name, row.subjectId)
      })).sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      perLimit: option.doseFit.perLimit.map(row => ({
        subjectId: row.subjectId, excess: row.excess, certainty: row.certainty, ruleId: row.ruleId,
        sourceScope: row.sourceScope,
        limit: canonicalAmount(row.limit, row.unit, row.name, row.subjectId),
        exposure: canonicalAmount(row.exposure, row.unit, row.name, row.subjectId)
      })).sort((a, b) => a.subjectId.localeCompare(b.subjectId))
    } : null,
    comparisonBasis: option.economics?.comparisonBasis ? {
      ...option.economics.comparisonBasis,
      costHorizonsDays: [...option.economics.comparisonBasis.costHorizonsDays].sort((a, b) => a - b),
      currentInventory: [...option.economics.comparisonBasis.currentInventory].sort((a, b) => a.supplementId.localeCompare(b.supplementId) || String(a.productId).localeCompare(String(b.productId)) || Number(a.daysRemaining) - Number(b.daysRemaining))
    } : null,
    equivalent: option.economics?.equivalent ?? null,
    optionId: option.optionId,
    products: option.basket
      .map((item) => ({
        daysOfSupply: item.daysOfSupply ?? null,
        productId: item.productId,
        quantity: item.quantity,
        servingsPerDay: item.servingsPerDay,
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
    canonicalVersion: CANONICAL_PLAN_VERSION,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    inventoryDays: [...(input.inventoryDays ?? [])].slice().sort((left, right) => left - right),
    leftovers: input.leftovers.map(canonicalLeftover).sort((left, right) =>
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
