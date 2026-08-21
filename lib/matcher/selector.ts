import {
  COVERED_THRESHOLD,
  DEFAULT_MATCHER_CONFIG,
  MATERIAL_COVERAGE_POINTS,
  MATERIAL_PILL_DELTA,
  MATERIAL_PRICE_MINOR
} from "@/lib/matcher/config";
import { aggregateCoverage, coverageUnits } from "@/lib/matcher/dominance";
import { reconstructVariants, revalidateState } from "@/lib/matcher/search";
import type {
  CanonicalRequest,
  MatcherConfig,
  ProductGroup,
  ScoredBasket,
  SearchState
} from "@/lib/matcher/types";

function coverageMap(
  request: CanonicalRequest,
  delivered: ReadonlyMap<string, bigint>
) {
  const map = new Map<string, number>();

  for (const target of request.targets) {
    map.set(
      target.subjectId,
      coverageUnits(delivered.get(target.subjectId) ?? BigInt(0), target.requested.units)
    );
  }

  return map;
}

export function scoreState(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  sellerId: string;
  state: SearchState;
}>): ScoredBasket | null {
  const validated = revalidateState(input.state, input.groups, input.request);

  if (!validated) {
    return null;
  }

  const productIds = [
    ...new Set(validated.variants.map((item) => item.productId))
  ].sort();

  return {
    aggregateCoverage: aggregateCoverage(input.request, input.state.delivered),
    coverageBySubject: coverageMap(input.request, input.state.delivered),
    dailyPills: input.state.pills,
    exposure: validated.exposure,
    priceMinor: input.state.price,
    productCount: input.state.count,
    productIds,
    reason: "Highest-coverage feasible stack",
    safety: validated.safety,
    sellerId: input.sellerId,
    variantIds: input.state.selectedVariantIds
  };
}

function compareDefault(left: ScoredBasket, right: ScoredBasket) {
  if (right.aggregateCoverage !== left.aggregateCoverage) {
    return right.aggregateCoverage - left.aggregateCoverage;
  }

  if (left.priceMinor !== right.priceMinor) {
    return left.priceMinor - right.priceMinor;
  }

  if (left.dailyPills !== right.dailyPills) {
    return left.dailyPills - right.dailyPills;
  }

  if (left.productCount !== right.productCount) {
    return left.productCount - right.productCount;
  }

  return left.productIds.join("|").localeCompare(right.productIds.join("|"));
}

export function materiallyDifferent(left: ScoredBasket, right: ScoredBasket) {
  if (left.productIds.join("|") === right.productIds.join("|")) {
    return false;
  }

  return (
    Math.abs(left.aggregateCoverage - right.aggregateCoverage) >=
      MATERIAL_COVERAGE_POINTS * 100 ||
    Math.abs(left.priceMinor - right.priceMinor) >= MATERIAL_PRICE_MINOR ||
    Math.abs(left.dailyPills - right.dailyPills) >= MATERIAL_PILL_DELTA ||
    left.productCount !== right.productCount
  );
}

function coverageFloor(best: ScoredBasket, config: MatcherConfig) {
  return Math.round((best.aggregateCoverage * config.usefulCoverageFloor) / 100);
}

export function selectOptions(input: Readonly<{
  baskets: readonly ScoredBasket[];
  config?: MatcherConfig;
  request: CanonicalRequest;
}>) {
  const config = input.config ?? DEFAULT_MATCHER_CONFIG;
  const ranked = [...input.baskets].sort(compareDefault);
  const best = ranked[0] ?? null;

  if (!best) {
    return { alternatives: [] as ScoredBasket[], selected: null };
  }

  const selected: ScoredBasket = {
    ...best,
    reason: "Highest-coverage feasible stack"
  };

  if (input.request.selectorMode === "web_single") {
    return { alternatives: [], selected };
  }

  if (input.request.optimization === "lowest_cost") {
    const floor = coverageFloor(best, config);
    const cheap = [...input.baskets]
      .filter((item) => item.aggregateCoverage >= floor)
      .sort(
        (left, right) =>
          left.priceMinor - right.priceMinor || compareDefault(left, right)
      )[0];

    if (cheap) {
      return {
        alternatives: [],
        selected: { ...cheap, reason: "Lowest-cost stack meeting coverage floor" }
      };
    }
  }

  if (input.request.optimization === "fewest_pills") {
    const floor = coverageFloor(best, config);
    const compact = [...input.baskets]
      .filter((item) => item.aggregateCoverage >= floor)
      .sort(
        (left, right) =>
          left.dailyPills - right.dailyPills || compareDefault(left, right)
      )[0];

    if (compact) {
      return {
        alternatives: [],
        selected: { ...compact, reason: "Fewer daily pills" }
      };
    }
  }

  const alternatives: ScoredBasket[] = [];
  const floor = coverageFloor(selected, config);
  const cheap = [...input.baskets]
    .filter(
      (item) =>
        item.aggregateCoverage >= floor &&
        materiallyDifferent(selected, item) &&
        item.priceMinor < selected.priceMinor
    )
    .sort((left, right) => left.priceMinor - right.priceMinor)[0];

  if (cheap) {
    alternatives.push({
      ...cheap,
      reason:
        cheap.aggregateCoverage >= COVERED_THRESHOLD * 100
          ? "Lower-cost complete stack"
          : "Lower-cost incomplete stack"
    });
  }

  const compact = [...input.baskets]
    .filter(
      (item) =>
        item.aggregateCoverage >= floor &&
        materiallyDifferent(selected, item) &&
        alternatives.every((alt) => materiallyDifferent(alt, item)) &&
        item.dailyPills < selected.dailyPills
    )
    .sort((left, right) => left.dailyPills - right.dailyPills)[0];

  if (compact && alternatives.length < 2) {
    alternatives.push({ ...compact, reason: "Fewer daily pills" });
  }

  return { alternatives: alternatives.slice(0, 2), selected };
}

export function groupProduct(
  groups: readonly ProductGroup[],
  productId: string
) {
  return groups.find((item) => item.productId === productId)?.product ?? null;
}

export function selectedProducts(
  groups: readonly ProductGroup[],
  basket: ScoredBasket
) {
  return reconstructVariants(groups, basket.variantIds)
    .map((variant) => groupProduct(groups, variant.productId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
