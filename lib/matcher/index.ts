import {
  bestCompactCoveringGroup,
  compactMultiCoveringGroups,
  compileGroups,
  contributionFor,
  coveringVariantForMostFloors,
  coveringVariantForTarget,
  groupsBySeller
} from "@/lib/matcher/candidates";
import { coverageUnits } from "@/lib/matcher/dominance";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { COVERED_THRESHOLD, DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
import { rejectedCandidatesFor } from "@/lib/matcher/explainer";
import { evaluateSafety } from "@/lib/matcher/safety";
import { searchGroups, seedState, tryAddVariant } from "@/lib/matcher/search";
import {
  compareBaskets,
  salvagePartialBasket,
  scoreState,
  selectOptions
} from "@/lib/matcher/selector";
import type {
  CanonicalRequest,
  CatalogSnapshot,
  MatchResult,
  MatcherConfig,
  MatcherLeftover,
  ProductGroup,
  RejectedCandidate,
  ScoredBasket
} from "@/lib/matcher/types";

function productMaterialForRequest(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  productId: string,
  variantIds: readonly string[]
) {
  if (request.retainProductIds.includes(productId)) {
    return true;
  }

  const group = groups.find((item) => item.productId === productId);

  if (!group) {
    return false;
  }

  if (
    (request.omega3SourcePreference === "algae_only" ||
      request.dietaryPreference === "vegan") &&
    group.product.omegaSource === "algae"
  ) {
    return true;
  }

  const variant =
    group.variants.find((item) => variantIds.includes(item.variantId)) ??
    group.variants[0];

  if (!variant) {
    return false;
  }

  for (const target of request.targets) {
    if (contributionFor(group.product, target.name, target.subjectId).length < 1) {
      continue;
    }

    const units = variant.contributions.get(target.subjectId)?.units ?? BigInt(0);

    if (target.requested.units > BigInt(0) && units * BigInt(10) >= target.requested.units) {
      return true;
    }
  }

  return false;
}

function keepIdsForMaterialBasket(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  selected: ScoredBasket
) {
  const keep = new Set(
    selected.productIds.filter((productId) =>
      productMaterialForRequest(groups, request, productId, selected.variantIds)
    )
  );

  for (const target of request.targets) {
    const contributors = selected.productIds.filter((productId) => {
      const group = groups.find((item) => item.productId === productId);
      const variant = group?.variants.find((item) =>
        selected.variantIds.includes(item.variantId)
      );
      return (variant?.contributions.get(target.subjectId)?.units ?? BigInt(0)) > BigInt(0);
    });

    if (contributors.some((productId) => keep.has(productId))) {
      continue;
    }

    let bestId: string | null = null;
    let bestUnits = BigInt(0);

    for (const productId of contributors) {
      const group = groups.find((item) => item.productId === productId);
      const variant = group?.variants.find((item) =>
        selected.variantIds.includes(item.variantId)
      );
      const units = variant?.contributions.get(target.subjectId)?.units ?? BigInt(0);

      if (units > bestUnits) {
        bestUnits = units;
        bestId = productId;
      }
    }

    if (bestId) {
      keep.add(bestId);
    }
  }

  return keep;
}

function rescoreWithKeep(input: Readonly<{
  groups: readonly ProductGroup[];
  keep: ReadonlySet<string>;
  request: CanonicalRequest;
  selected: ScoredBasket;
}>): ScoredBasket | null {
  if (input.keep.size < 1) {
    return null;
  }

  let state = seedState(input.request);
  const used = new Set<string>();

  for (const variantId of input.selected.variantIds) {
    const group = input.groups.find((item) =>
      item.variants.some((variant) => variant.variantId === variantId)
    );
    const variant = group?.variants.find((item) => item.variantId === variantId);

    if (!group || !variant || used.has(group.productId) || !input.keep.has(group.productId)) {
      continue;
    }

    const next = tryAddVariant(state, variant, group, input.request);

    if (!next) {
      continue;
    }

    state = next;
    used.add(group.productId);
  }

  if (state.count < 1) {
    return null;
  }

  return scoreState({
    groups: input.groups,
    request: input.request,
    sellerId: input.selected.sellerId,
    state
  });
}

function dropRedundantProducts(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
}>): ScoredBasket {
  let current = input.selected;
  let changed = true;

  while (changed) {
    changed = false;
    const pillsByProduct = new Map<string, number>();

    for (const variantId of current.variantIds) {
      const group = input.groups.find((item) =>
        item.variants.some((variant) => variant.variantId === variantId)
      );
      const variant = group?.variants.find((item) => item.variantId === variantId);

      if (!group || !variant) {
        continue;
      }

      pillsByProduct.set(group.productId, variant.dailyPills);
    }

    const ordered = [...current.productIds].sort((left, right) => {
      const leftPills = pillsByProduct.get(left) ?? 0;
      const rightPills = pillsByProduct.get(right) ?? 0;

      return rightPills - leftPills || left.localeCompare(right);
    });

    for (const productId of ordered) {
      if (input.request.retainProductIds.includes(productId)) {
        continue;
      }

      const keep = new Set(current.productIds.filter((id) => id !== productId));
      const next = rescoreWithKeep({
        groups: input.groups,
        keep,
        request: input.request,
        selected: current
      });

      if (!next) {
        continue;
      }

      if (
        next.coveredCount >= current.coveredCount &&
        next.dedicatedPartialCount >= current.dedicatedPartialCount &&
        (next.productCount < current.productCount ||
          next.dailyPills < current.dailyPills)
      ) {
        current = next;
        changed = true;
        break;
      }
    }
  }

  return current;
}

