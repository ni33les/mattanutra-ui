import { COVERAGE_SCALE } from "@/lib/matcher/config";
import { isDoseError, minUnits, scaleAmount } from "@/lib/matcher/dose";
import { knownTargetExposure, targetBasis } from "@/lib/matcher/target-basis";
import type { CanonicalRequest, SearchState } from "@/lib/matcher/types";

function isDeferredConditional(target: CanonicalRequest["targets"][number]) {
  return (
    target.importance === "conditional" &&
    target.prerequisite?.status !== "satisfied"
  );
}

export function cappedDelivered(
  delivered: bigint,
  requested: bigint
) {
  return minUnits(delivered, requested);
}

export function coverageUnits(
  delivered: bigint,
  requested: bigint
) {
  if (requested <= BigInt(0)) {
    return 0;
  }

  const capped = cappedDelivered(delivered, requested);
  return Number((capped * BigInt(COVERAGE_SCALE)) / requested);
}

export function aggregateCoverage(
  request: CanonicalRequest,
  delivered: ReadonlyMap<string, bigint>
) {
  const targets = request.targets.filter((target) => !isDeferredConditional(target));

  if (targets.length < 1) {
    return 0;
  }

  let total = 0;

  for (const target of targets) {
    total += coverageUnits(
      knownTargetExposure(request, target, delivered.get(target.subjectId) ?? BigInt(0)),
      target.requested.units
    );
  }

  return Math.round(total / targets.length);
}

export function oversupplyScore(
  request: CanonicalRequest,
  delivered: ReadonlyMap<string, bigint>
) {
  let total = 0;

  for (const target of request.targets) {
    const got = knownTargetExposure(request, target, delivered.get(target.subjectId) ?? BigInt(0));
    const want = target.requested.units;

    if (want <= BigInt(0) || got <= want) {
      continue;
    }

    total += Number(((got - want) * BigInt(COVERAGE_SCALE)) / want);
  }

  return total;
}

export function dominatesAtLayer(
  left: SearchState,
  right: SearchState,
  request: CanonicalRequest
) {
  if (left.nextGroupIndex !== right.nextGroupIndex) {
    return false;
  }

  if (left.price > right.price) {
    return false;
  }

  if (left.pills > right.pills) {
    return false;
  }

  if (left.count > right.count) {
    return false;
  }
  // Missing label facts are not evidence of a better basket.
  if ((left.unknownProductIds ?? []).some((id) => !(right.unknownProductIds ?? []).includes(id))) return false;
  // Retaining a product is an explicit customer constraint, even when another
  // listing delivers the same amounts for less money.
  for (const productId of request.retainProductIds) {
    const contains = (state: SearchState) => state.selectedProductIds?.includes(productId) ?? false;
    if (contains(right) && !contains(left)) return false;
  }
  for (const subjectId of request.retainSubjectIds) {
    if ((right.exposure.get(subjectId) ?? BigInt(0)) > BigInt(0) && (left.exposure.get(subjectId) ?? BigInt(0)) <= BigInt(0)) return false;
  }

  let strict = false;

  for (const target of request.targets) {
    const a = cappedDelivered(
      knownTargetExposure(request, target, left.delivered.get(target.subjectId) ?? BigInt(0)),
      target.requested.units
    );
    const b = cappedDelivered(
      knownTargetExposure(request, target, right.delivered.get(target.subjectId) ?? BigInt(0)),
      target.requested.units
    );

    if (a < b) {
      return false;
    }

    if (a > b) {
      strict = true;
    }
  }

  const subjects = new Set([...left.exposure.keys(), ...right.exposure.keys()]);

  for (const subjectId of subjects) {
    const a = left.exposure.get(subjectId) ?? BigInt(0);
    const b = right.exposure.get(subjectId) ?? BigInt(0);

    if (a > b) {
      return false;
    }

    if (a < b) {
      const target = request.targets.find((row) => row.subjectId === subjectId);
      if (target) {
        const lowerOffset = request.currentSupplements.filter((row) => row.subjectId === subjectId).reduce((sum, row) => {
          const minimum = scaleAmount({ amount: row.minimumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
          return sum + (isDoseError(minimum) ? row.daily.units : minimum.units) - row.daily.units;
        }, BigInt(0));
        // A nominally covered uncertain target may still be under target at the
        // lower endpoint. Keeping its larger dose can improve the worst case.
        const dietaryMinimum = targetBasis(target) === "total_daily" ? (request.dietaryIntake ?? []).filter(row => row.subjectId === subjectId).reduce((sum, row) => {
          const minimum = scaleAmount({ amount: row.minimumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
          return sum + (isDoseError(minimum) ? row.daily.units : minimum.units);
        }, BigInt(0)) : BigInt(0);
        if (a + lowerOffset + dietaryMinimum < target.requested.units) return false;
      }
      strict = true;
    }
  }

  if (left.price < right.price || left.pills < right.pills || left.count < right.count) {
    strict = true;
  }

  return strict;
}

export function paretoPrune(
  states: readonly SearchState[],
  request: CanonicalRequest
) {
  return states.filter(
    (candidate, index) =>
      !states.some(
        (other, otherIndex) =>
          otherIndex !== index && dominatesAtLayer(other, candidate, request)
      )
  );
}

export function fingerprintState(state: SearchState) {
  return [
    state.nextGroupIndex,
    ...state.selectedVariantIds,
    state.price,
    state.pills,
    state.count
  ].join("|");
}
