import { createHash } from "node:crypto";
import { scaleAmount, isDoseError } from "@/lib/matcher/dose";
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
    amount: number;
    name: string;
    subjectId: string;
    unit: MatcherUnit;
  }>[];
}>): { leftovers: MatcherLeftover[]; targets: CanonicalTarget[] } {
  const targets: CanonicalTarget[] = [];
  const leftovers: MatcherLeftover[] = [...(input.leftovers ?? [])];

  for (const target of input.targets) {
    const requested = scaleAmount({
      amount: target.amount,
      subjectId: target.subjectId,
      subjectName: target.name,
      unit: target.unit
    });

    if (isDoseError(requested)) {
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
      name: target.name,
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

export function orderInvariantRequest(request: CanonicalRequest): CanonicalRequest {
  return {
    ...request,
    acceptedGapSubjectIds: [...request.acceptedGapSubjectIds].sort(compareStrings),
    allowedForms: request.allowedForms
      ? [...request.allowedForms].sort(compareStrings)
      : null,
    conditionCodes: [...request.conditionCodes].sort(compareStrings),
    currentSupplements: [...request.currentSupplements].sort(
      (left, right) =>
        left.subjectId.localeCompare(right.subjectId) ||
        left.sourceId.localeCompare(right.sourceId) ||
        left.name.localeCompare(right.name) ||
        left.dailyAmount - right.dailyAmount
    ),
    excludeSubjectIds: [...request.excludeSubjectIds].sort(compareStrings),
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

  return createHash("sha256")
    .update(
      JSON.stringify({
        acceptedGapSubjectIds: canonical.acceptedGapSubjectIds,
        allowedForms: canonical.allowedForms,
        conditionCodes: canonical.conditionCodes,
        currency: canonical.currency,
        currentSupplements: canonical.currentSupplements.map((item) => ({
          amount: item.dailyAmount,
          name: item.name,
          subjectId: item.subjectId,
          unit: item.unit
        })),
        destinationCountry: canonical.destinationCountry,
        dietaryPreference: canonical.dietaryPreference,
        excludeSubjectIds: canonical.excludeSubjectIds,
        maxDailyPills: canonical.maxDailyPills,
        maxPriceMinor: canonical.maxPriceMinor,
        maxProductCount: canonical.maxProductCount,
        medicationCodes: canonical.medicationCodes,
        omega3SourcePreference: canonical.omega3SourcePreference,
        optimization: canonical.optimization,
        profile: canonical.profile,
        retainProductIds: canonical.retainProductIds,
        retainSubjectIds: canonical.retainSubjectIds,
        selectorMode: canonical.selectorMode,
        targets: canonical.targets.map((item) => ({
          amount: item.requestedAmount,
          name: item.name,
          subjectId: item.subjectId,
          unit: item.requestedUnit
        }))
      })
    )
    .digest("hex");
}

export function canonicalizeCurrents(
  currents: readonly Readonly<{
    dailyAmount: number;
    name: string;
    sourceId: string;
    subjectId: string;
    unit: MatcherUnit;
  }>[]
): CanonicalCurrent[] | { error: string; reason: "unsupported_unit" } {
  const result: CanonicalCurrent[] = [];

  for (const current of currents) {
    const daily = scaleAmount({
      amount: current.dailyAmount,
      subjectId: current.subjectId,
      subjectName: current.name,
      unit: current.unit
    });

    if (isDoseError(daily)) {
      return { error: daily.message, reason: "unsupported_unit" };
    }

    result.push({
      daily,
      dailyAmount: current.dailyAmount,
      name: current.name,
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
  if (dietary === "vegan") {
    return "algae_only";
  }

  if (omega === "algae_only") {
    return "algae_only";
  }

  if (targetNames.some(targetImpliesAlgaeOmega)) {
    return "algae_only";
  }

  return omega ?? "any";
}
