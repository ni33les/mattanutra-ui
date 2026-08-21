import { safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import { scaleAmount } from "@/lib/matcher/dose";
import type { MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

export function upperLimitAmount(
  name: string,
  unit: string,
  input: Readonly<{
    ceilings?: readonly SafetyCeiling[];
    subjectId: string;
  }>
): number | null {
  const ceiling = safetyCeilingFor(input.ceilings ?? [], {
    name,
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

  return Number(scaled.units / asRequested.units);
}
