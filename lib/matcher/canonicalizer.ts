import { sha256Hex } from "@/lib/sha256";
import { resolvePracticalProfile } from "@/lib/matcher/practical-scoring";
import { scaleAmount, isDoseError } from "@/lib/matcher/dose";
import { DOSE_FIT_VERSION } from "@/lib/matcher/config";
import type {
  CanonicalCurrent,
  CanonicalRequest,
  CanonicalTarget,
  DietaryPreference,
  MatcherLeftover,
  MatcherUnit,
  OmegaPreference
} from "@/lib/matcher/types";

export function canonicalizeTargets(input: Readonly<{
  leftovers?: readonly MatcherLeftover[];
  targets: readonly Readonly<{
    basis?: CanonicalTarget["basis"];
    acceptableMaximum?: number;
    acceptableMinimum?: number;
    amount: number;
    importance?: CanonicalTarget["importance"];
    name: string;
    prerequisite?: CanonicalTarget["prerequisite"];
    subjectId: string;
    unit: MatcherUnit;
  }>[];
}>): { leftovers: MatcherLeftover[]; targets: CanonicalTarget[] } {
  const targets: CanonicalTarget[] = [];
  const leftovers: MatcherLeftover[] = [...(input.leftovers ?? [])];

  for (const target of input.targets) {
    if (target.acceptableMinimum != null && (!Number.isFinite(target.acceptableMinimum) || target.acceptableMinimum < 0 || target.acceptableMinimum > target.amount)) {
      throw new RangeError(`targets.${target.subjectId}.acceptableMinimum must be finite, nonnegative and no greater than target ${target.amount} ${target.unit}.`);
    }
    if (target.acceptableMaximum != null && (!Number.isFinite(target.acceptableMaximum) || target.acceptableMaximum < target.amount)) {
      throw new RangeError(`targets.${target.subjectId}.acceptableMaximum must be finite and at least target ${target.amount} ${target.unit}.`);
    }
    const requested = scaleAmount({
      amount: target.amount,
      subjectId: target.subjectId,
      subjectName: target.name,
      unit: target.unit
    });

    if (isDoseError(requested) || (target.amount > 0 && requested.units <= BigInt(0))) {
      leftovers.push({
        amount: target.amount,
        name: target.name,
        reason: "unsupported_unit_conversion",
        severity: "high",
        subjectId: target.subjectId,
        unit: target.unit
      });
      continue;
    }

    targets.push({
      ...(target.basis ? { basis: target.basis } : {}),
      ...(target.acceptableMaximum != null
        ? { acceptableMaximum: target.acceptableMaximum }
        : {}),
      ...(target.acceptableMinimum != null
        ? { acceptableMinimum: target.acceptableMinimum }
        : {}),
      importance: target.importance ?? "required",
      name: target.name,
      ...(target.prerequisite ? { prerequisite: target.prerequisite } : {}),
      requested,
      requestedAmount: target.amount,
      requestedUnit: target.unit,
      subjectId: target.subjectId
    });
  }

  targets.sort(compareCanonicalTargetOrder);
  return { leftovers, targets };
}

export function compareCanonicalTargetOrder(
  left: Readonly<{ name: string; requestedUnit?: string; subjectId: string; unit?: string }>,
  right: Readonly<{ name: string; requestedUnit?: string; subjectId: string; unit?: string }>
) {
  return (
    left.subjectId.localeCompare(right.subjectId) ||
    left.name.localeCompare(right.name) ||
    (left.requestedUnit ?? left.unit ?? "").localeCompare(
      right.requestedUnit ?? right.unit ?? ""
    )
  );
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right);
}