function rescoreKeptProducts(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
}>): ScoredBasket | null {
  const keep = keepIdsForMaterialBasket(input.groups, input.request, input.selected);

  if (keep.size === input.selected.productIds.length) {
    return input.selected;
  }

  return (
    rescoreWithKeep({
      groups: input.groups,
      keep,
      request: input.request,
      selected: input.selected
    }) ?? input.selected
  );
}

function rebuildStateFromBasket(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
}>) {
  let state = seedState(input.request);
  const used = new Set<string>();

  for (const variantId of input.selected.variantIds) {
    const group = input.groups.find((item) =>
      item.variants.some((variant) => variant.variantId === variantId)
    );
    const variant = group?.variants.find((item) => item.variantId === variantId);

    if (!group || !variant || used.has(group.productId)) {
      continue;
    }

    const next = tryAddVariant(state, variant, group, input.request);

    if (!next) {
      continue;
    }

    state = next;
    used.add(group.productId);
  }

  return { state, used };
}

function pickBetterBasket(
  left: ScoredBasket,
  right: ScoredBasket,
  request: CanonicalRequest,
  config: MatcherConfig
) {
  return compareBaskets(left, right, request, config) < 0 ? left : right;
}

function coveringWinnersBasket(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
}>): ScoredBasket | null {
  let state = seedState(input.request);
  const used = new Set<string>();

  for (const group of compactMultiCoveringGroups(input.groups, input.request)) {
    if (used.has(group.productId)) {
      continue;
    }

    const variant = coveringVariantForMostFloors(group, input.request);

    if (!variant) {
      continue;
    }

    const next = tryAddVariant(state, variant, group, input.request);

    if (!next) {
      continue;
    }

    const scored = scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: input.selected.sellerId,
      state: next
    });

    if (!scored) {
      continue;
    }

    state = next;
    used.add(group.productId);
  }

  for (const target of input.request.targets) {
    const winner = bestCompactCoveringGroup(
      input.groups,
      input.request,
      target.subjectId
    );

    if (!winner || used.has(winner.productId)) {
      continue;
    }

    const variant = coveringVariantForTarget(
      winner,
      input.request,
      target.subjectId
    );

    if (!variant) {
      continue;
    }

    const next = tryAddVariant(state, variant, winner, input.request);

    if (!next) {
      continue;
    }

    const scored = scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: input.selected.sellerId,
      state: next
    });

    if (!scored) {
      continue;
    }

    state = next;
    used.add(winner.productId);
  }

  for (const variantId of input.selected.variantIds) {
    const group = input.groups.find((item) =>
      item.variants.some((variant) => variant.variantId === variantId)
    );
    const variant = group?.variants.find((item) => item.variantId === variantId);

    if (!group || !variant || used.has(group.productId)) {
      continue;
    }

    const next = tryAddVariant(state, variant, group, input.request);

    if (!next) {
      continue;
    }

    const current = scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: input.selected.sellerId,
      state
    });
    const added = scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: input.selected.sellerId,
      state: next
    });

    if (
      !added ||
      !current ||
      (added.coveredCount <= current.coveredCount &&
        added.dedicatedPartialCount <= current.dedicatedPartialCount)
    ) {
      continue;
    }

    state = next;
    used.add(group.productId);
  }

  if (state.count < 1) {
    return null;
  }

  return scoreState({
    groups: input.groups,
    request: input.request,
    sellerId: input.selected.sellerId,
    state
  });
}

