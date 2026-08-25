import {
  COVERED_THRESHOLD,
  DEFAULT_MATCHER_CONFIG,
  MATERIAL_COVERAGE_POINTS,
  MATERIAL_PILL_DELTA,
  MATERIAL_PRICE_MINOR
} from "@/lib/matcher/config";
import { contributionFor } from "@/lib/matcher/candidates";
import {
  aggregateCoverage,
  coverageUnits,
  oversupplyScore
} from "@/lib/matcher/dominance";
import { reconstructVariants, revalidateState } from "@/lib/matcher/search";
import type {
  CanonicalRequest,
  MatcherConfig,
  MatcherProduct,
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

function factCoversTarget(
  product: MatcherProduct,
  fact: MatcherProduct["labelledContributions"][number],
  request: CanonicalRequest
) {
  return request.targets.some((target) =>
    contributionFor(product, target.name, target.subjectId).includes(fact)
  );
}

export function incidentalNutrientCount(
  groups: readonly ProductGroup[],
  productIds: readonly string[],
  request: CanonicalRequest
) {
  const byId = new Map(groups.map((item) => [item.productId, item.product]));
  let count = 0;

  for (const productId of productIds) {
    const product = byId.get(productId);

    if (!product) {
      continue;
    }

    for (const fact of product.labelledContributions) {
      if (fact.amount == null || fact.amount <= 0) {
        continue;
      }

      if (!factCoversTarget(product, fact, request)) {
        count += 1;
      }
    }
  }

  return count;
}

function coveredTargetCount(
  request: CanonicalRequest,
  coverageBySubject: ReadonlyMap<string, number>
) {
  return request.targets.filter((target) =>
    (coverageBySubject.get(target.subjectId) ?? 0) >= COVERED_THRESHOLD * 100
  ).length;
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
  const coverageBySubject = coverageMap(input.request, input.state.delivered);

  return {
    aggregateCoverage: aggregateCoverage(input.request, input.state.delivered),
    coverageBySubject,
    coveredCount: coveredTargetCount(input.request, coverageBySubject),
    dailyPills: input.state.pills,
    exposure: validated.exposure,
    incidentalCount: incidentalNutrientCount(input.groups, productIds, input.request),
    oversupplyScore: oversupplyScore(input.request, input.state.delivered),
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

  if (right.coveredCount !== left.coveredCount) {
    return right.coveredCount - left.coveredCount;
  }

  if (left.incidentalCount !== right.incidentalCount) {
    return left.incidentalCount - right.incidentalCount;
  }

  if (left.oversupplyScore !== right.oversupplyScore) {
    return left.oversupplyScore - right.oversupplyScore;
  }

  if (left.productCount !== right.productCount) {
    return left.productCount - right.productCount;
  }

  if (left.dailyPills !== right.dailyPills) {
    return left.dailyPills - right.dailyPills;
  }

  if (left.priceMinor !== right.priceMinor) {
    return left.priceMinor - right.priceMinor;
  }

  return left.productIds.join("|").localeCompare(right.productIds.join("|"));
}

function compareWeb(left: ScoredBasket, right: ScoredBasket) {
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

function meetsCoverageFloor(
  item: ScoredBasket,
  best: ScoredBasket,
  config: MatcherConfig
) {
  return item.aggregateCoverage >= coverageFloor(best, config);
}

export function compareBaskets(
  left: ScoredBasket,
  right: ScoredBasket,
  request: CanonicalRequest,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG
) {
  if (request.selectorMode === "web_single") {
    return compareWeb(left, right);
  }

  const bestCoverage = Math.max(left.aggregateCoverage, right.aggregateCoverage);
  const probe: ScoredBasket = left.aggregateCoverage >= right.aggregateCoverage ? left : right;
  const floorBest = { ...probe, aggregateCoverage: bestCoverage };

  if (request.optimization === "fewest_pills") {
    const leftOk = meetsCoverageFloor(left, floorBest, config);
    const rightOk = meetsCoverageFloor(right, floorBest, config);

    if (leftOk !== rightOk) {
      return leftOk ? -1 : 1;
    }

    if (leftOk) {
      return (
        right.coveredCount - left.coveredCount ||
        left.dailyPills - right.dailyPills ||
        left.productCount - right.productCount ||
        left.priceMinor - right.priceMinor ||
        left.oversupplyScore - right.oversupplyScore ||
        left.incidentalCount - right.incidentalCount ||
        compareDefault(left, right)
      );
    }
  }

  if (request.optimization === "lowest_cost") {
    const leftOk = meetsCoverageFloor(left, floorBest, config);
    const rightOk = meetsCoverageFloor(right, floorBest, config);

    if (leftOk !== rightOk) {
      return leftOk ? -1 : 1;
    }

    if (leftOk) {
      return (
        right.coveredCount - left.coveredCount ||
        left.priceMinor - right.priceMinor ||
        left.dailyPills - right.dailyPills ||
        left.productCount - right.productCount ||
        left.oversupplyScore - right.oversupplyScore ||
        left.incidentalCount - right.incidentalCount ||
        compareDefault(left, right)
      );
    }
  }

  return compareDefault(left, right);
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

function selectedReason(request: CanonicalRequest) {
  if (request.optimization === "fewest_pills") {
    return "Fewer daily pills";
  }

  if (request.optimization === "lowest_cost") {
    return "Lowest-cost stack meeting coverage floor";
  }

  return "Highest-coverage feasible stack";
}

export function selectOptions(input: Readonly<{
  baskets: readonly ScoredBasket[];
  config?: MatcherConfig;
  request: CanonicalRequest;
}>) {
  const config = input.config ?? DEFAULT_MATCHER_CONFIG;
  const ranked = [...input.baskets].sort((left, right) =>
    compareBaskets(left, right, input.request, config)
  );
  const best = ranked[0] ?? null;

  if (!best) {
    return { alternatives: [] as ScoredBasket[], selected: null };
  }

  const selected: ScoredBasket = {
    ...best,
    reason: selectedReason(input.request)
  };

  if (
    input.request.selectorMode === "web_single" ||
    input.request.optimization === "lowest_cost" ||
    input.request.optimization === "fewest_pills"
  ) {
    return { alternatives: [], selected };
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