function compareCurrentOrder(left: CanonicalCurrent, right: CanonicalCurrent) {
  return left.subjectId.localeCompare(right.subjectId) || left.name.localeCompare(right.name) ||
    left.unit.localeCompare(right.unit) || left.dailyAmount - right.dailyAmount ||
    (left.minimumDailyAmount ?? left.dailyAmount) - (right.minimumDailyAmount ?? right.dailyAmount) ||
    (left.maximumDailyAmount ?? left.dailyAmount) - (right.maximumDailyAmount ?? right.dailyAmount) ||
    (left.productId ?? "").localeCompare(right.productId ?? "") ||
    (left.certainty ?? "known").localeCompare(right.certainty ?? "known") || left.sourceId.localeCompare(right.sourceId);
}

export function orderInvariantRequest(request: CanonicalRequest): CanonicalRequest {
  return {
    ...request,
    productDoses: [...(request.productDoses ?? [])].sort((a, b) => a.productId.localeCompare(b.productId)),
    acceptedGapSubjectIds: [...request.acceptedGapSubjectIds].sort(compareStrings),
    allowedForms: request.allowedForms
      ? [...request.allowedForms].sort(compareStrings)
      : null,
    conditionCodes: [...request.conditionCodes].sort(compareStrings),
    currentSupplements: [...request.currentSupplements].sort(compareCurrentOrder),
    excludeSubjectIds: [...request.excludeSubjectIds].sort(compareStrings),
    excludeProductIds: [...(request.excludeProductIds ?? [])].sort(compareStrings),
    unknownIntakeSubjectIds: [...(request.unknownIntakeSubjectIds ?? [])].sort(compareStrings),
    estimatedIntakeSubjectIds: [...(request.estimatedIntakeSubjectIds ?? [])].sort(compareStrings),
    dietaryIntake: [...(request.dietaryIntake ?? [])].sort(compareCurrentOrder),
    leftovers: [...request.leftovers].sort(
      (left, right) =>
        (left.subjectId ?? "").localeCompare(right.subjectId ?? "") ||
        left.reason.localeCompare(right.reason) ||
        left.name.localeCompare(right.name)
    ),
    medicationCodes: [...request.medicationCodes].sort(compareStrings),
    retainProductIds: [...request.retainProductIds].sort(compareStrings),
    retainSubjectIds: [...request.retainSubjectIds].sort(compareStrings),
    targets: [...request.targets].sort(compareCanonicalTargetOrder)
  };
}

export function canonicalTargetSetHash(request: CanonicalRequest): string {
  const canonical = orderInvariantRequest(request);

  return sha256Hex(
      JSON.stringify({
        acceptedGapSubjectIds: canonical.acceptedGapSubjectIds,
        allowedForms: canonical.allowedForms,
        conditionCodes: canonical.conditionCodes,
        currency: canonical.currency,
        currentSupplements: canonical.currentSupplements.map((item) => ({
          certainty: item.certainty,
          amount: item.dailyAmount,
          minimum: item.minimumDailyAmount,
          maximum: item.maximumDailyAmount,
          productId: item.productId,
          name: item.name,
          subjectId: item.subjectId,
          unit: item.unit
        })),
        destinationCountry: canonical.destinationCountry,
        dietaryPreference: canonical.dietaryPreference,
        excludeSubjectIds: canonical.excludeSubjectIds,
        excludeProductIds: canonical.excludeProductIds,
        unknownIntakeSubjectIds: canonical.unknownIntakeSubjectIds,
        estimatedIntakeSubjectIds: canonical.estimatedIntakeSubjectIds,
        dietaryIntake: canonical.dietaryIntake?.map((row) => ({ subjectId: row.subjectId, amount: row.dailyAmount, minimum: row.minimumDailyAmount, maximum: row.maximumDailyAmount, unit: row.unit, certainty: row.certainty })),
        profileKnown: canonical.profileKnown,
        doseFitVersion: DOSE_FIT_VERSION,
        productDoses: canonical.productDoses,
        searchEffort: canonical.searchEffort ?? "standard",
        maxDailyPills: canonical.maxDailyPills,
        maxPriceMinor: canonical.maxPriceMinor,
        maxProductCount: canonical.maxProductCount,
        medicationCodes: canonical.medicationCodes,
        omega3SourcePreference: canonical.omega3SourcePreference,
        optimization: canonical.optimization,
        scoringProfileHash: resolvePracticalProfile(canonical).hash,
        profile: canonical.profile,
        retainProductIds: canonical.retainProductIds,
        retainSubjectIds: canonical.retainSubjectIds,
        selectorMode: canonical.selectorMode,
        targets: canonical.targets.map((item) => ({
          basis: item.basis ?? "supplemental",
          amount: item.requestedAmount,
          acceptableMinimum: item.acceptableMinimum,
          acceptableMaximum: item.acceptableMaximum,
          importance: item.importance,
          prerequisite: item.prerequisite,
          name: item.name,
          subjectId: item.subjectId,
          unit: item.requestedUnit
        }))
      })
    );
}