function absorbStandaloneWinners(input: Readonly<{
  config: MatcherConfig;
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
}>): ScoredBasket {
  const uncovered = input.request.targets.filter(
    (target) =>
      (input.selected.coverageBySubject.get(target.subjectId) ?? 0) <
      COVERED_THRESHOLD * 100
  );

  if (uncovered.length < 1) {
    return input.selected;
  }

  const rebuilt = rebuildStateFromBasket(input);
  let state = rebuilt.state;
  const used = rebuilt.used;
  let changed = false;
  const floor = COVERED_THRESHOLD * 100;

  for (const target of input.request.targets) {
    const delivered = state.delivered.get(target.subjectId) ?? BigInt(0);

    if (coverageUnits(delivered, target.requested.units) >= floor) {
      continue;
    }

    const winner = bestCompactCoveringGroup(
      input.groups,
      input.request,
      target.subjectId
    );

    if (!winner || used.has(winner.productId)) {
      continue;
    }

    const variant = coveringVariantForTarget(
      winner,
      input.request,
      target.subjectId
    );

    if (!variant) {
      continue;
    }

    const next = tryAddVariant(state, variant, winner, input.request);

    if (!next) {
      continue;
    }

    state = next;
    used.add(winner.productId);
    changed = true;
  }

  let best = input.selected;

  if (changed) {
    const scored = scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: input.selected.sellerId,
      state
    });

    if (scored) {
      best = pickBetterBasket(scored, best, input.request, input.config);
    }
  }

  const winners = coveringWinnersBasket(input);

  if (winners) {
    best = pickBetterBasket(winners, best, input.request, input.config);
  }

  return best;
}

