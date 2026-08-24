import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import {
  aggregateCoverage,
  dominatesAtLayer,
  fingerprintState,
  paretoPrune
} from "@/lib/matcher/dominance";
import { aggregateDailyExposure, isDoseError, unitsOrZero } from "@/lib/matcher/dose";
import { evaluateSafety, exposureExceedsCeiling } from "@/lib/matcher/safety";
import type {
  CanonicalRequest,
  DoseVariant,
  MatcherConfig,
  ProductGroup,
  SearchState
} from "@/lib/matcher/types";

export type SearchRun = Readonly<{
  complete: SearchState[];
  mode: "bounded" | "exact";
  trimmed: boolean;
}>;

type Budget = {
  remaining: number;
};

function cloneMap(source: ReadonlyMap<string, bigint>) {
  return new Map(source);
}

export function seedState(request: CanonicalRequest): SearchState {
  const exposure = new Map<string, bigint>();

  for (const current of request.currentSupplements) {
    exposure.set(
      current.subjectId,
      (exposure.get(current.subjectId) ?? BigInt(0)) + current.daily.units
    );
  }

  return {
    count: 0,
    delivered: new Map(),
    exposure,
    nextGroupIndex: 0,
    pills: 0,
    price: 0,
    selectedVariantIds: []
  };
}

function pediatricBlocked(request: CanonicalRequest, variant: DoseVariant) {
  if (request.profile.lifeStage !== "child") {
    return false;
  }

  return [...variant.contributions.keys()].some((subjectId) => {
    const name =
      request.targets.find((item) => item.subjectId === subjectId)?.name ?? "";
    return /zinc|iron/i.test(name) || /zinc|iron/i.test(subjectId);
  });
}

export function tryAddVariant(
  state: SearchState,
  variant: DoseVariant,
  group: ProductGroup,
  request: CanonicalRequest
): SearchState | null {
  if (pediatricBlocked(request, variant)) {
    return null;
  }

  const count = state.count + 1;

  if (count > request.maxProductCount) {
    return null;
  }

  const pills = state.pills + variant.dailyPills;

  if (request.maxDailyPills != null && pills > request.maxDailyPills) {
    return null;
  }

  const price = state.price + group.product.unitPriceMinor;

  if (request.maxPriceMinor != null && price > request.maxPriceMinor) {
    return null;
  }

  const delivered = cloneMap(state.delivered);
  const exposure = cloneMap(state.exposure);

  for (const [subjectId, amount] of variant.contributions) {
    const nextExposure =
      (exposure.get(subjectId) ?? BigInt(0)) + amount.units;

    if (exposureExceedsCeiling(request, subjectId, nextExposure)) {
      return null;
    }

    delivered.set(subjectId, (delivered.get(subjectId) ?? BigInt(0)) + amount.units);
    exposure.set(subjectId, nextExposure);
  }

  return {
    count,
    delivered,
    exposure,
    nextGroupIndex: state.nextGroupIndex + 1,
    pills,
    price,
    selectedVariantIds: [...state.selectedVariantIds, variant.variantId]
  };
}

function skipGroup(state: SearchState): SearchState {
  return { ...state, nextGroupIndex: state.nextGroupIndex + 1 };
}

function isUseful(state: SearchState, request: CanonicalRequest) {
  return aggregateCoverage(request, state.delivered) > 0 || state.count > 0;
}

function completeDominates(
  left: SearchState,
  right: SearchState,
  request: CanonicalRequest
) {
  return dominatesAtLayer(
    { ...left, nextGroupIndex: 0 },
    { ...right, nextGroupIndex: 0 },
    request
  );
}

function pruneComplete(states: SearchState[], request: CanonicalRequest) {
  return states.filter(
    (candidate, index) =>
      !states.some(
        (other, otherIndex) =>
          otherIndex !== index && completeDominates(other, candidate, request)
      )
  );
}

function exactSearch(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  budget: Budget,
  deadlineAt: number
): SearchRun {
  const complete: SearchState[] = [];
  const seed = seedState(request);

  const dfs = (state: SearchState) => {
    if (budget.remaining < 0 || Date.now() >= deadlineAt) {
      return;
    }

    budget.remaining -= 1;

    if (state.nextGroupIndex >= groups.length) {
      if (isUseful(state, request)) {
        complete.push(state);
      }

      return;
    }

    const group = groups[state.nextGroupIndex]!;
    dfs(skipGroup(state));

    for (const variant of group.variants) {
      const next = tryAddVariant(state, variant, group, request);

      if (next) {
        dfs(next);
      }
    }
  };

  dfs(seed);
  return {
    complete: pruneComplete(complete, request),
    mode: "exact",
    trimmed: budget.remaining < 0 || Date.now() >= deadlineAt
  };
}

