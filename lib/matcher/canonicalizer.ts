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
}>): { leftovers: MatcherLeftover[]; targets: CanonicalTarget[] } | { error: string; reason: "unsupported_unit" } {
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
      if (requested.reason === "unsupported_unit") {
        return { error: requested.message, reason: "unsupported_unit" };
      }

      return { error: requested.message, reason: "unsupported_unit" };
    }

    targets.push({
      name: target.name,
      requested,
      requestedAmount: target.amount,
      requestedUnit: target.unit,
      subjectId: target.subjectId
    });
  }

  return { leftovers, targets };
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