function leftoversFor(
  request: CanonicalRequest,
  selected: ScoredBasket | null
): MatcherLeftover[] {
  const leftovers: MatcherLeftover[] = [...request.leftovers];
  const seen = new Set(leftovers.map((item) => `${item.reason}:${item.name}`));

  const push = (item: MatcherLeftover) => {
    const key = `${item.reason}:${item.name}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    leftovers.push(item);
  };

  for (const target of request.targets) {
    const coverage = selected?.coverageBySubject.get(target.subjectId) ?? 0;
    const percent = Math.round(coverage / 100);

    if (!selected || percent <= 0) {
      push({
        amount: target.requestedAmount,
        name: target.name,
        reason: "uncovered",
        severity: "high",
        subjectId: target.subjectId,
        unit: target.requestedUnit
      });
    } else if (percent < 90) {
      push({
        amount: target.requestedAmount,
        name: target.name,
        note: `covered ${percent}%`,
        reason: "dose_gap",
        severity: "medium",
        subjectId: target.subjectId,
        unit: target.requestedUnit
      });
    }
  }

  return leftovers;
}

export function match(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG,
  compiledGroups?: readonly ProductGroup[]
): MatchResult {
  request = orderInvariantRequest(request);
  const baselineExposure = aggregateDailyExposure({
    current: request.currentSupplements,
    variants: []
  });

  if (!isDoseError(baselineExposure)) {
    const baseline = evaluateSafety({
      exposure: baselineExposure,
      products: catalog.products,
      request,
      variants: []
    });

    if (baseline.hardBlocked) {
      const groups = compiledGroups
        ? [...compiledGroups]
        : compileGroups(request, catalog);
      return {
        alternatives: [],
        leftovers: leftoversFor(request, null),
        rejected: rejectedCandidatesFor(request, catalog, groups),
        searchMode: "exact",
        selected: null,
        trimmed: false
      };
    }
  }

  const deadlineAt = Date.now() + config.searchDeadlineMs;
  const groups = compiledGroups
    ? [...compiledGroups]
    : compileGroups(
        request,
        catalog,
        Math.max(Date.now(), deadlineAt - 400)
      );
  const sellers = groupsBySeller(
    groups,
    request,
    config.sellerGroupLimit ?? 32
  );
  const scored: ScoredBasket[] = [];
  let mode: "bounded" | "exact" = "exact";
  let trimmed = false;

  for (const seller of sellers) {
    const remaining = Math.max(0, deadlineAt - Date.now());
    const run = searchGroups(seller.groups, request, {
      ...config,
      searchDeadlineMs: remaining
    });
    mode = run.mode === "bounded" ? "bounded" : mode;
    trimmed = trimmed || run.trimmed;

    for (const state of run.complete) {
      const basket = scoreState({
        groups: seller.groups,
        request,
        sellerId: seller.sellerId,
        state
      });

      if (basket) {
        scored.push(basket);
      }
    }

    if (Date.now() < deadlineAt || scored.length < 1) {
      const salvaged = salvagePartialBasket({
        groups: seller.groups,
        request,
        sellerId: seller.sellerId
      });

      if (salvaged) {
        scored.push(salvaged);
      }
    }
  }

  const bySeller = new Map<string, ScoredBasket[]>();

  for (const basket of scored) {
    const list = bySeller.get(basket.sellerId) ?? [];
    list.push(basket);
    bySeller.set(basket.sellerId, list);
  }

  let winner: ReturnType<typeof selectOptions> = {
    alternatives: [],
    selected: null
  };

  for (const [, baskets] of [...bySeller.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const option = selectOptions({ baskets, config, request });

    if (!option.selected) {
      continue;
    }

    if (
      !winner.selected ||
      compareBaskets(option.selected, winner.selected, request, config) < 0
    ) {
      winner = option;
    }
  }

  if (winner.selected && !config.skipPostMatchCompact) {
    const compact = dropRedundantProducts({
      groups,
      request,
      selected: winner.selected
    });
    const pruned = rescoreKeptProducts({
      groups,
      request,
      selected: compact
    });
    const next = pruned ?? compact;
    winner = {
      alternatives: winner.alternatives,
      selected: absorbStandaloneWinners({
        config,
        groups,
        request,
        selected: next
      })
    };
  }

  if (!winner.selected || winner.selected.productCount < 1) {
    for (const seller of sellers) {
      const salvaged = salvagePartialBasket({
        groups: seller.groups,
        request,
        sellerId: seller.sellerId
      });

      if (!salvaged) {
        continue;
      }

      if (
        !winner.selected ||
        winner.selected.productCount < 1 ||
        compareBaskets(salvaged, winner.selected, request, config) < 0
      ) {
        winner = { alternatives: [], selected: salvaged };
      }
    }
  }

  const rejected =
    Date.now() < deadlineAt
      ? rejectedCandidatesFor(request, catalog, groups)
      : [];

  return {
    alternatives: winner.alternatives,
    leftovers: leftoversFor(request, winner.selected),
    rejected,
    searchMode: mode,
    selected: winner.selected,
    trimmed
  };
}

export { DEFAULT_MATCHER_CONFIG, MATCHER_VERSION } from "@/lib/matcher/config";
export {
  scaleAmount,
  convertAmount,
  aggregateDailyExposure,
  isDoseError
} from "@/lib/matcher/dose";
export { evaluateSafety } from "@/lib/matcher/safety";
export { productEligible } from "@/lib/matcher/eligibility";
export { compileGroups } from "@/lib/matcher/candidates";
export {
  optionIdFor,
  publicCoveragePercent,
  rejectedCandidatesFor,
  summarizeRejections,
  DEV_REJECTED_DUMP_LIMIT,
  PUBLIC_REJECTED_SAMPLE_LIMIT
} from "@/lib/matcher/explainer";
export { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
export { productRejectionReason } from "@/lib/matcher/eligibility";
export type * from "@/lib/matcher/types";
