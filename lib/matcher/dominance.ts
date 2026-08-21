import { COVERAGE_SCALE } from "@/lib/matcher/config";
import { minUnits } from "@/lib/matcher/dose";
import type { CanonicalRequest, SearchState } from "@/lib/matcher/types";

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
  if (request.targets.length < 1) {
    return 0;
  }

  let total = 0;

  for (const target of request.targets) {
    total += coverageUnits(
      delivered.get(target.subjectId) ?? BigInt(0),
      target.requested.units
    );
  }

  return Math.round(total / request.targets.length);
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

  let strict = false;

  for (const target of request.targets) {
    const a = cappedDelivered(
      left.delivered.get(target.subjectId) ?? BigInt(0),
      target.requested.units
    );
    const b = cappedDelivered(
      right.delivered.get(target.subjectId) ?? BigInt(0),
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
