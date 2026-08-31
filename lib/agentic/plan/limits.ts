import {
  safetyCeilingFor,
  type SafetyProfile
} from "@/lib/matcher/safety-ceilings";
import { scaleAmount } from "@/lib/matcher/dose";
import type { MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

export function amountExceedsCeiling(amount: number, limit: number | null) {
  return limit != null && Number.isFinite(limit) && amount > limit;
}

export function upperLimitAmount(
  name: string,
  unit: string,
  input: Readonly<{
    ceilings?: readonly SafetyCeiling[];
    conditionCodes?: readonly string[] | null;
    profile?: SafetyProfile | null;
    subjectId: string;
  }>
): number | null {
  const ceiling = safetyCeilingFor(input.ceilings ?? [], {
    conditionCodes: input.conditionCodes,
    name,
    profile: input.profile,
    subjectId: input.subjectId
  });

  if (!ceiling) {
    return null;
  }

  if (ceiling.maxUnit === unit) {
    return ceiling.maxAmount;
  }

  const scaled = scaleAmount({
    amount: ceiling.maxAmount,
    subjectId: input.subjectId,
    subjectName: name,
    unit: ceiling.maxUnit
  });

  if ("reason" in scaled) {
    return null;
  }

  const asRequested = scaleAmount({
    amount: 1,
    subjectId: input.subjectId,
    subjectName: name,
    unit: unit as MatcherUnit
  });

  if ("reason" in asRequested) {
    return null;
  }

  if (asRequested.units === BigInt(0)) {
    return null;
  }

  const ratio = Number(scaled.units) / Number(asRequested.units);

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }

  return Math.round(ratio * 1_000_000) / 1_000_000;
}