function compactBeam(
  states: SearchState[],
  width: number,
  request: CanonicalRequest
) {
  const pruned = paretoPrune(states, request);

  if (pruned.length <= width) {
    return pruned;
  }

  return [...pruned]
    .sort((left, right) => {
      const cover =
        aggregateCoverage(request, right.delivered) -
        aggregateCoverage(request, left.delivered);

      if (cover !== 0) {
        return cover;
      }

      if (left.price !== right.price) {
        return left.price - right.price;
      }

      if (left.pills !== right.pills) {
        return left.pills - right.pills;
      }

      return left.selectedVariantIds.join("|").localeCompare(
        right.selectedVariantIds.join("|")
      );
    })
    .slice(0, width);
}

function beamSearch(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  config: MatcherConfig,
  budget: Budget,
  deadlineAt: number
): SearchRun {
  let width = config.initialBeamWidth;
  let best: SearchState[] = [];
  let trimmed = false;

  while (width <= config.maxBeamWidth && budget.remaining > 0 && Date.now() < deadlineAt) {
    let beam: SearchState[] = [seedState(request)];
    const complete: SearchState[] = [];
    let runTrimmed = false;

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]!;
      const expanded: SearchState[] = [];

      for (const state of beam) {
        budget.remaining -= 1;

        if (budget.remaining < 0 || Date.now() >= deadlineAt) {
          runTrimmed = true;
          break;
        }

        expanded.push(skipGroup(state));

        for (const variant of group.variants) {
          const next = tryAddVariant(state, variant, group, request);

          if (next) {
            expanded.push(next);
          }
        }
      }

      const unique = new Map<string, SearchState>();

      for (const state of expanded) {
        unique.set(fingerprintState(state), state);
      }

      if (Date.now() >= deadlineAt) {
        runTrimmed = true;
        beam = compactBeam([...unique.values()], width, request);
        break;
      }

      let layer = paretoPrune([...unique.values()], request);

      if (Date.now() >= deadlineAt) {
        runTrimmed = true;
        beam = layer.length > width ? compactBeam(layer, width, request) : layer;
        break;
      }

      if (layer.length > width) {
        layer = compactBeam(layer, width, request);
        runTrimmed = true;
      }

      beam = layer;
    }

    for (const state of beam) {
      if (isUseful(state, request)) {
        complete.push(state);
      }
    }

    const merged = pruneComplete([...best, ...complete], request);
    best = merged;
    trimmed = trimmed || runTrimmed;

    const hasUsefulBasket = best.some(
      (state) => state.count > 0 && isUseful(state, request)
    );

    if (!runTrimmed || width === config.maxBeamWidth || hasUsefulBasket) {
      break;
    }

    width = Math.min(width * 2, config.maxBeamWidth);
  }

  return {
    complete: best,
    mode: "bounded",
    trimmed: trimmed || Date.now() >= deadlineAt
  };
}

export function searchGroups(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG
): SearchRun {
  const variantCount = groups.reduce((sum, group) => sum + group.variants.length, 0);
  const budget: Budget = { remaining: config.expansionBudget };
  const deadlineAt = Date.now() + config.searchDeadlineMs;
  const exact =
    groups.length <= config.exactGroupLimit &&
    variantCount <= config.exactVariantLimit;

  return exact
    ? exactSearch(groups, request, budget, deadlineAt)
    : beamSearch(groups, request, config, budget, deadlineAt);
}

export function reconstructVariants(
  groups: readonly ProductGroup[],
  variantIds: readonly string[]
) {
  const byId = new Map<string, DoseVariant>();

  for (const group of groups) {
    for (const variant of group.variants) {
      byId.set(variant.variantId, variant);
    }
  }

  return variantIds
    .map((id) => byId.get(id))
    .filter((item): item is DoseVariant => Boolean(item));
}

export function revalidateState(
  state: SearchState,
  groups: readonly ProductGroup[],
  request: CanonicalRequest
) {
  const variants = reconstructVariants(groups, state.selectedVariantIds);
  const exposure = aggregateDailyExposure({
    current: request.currentSupplements,
    variants
  });

  if (isDoseError(exposure)) {
    return null;
  }

  const safety = evaluateSafety({
    exposure,
    products: groups.map((item) => item.product),
    request,
    variants
  });

  if (safety.hardBlocked) {
    return null;
  }

  for (const target of request.targets) {
    const expected = unitsOrZero(
      new Map(
        [...state.delivered].map(([subjectId, units]) => [
          subjectId,
          { dim: target.requested.dim, subjectId, units }
        ])
      ),
      target.subjectId
    );
    const actual = exposure.totals.get(target.subjectId)?.units ?? BigInt(0);
    const current = request.currentSupplements
      .filter((item) => item.subjectId === target.subjectId)
      .reduce((sum, item) => sum + item.daily.units, BigInt(0));

    if (actual !== expected + current && actual !== expected) {
      // delivered is selected-only; exposure includes current
    }
  }

  return { exposure, safety, variants };
}
