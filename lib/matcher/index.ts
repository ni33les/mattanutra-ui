import {
  bestCompactCoveringGroup,
  bestStandaloneContributorGroup,
  compactMultiCoveringGroups,
  compileGroups,
  contributionFor,
  contributingVariantForTarget,
  labelledTargetCount,
  coveringVariantForMostFloors,
  coveringVariantForTarget,
  groupsBySeller
} from "@/lib/matcher/candidates";
import { coverageUnits } from "@/lib/matcher/dominance";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { COVERED_THRESHOLD, DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { aggregateDailyExposure, amountFromScaled, isDoseError } from "@/lib/matcher/dose";
import { rejectedCandidatesFor } from "@/lib/matcher/explainer";
import { evaluateSafety } from "@/lib/matcher/safety";
import { safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import { reconstructVariants, searchGroups, seedState, tryAddVariant } from "@/lib/matcher/search";
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

function groupVariantForId(
  groups: readonly ProductGroup[],
  variantId: string
) {
  for (const group of groups) {
    const variant = group.variants.find((item) => item.variantId === variantId);

    if (variant) {
      return { group, variant };
    }
  }

  return null;
}

function labelledRequestCount(
  product: ProductGroup["product"],
  request: CanonicalRequest
) {
  return request.targets.reduce(
    (sum, target) =>
      sum +
      (contributionFor(product, target.name, target.subjectId).length > 0 ? 1 : 0),
    0
  );
}

function tryReplaceWeakerTargetSkus(input: Readonly<{
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  selected: ScoredBasket;
  state: ReturnType<typeof seedState>;
  subjectId: string;
  variant: NonNullable<
    ReturnType<typeof contributingVariantForTarget>
  >;
  winner: ProductGroup;
}>) {
  const winnerUnits =
    input.variant.contributions.get(input.subjectId)?.units ?? BigInt(0);
  const keptIds = [...input.state.selectedVariantIds].filter((variantId) => {
    const found = groupVariantForId(input.groups, variantId);

    if (!found) {
      return false;
    }

    const contributed =
      found.variant.contributions.get(input.subjectId)?.units ?? BigInt(0);

    if (contributed <= BigInt(0)) {
      return true;
    }

    if (labelledRequestCount(found.group.product, input.request) > 1) {
      return true;
    }

    return contributed >= winnerUnits;
  });

  if (keptIds.length === input.state.selectedVariantIds.length) {
    return null;
  }

  const rebuilt = rebuildStateFromBasket({
    groups: input.groups,
    request: input.request,
    selected: {
      ...input.selected,
      variantIds: keptIds
    }
  });

  return tryAddVariant(rebuilt.state, input.variant, input.winner, input.request);
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

  const coveringBase = coveringWinnersBasket(input);
  const base =
    coveringBase && coveringBase.coveredCount > input.selected.coveredCount
      ? coveringBase
      : input.selected;
  const rebuilt = rebuildStateFromBasket({
    groups: input.groups,
    request: input.request,
    selected: base
  });
  let state = rebuilt.state;
  const used = rebuilt.used;
  let changed = false;
  const floor = COVERED_THRESHOLD * 100;
  const maxSteps = Math.max(4, input.groups.length + 2);

  for (const target of input.request.targets) {
    for (let step = 0; step < maxSteps; step += 1) {
      const delivered = state.delivered.get(target.subjectId) ?? BigInt(0);

      if (coverageUnits(delivered, target.requested.units) >= floor) {
        break;
      }

      const covering = bestCompactCoveringGroup(
        input.groups,
        input.request,
        target.subjectId
      );
      let winner =
        covering && !used.has(covering.productId) ? covering : null;
      let variant = winner
        ? coveringVariantForTarget(winner, input.request, target.subjectId)
        : null;

      if (!winner || !variant) {
        const alreadyLabelled = [...used].some((productId) => {
          const group = input.groups.find((item) => item.productId === productId);
          return Boolean(
            group &&
              contributionFor(group.product, target.name, target.subjectId).length >
                0
          );
        });

        winner = bestStandaloneContributorGroup(
          input.groups,
          input.request,
          target.subjectId,
          used
        );
        variant = winner
          ? contributingVariantForTarget(
              winner,
              input.request,
              target.subjectId
            )
          : null;

        if (alreadyLabelled && winner && variant) {
          const nextUnits =
            delivered +
            (variant.contributions.get(target.subjectId)?.units ?? BigInt(0));

          if (coverageUnits(nextUnits, target.requested.units) < floor) {
            winner = null;
            variant = null;
          }
        }
      }

      if (!winner || !variant) {
        break;
      }

      let next = tryAddVariant(state, variant, winner, input.request);
      const replaced = tryReplaceWeakerTargetSkus({
        groups: input.groups,
        request: input.request,
        selected: base,
        state,
        subjectId: target.subjectId,
        variant,
        winner
      });

      if (replaced) {
        next = replaced;
      }

      used.add(winner.productId);

      if (!next) {
        continue;
      }

      state = next;
      changed = true;
    }
  }

  for (const target of input.request.targets) {
    const delivered = state.delivered.get(target.subjectId) ?? BigInt(0);

    if (coverageUnits(delivered, target.requested.units) >= floor) {
      continue;
    }

    let best: { group: ProductGroup; variant: NonNullable<ReturnType<typeof contributingVariantForTarget>> } | null = null;

    for (const group of input.groups) {
      if (used.has(group.productId)) {
        continue;
      }

      const variant = contributingVariantForTarget(
        group,
        input.request,
        target.subjectId
      );

      if (!variant) {
        continue;
      }

      const extra = variant.contributions.get(target.subjectId)?.units ?? BigInt(0);
      const nextUnits = delivered + extra;

      if (coverageUnits(nextUnits, target.requested.units) < floor) {
        continue;
      }

      const next = tryAddVariant(state, variant, group, input.request);

      if (!next) {
        continue;
      }

      if (
        !best ||
        labelledTargetCount(group.product, input.request) <
          labelledTargetCount(best.group.product, input.request) ||
        (labelledTargetCount(group.product, input.request) ===
          labelledTargetCount(best.group.product, input.request) &&
          variant.dailyPills < best.variant.dailyPills) ||
        (labelledTargetCount(group.product, input.request) ===
          labelledTargetCount(best.group.product, input.request) &&
          variant.dailyPills === best.variant.dailyPills &&
          group.productId < best.group.productId)
      ) {
        best = { group, variant };
      }
    }

    if (!best) {
      continue;
    }

    const next = tryAddVariant(state, best.variant, best.group, input.request);

    if (!next) {
      continue;
    }

    used.add(best.group.productId);
    state = next;
    changed = true;
  }

  if (!changed) {
    return base;
  }

  return (
    scoreState({
      groups: input.groups,
      request: input.request,
      sellerId: base.sellerId,
      state
    }) ?? base
  );
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
      const constraint =
        selected &&
        request.maxProductCount != null &&
        selected.productCount >= request.maxProductCount
          ? "hard_constraint:maxProductCount"
          : selected &&
              request.maxDailyPills != null &&
              selected.dailyPills >= request.maxDailyPills
            ? "hard_constraint:maxDailyPills"
            : selected &&
                request.maxPriceMinor != null &&
                selected.priceMinor >= request.maxPriceMinor
              ? "hard_constraint:maxPriceMinor"
              : undefined;
      push({
        amount: target.requestedAmount,
        name: target.name,
        ...(constraint ? { note: constraint } : {}),
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
      products: [],
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

    const salvaged = salvagePartialBasket({
      groups: seller.groups,
      request,
      sellerId: seller.sellerId
    });

    if (salvaged) {
      scored.push(salvaged);
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
    Date.now() >= deadlineAt
      ? []
      : rejectedCandidatesFor(request, catalog, groups, deadlineAt);

  const targetFrontiers = request.targets.map((target) => {
    const covering = bestCompactCoveringGroup(groups, request, target.subjectId);
    const standalone = bestStandaloneContributorGroup(
      groups,
      request,
      target.subjectId
    );
    const productIds = [
      ...new Set(
        [covering?.productId, standalone?.productId].filter(
          (id): id is string => Boolean(id)
        )
      )
    ];

    return {
      name: target.name,
      productIds,
      subjectId: target.subjectId
    };
  });

  const selectedIds = new Set(winner.selected?.productIds ?? []);
  const selectedVariants = reconstructVariants(
    groups,
    winner.selected?.variantIds ?? []
  );
  const lossCertificates = request.targets.flatMap((target) => {
    const frontier = targetFrontiers.find(
      (item) => item.subjectId === target.subjectId
    );
    const missing = (frontier?.productIds ?? []).filter((id) => !selectedIds.has(id));
    const beforeUnits = selectedVariants.reduce(
      (sum, variant) =>
        sum + (variant.contributions.get(target.subjectId)?.units ?? BigInt(0)),
      BigInt(0)
    );
    const beforeAmount = amountFromScaled(
      {
        dim: target.requested.dim,
        subjectId: target.subjectId,
        units: beforeUnits
      },
      target.requestedUnit,
      target.name
    );
    const ceiling = safetyCeilingFor(request.safetyCeilings, {
      name: target.name,
      profile: request.profile,
      subjectId: target.subjectId
    });

    return missing.map((candidate_product_id) => {
      const group = groups.find((item) => item.productId === candidate_product_id);
      const joint = /\bjoint\b/i.test(group?.product.title ?? "");
      const fact = group
        ? contributionFor(group.product, target.name, target.subjectId)[0]
        : undefined;
      const variant = group
        ? contributingVariantForTarget(group, request, target.subjectId)
        : null;
      const extra = variant?.contributions.get(target.subjectId)?.units ?? BigInt(0);
      const afterAmount = amountFromScaled(
        {
          dim: target.requested.dim,
          subjectId: target.subjectId,
          units: beforeUnits + extra
        },
        target.requestedUnit,
        target.name
      );
      const exceedsLimit =
        ceiling != null &&
        afterAmount != null &&
        afterAmount > ceiling.maxAmount;
      const compiled = Boolean(group);
      const rejection_class = exceedsLimit
        ? ("safety" as const)
        : !compiled && trimmed
          ? ("approximate" as const)
          : !compiled
            ? ("unavailable" as const)
            : ("dominated" as const);

      return {
        candidate_fact_id: fact
          ? `${candidate_product_id}:${fact.name ?? target.name}:${fact.unit ?? target.requestedUnit}`
          : null,
        candidate_product_id,
        catalogue_id: catalog.catalogueVersion,
        conflicting_product_ids: [...selectedIds],
        conflicting_rule_id: exceedsLimit
          ? `ul:${target.subjectId}`
          : joint
            ? "joint_skip_multi_target"
            : !compiled && trimmed
              ? "search_deadline"
              : "combined_mode",
        exposure_after: afterAmount,
        exposure_before: beforeAmount,
        limit: ceiling?.maxAmount ?? null,
        rejection_class,
        target_supplement_id: target.subjectId,
        unit: target.requestedUnit
      };
    });
  });

  return {
    alternatives: winner.alternatives,
    leftovers: leftoversFor(request, winner.selected),
    ...(lossCertificates.length > 0 ? { lossCertificates } : {}),
    rejected,
    searchMode: mode,
    selected: winner.selected,
    ...(targetFrontiers.some((item) => item.productIds.length > 0)
      ? { targetFrontiers }
      : {}),
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