export function canonicalizeCurrents(
  currents: readonly Readonly<{
    certainty?: "known" | "estimated" | "unknown";
    dailyAmount: number;
    minimumDailyAmount?: number;
    maximumDailyAmount?: number;
    daysRemaining?: number;
    name: string;
    productId?: string;
    sourceId: string;
    subjectId: string;
    unit: MatcherUnit;
  }>[]
): CanonicalCurrent[] | { error: string; reason: "unsupported_unit" } {
  const result: CanonicalCurrent[] = [];

  for (const current of currents) {
    const minimum = current.minimumDailyAmount ?? current.dailyAmount;
    const maximum = current.maximumDailyAmount ?? current.dailyAmount;
    if (![minimum, current.dailyAmount, maximum].every((value) => Number.isFinite(value) && value >= 0) ||
      minimum > current.dailyAmount || current.dailyAmount > maximum) {
      return { error: `Intake ${current.sourceId} must have finite, nonnegative minimum <= dailyAmount <= maximum.`, reason: "unsupported_unit" };
    }
    const daily = scaleAmount({
      amount: current.dailyAmount,
      subjectId: current.subjectId,
      subjectName: current.name,
      unit: current.unit
    });

    if (isDoseError(daily)) {
      return { error: daily.message, reason: "unsupported_unit" };
    }
    if (current.dailyAmount > 0 && daily.units <= BigInt(0)) {
      return { error: `Intake ${current.sourceId} is below the supported dose resolution.`, reason: "unsupported_unit" };
    }
    for (const amount of [minimum, maximum]) {
      const bound = scaleAmount({ amount, subjectId: current.subjectId, subjectName: current.name, unit: current.unit });
      if (isDoseError(bound)) return { error: bound.message, reason: "unsupported_unit" };
      if (amount > 0 && bound.units <= BigInt(0)) return { error: `Intake ${current.sourceId} bound is below the supported dose resolution.`, reason: "unsupported_unit" };
    }

    result.push({
      ...(current.certainty ? { certainty: current.certainty } : {}),
      daily,
      dailyAmount: current.dailyAmount,
      ...(current.minimumDailyAmount != null ? { minimumDailyAmount: current.minimumDailyAmount } : {}),
      ...(current.maximumDailyAmount != null ? { maximumDailyAmount: current.maximumDailyAmount } : {}),
      ...(current.daysRemaining != null ? { daysRemaining: current.daysRemaining } : {}),
      name: current.name,
      ...(current.productId ? { productId: current.productId } : {}),
      sourceId: current.sourceId,
      subjectId: current.subjectId,
      unit: current.unit
    });
  }

  return result;
}

const ALGAE_TARGET_NAME = /\balgae|\balgal\b/i;

export function targetImpliesAlgaeOmega(name: string) {
  return ALGAE_TARGET_NAME.test(name);
}

export function impliedOmegaPreference(
  dietary: DietaryPreference,
  omega: OmegaPreference | null | undefined,
  targetNames: readonly string[] = []
): OmegaPreference {
  // Keep the legacy helper signature for adapters, but source choice is now
  // explicit. Dietary eligibility is evaluated independently.
  void dietary; void targetNames;
  return omega ?? "any";
}
