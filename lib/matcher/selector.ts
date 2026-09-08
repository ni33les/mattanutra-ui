import { coverageSummary } from "@/lib/matcher/coverage";
import { compareDoseFit, doseFitScore, withProductUncertainty } from "@/lib/matcher/dose-fit";
import { COVERED_THRESHOLD, DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { contributionFor, productIsDedicatedForTarget } from "@/lib/matcher/candidates";
import {
  aggregateCoverage,
  coverageUnits,
  oversupplyScore
} from "@/lib/matcher/dominance";
import { seedState, tryAddVariant, revalidateState } from "@/lib/matcher/search";
import { minUnits } from "@/lib/matcher/dose";
import { knownTargetExposure } from "@/lib/matcher/target-basis";
import { comparePillCounts } from "@/lib/matcher/pill-burden";
import type {
  CanonicalRequest,
  ConversationalOptionRole,
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
      coverageUnits(knownTargetExposure(request, target, delivered.get(target.subjectId) ?? BigInt(0)), target.requested.units)
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

function titleExactCountFor(
  groups: readonly ProductGroup[],
  productIds: readonly string[],
  request: CanonicalRequest
) {
  const byId = new Map(groups.map((item) => [item.productId, item.product]));
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let count = 0;

  for (const productId of productIds) {
    const product = byId.get(productId);

    if (!product) {
      continue;
    }

    const title = normalize(product.title);
    if (
      request.targets.some(
        (target) => title === normalize(target.name) && title.length >= 2
      )
    ) {
      count += 1;
    }
  }

  return count;
}

function requestedLabelCountFor(
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

    count += request.targets.filter(
      (target) => contributionFor(product, target.name, target.subjectId).length > 0
    ).length;
  }

  return count;
}

function dedicatedPartialCountFor(
  groups: readonly ProductGroup[],
  productIds: readonly string[],
  request: CanonicalRequest,
  coverageBySubject: ReadonlyMap<string, number>
) {
  const byId = new Map(groups.map((item) => [item.productId, item.product]));
  let count = 0;

  for (const target of request.targets) {
    if ((coverageBySubject.get(target.subjectId) ?? 0) >= COVERED_THRESHOLD * 100) {
      continue;
    }

    const hasDedicated = productIds.some((productId) => {
      const product = byId.get(productId);

      if (!product) {
        return false;
      }

      if (
        /\bjoint\b/i.test(product.title) ||
        /\b50\+|multivitamins for 50/i.test(product.title) ||
        /\bextract\b|\bbacopa\b|\bturmeric\b/i.test(product.title)
      ) {
        return false;
      }

      if (productIsDedicatedForTarget(product, target)) {
        return true;
      }

      const hits = request.targets.filter(
        (item) => contributionFor(product, item.name, item.subjectId).length > 0
      );

      return hits.length === 1 && hits[0]?.subjectId === target.subjectId;
    });

    if (hasDedicated) {
      count += 1;
    }
  }

  return count;
}

export function scoreState(input: Readonly<{
  allowIncidentalBlock?: boolean;
  groups: readonly ProductGroup[];
  request: CanonicalRequest;
  sellerId: string;
  state: SearchState;
}>): ScoredBasket | null {
  const validated = revalidateState(
    input.state,
    input.groups,
    input.request,
    { allowIncidentalBlock: input.allowIncidentalBlock }
  );

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
    coverageSummary: coverageSummary(input.request, validated.exposure),
    coveredCount: coveredTargetCount(input.request, coverageBySubject),
    dailyPills: input.state.pills,
    pillCountKnown: input.state.pillCountKnown !== false && input.groups.filter(group => productIds.includes(group.productId)).every(group => group.product.pillCountKnown !== false),
    dedicatedPartialCount: dedicatedPartialCountFor(
      input.groups,
      productIds,
      input.request,
      coverageBySubject
    ),
    exposure: validated.exposure,
    incidentalCount: incidentalNutrientCount(input.groups, productIds, input.request),
    oversupplyScore: oversupplyScore(input.request, input.state.exposure),
    doseFit: withProductUncertainty(doseFitScore(input.request, input.state.exposure), validated.exposure.unknownSubjectIds),
    priceMinor: input.state.price,
    productCount: input.state.count,
    productIds,
    reason: selectedReason(input.request),
    titleExactCount: titleExactCountFor(
      input.groups,
      productIds,
      input.request
    ),
    requestedLabelCount: requestedLabelCountFor(
      input.groups,
      productIds,
      input.request
    ),
    safety: validated.safety,
    sellerId: input.sellerId,
    variantIds: input.state.selectedVariantIds,
    variantDoses: validated.variants.map(({ productId, dailyUnits, dailyPills }) => ({ productId, dailyUnits, dailyPills }))
  };
}

function fitOf(basket: ScoredBasket, request: CanonicalRequest) {
  return basket.doseFit ?? doseFitScore(request, new Map([...basket.exposure.totals].map(([id, row]) => [id, row.units])));
}

export function basketSignature(basket: Pick<ScoredBasket, "sellerId" | "variantIds">) {
  return [basket.sellerId, ...[...basket.variantIds].sort()].join("|");
}

/** One total ordering shared by ranking, salvage and the final selection. */
export function compareBaskets(left: ScoredBasket, right: ScoredBasket, request: CanonicalRequest, _config: MatcherConfig = DEFAULT_MATCHER_CONFIG) {
  void _config;
  const fit = compareDoseFit(fitOf(left, request), fitOf(right, request));
  if (fit !== 0) return fit;
  // Dose accuracy remains first. Price-led alternatives are selected below;
  // an equally accurate default should not demand a harder daily routine.
  return comparePillCounts(left.dailyPills, left.pillCountKnown, right.dailyPills, right.pillCountKnown) ||
    left.productCount - right.productCount || left.priceMinor - right.priceMinor ||
    basketSignature(left).localeCompare(basketSignature(right));
}

function productDoseSignature(basket: ScoredBasket) {
  return basket.variantIds.map(variantId => {
    const productId = basket.productIds?.find(id => variantId.includes(`:${id}:x`));
    return productId ? variantId.slice(variantId.lastIndexOf(`:${productId}:x`) + 1) : variantId;
  }).sort().join("|");
}

export function materiallyDifferent(left: ScoredBasket, right: ScoredBasket) {
  // A different listing of the same product and dose is not a product alternative.
  return productDoseSignature(left) !== productDoseSignature(right);
}

// Kept for older callers. Optional targets are still part of the request and
// scoring them as zero would manufacture a different customer request.
export function requestWithoutOptionalPurchases(request: CanonicalRequest): CanonicalRequest { return request; }

function selectedReason(request: CanonicalRequest) {
  if (request.optimization === "lowest_cost") return "Lowest-cost option among the best dose-fit baskets";
  if (request.optimization === "fewest_pills") return "Fewest daily pills among the best dose-fit baskets";
  return "Closest overall fit to the agreed daily targets";
}

function satisfiesRetained(request: CanonicalRequest, basket: ScoredBasket) {
  return (request.productDoses ?? []).every(row => basket.productIds.includes(row.productId)) &&
    request.retainProductIds.every((id) => basket.productIds.includes(id) || request.currentSupplements.some((row) => row.productId === id)) &&
    request.retainSubjectIds.every((id) => (basket.exposure.totals.get(id)?.units ?? BigInt(0)) > BigInt(0));
}

function concernMap(basket: ScoredBasket, request: CanonicalRequest) {
  const concerns = new Map<string, number>();
  const fit = fitOf(basket, request);
  for (const row of fit.perTarget) {
    const over = Math.max(0, ((row.exposureMaximum ?? row.exposure) - row.target) / row.target);
    if (over > 0) concerns.set("target:" + row.subjectId, over);
  }
  for (const row of fit.perLimit) {
    const over = Math.max(0, ((row.exposureMaximum ?? row.exposure) - row.limit) / row.limit);
    if (over > 0) concerns.set(`limit:${row.sourceScope}:${row.subjectId}`, over);
  }
  for (const row of fit.perContinuedDose ?? []) {
    if (row.over > 0) concerns.set("continued_dose:" + row.subjectId, row.over);
  }
  for (const finding of basket.safety.findings) {
    if (finding.code === "target_exceeded" || finding.code === "continued_dose_increased" || finding.code === "dose_review_required") continue;
    const key = `${finding.code}:${finding.ruleId}:${finding.subjectId ?? ""}`;
    if (finding.uncertainty?.length) {
      for (const reason of finding.uncertainty) concerns.set(key + ":" + reason, 1);
    } else concerns.set(key, 1);
  }
  return concerns;
}

export function hasFewerConcerns(candidate: ScoredBasket, selected: ScoredBasket, request: CanonicalRequest) {
  if (!materiallyDifferent(candidate, selected)) return false;
  // Coverage is capped at the agreed target; reducing 150% to 100% loses none.
  if (request.targets.some((target) =>
    minUnits(knownTargetExposure(request, target, candidate.exposure.totals.get(target.subjectId)?.units ?? BigInt(0)), target.requested.units) <
    minUnits(knownTargetExposure(request, target, selected.exposure.totals.get(target.subjectId)?.units ?? BigInt(0)), target.requested.units))) return false;
  const before = concernMap(selected, request);
  const after = concernMap(candidate, request);
  if ([...after].some(([key, value]) => value > (before.get(key) ?? 0))) return false;
  return [...before].some(([key, value]) => (after.get(key) ?? 0) < value);
}


/** The default may trade between incomparable required targets, but optional
 * gains cannot displace a candidate that is no worse on every protected fact. */
export function protectedReferenceCandidates(baskets: readonly ScoredBasket[], request: CanonicalRequest): ScoredBasket[] {
  const protectedIds = new Set(request.targets.filter(row => row.importance === "required" || row.importance === "core").map(row => row.subjectId));
  if (!protectedIds.size || !request.targets.some(row => row.importance === "optional")) return [...baskets];
  const vectors = baskets.map(basket => {
    const fit = fitOf(basket, request);
    const vector = new Map<string, number>();
    for (const row of fit.perTarget) if (protectedIds.has(row.subjectId)) {
      vector.set(`deviation:${row.subjectId}`, row.under + row.over);
      vector.set(`target_excess:${row.subjectId}`, row.over);
    }
    for (const row of fit.perContinuedDose ?? []) vector.set(`continued:${row.subjectId}`, row.over);
    for (const row of fit.perLimit) vector.set(`limit:${row.sourceScope}:${row.subjectId}`, row.excess);
    return vector;
  });
  return baskets.filter((_, i) => !vectors.some((other, j) => {
    if (i === j) return false;
    const own = vectors[i]!;
    const keys = new Set([...own.keys(), ...other.keys()]);
    let strict = false;
    for (const key of keys) {
      const a = other.get(key) ?? 0, b = own.get(key) ?? 0;
      if (a > b) return false;
      if (a < b) strict = true;
    }
    return strict;
  }));
}

/** A commercially inferior basket is not a useful trade-off when it also has
 * no better dose fit, coverage or concern profile. Compare actual quantities. */
function optionDominates(left: ScoredBasket, right: ScoredBasket, request: CanonicalRequest) {
  const fit = compareDoseFit(fitOf(left, request), fitOf(right, request));
  // A known count cannot prove that it is smaller than an unknown count.
  const samePillCertainty = (left.pillCountKnown !== false) === (right.pillCountKnown !== false);
  if (!samePillCertainty) return false;
  const pills = left.pillCountKnown === false ? 0 : left.dailyPills - right.dailyPills;
  if (fit > 0 || left.priceMinor > right.priceMinor || pills > 0 || left.productCount > right.productCount) return false;
  if (request.targets.some(target => (left.coverageBySubject.get(target.subjectId) ?? 0) < (right.coverageBySubject.get(target.subjectId) ?? 0))) return false;
  const a = concernMap(left, request), b = concernMap(right, request);
  if ([...a].some(([key, value]) => value > (b.get(key) ?? 0))) return false;
  return fit < 0 || left.priceMinor < right.priceMinor || pills < 0 || left.productCount < right.productCount ||
    [...b].some(([key, value]) => (a.get(key) ?? 0) < value);
}

export function selectOptions(input: Readonly<{ baskets: readonly ScoredBasket[]; config?: MatcherConfig; request: CanonicalRequest }>) {
  const unique = new Map<string, ScoredBasket>();
  for (const basket of input.baskets) {
    if (!satisfiesRetained(input.request, basket)) continue;
    // Equivalent product+dose listings are one conversational choice. Retain
    // the lowest-priced valid listing without hiding different actual doses.
    const signature = productDoseSignature(basket);
    const previous = unique.get(signature);
    if (!previous || compareBaskets(basket, previous, input.request, input.config) < 0) unique.set(signature, basket);
  }
  const compare = (a: ScoredBasket, b: ScoredBasket) => compareBaskets(a, b, input.request, input.config);
  const ranked = [...unique.values()].sort(compare);
  const best = protectedReferenceCandidates(ranked, input.request)[0];
  if (!best) return { alternatives: [] as ScoredBasket[], selected: null };
  const nonempty = ranked.filter(row => row.productCount > 0);
  // These sorted extremal choices are Pareto-valid without quadratic pruning:
  // any strict dominator sorts before them on that objective then full fit.
  const lowerCost = [...nonempty].sort((a, b) => a.priceMinor - b.priceMinor || compare(a, b)).find(row => !nonempty.some(other => other !== row && optionDominates(other, row, input.request)));
  const simpler = [...nonempty].sort((a, b) => a.productCount - b.productCount || comparePillCounts(a.dailyPills, a.pillCountKnown, b.dailyPills, b.pillCountKnown) || compare(a, b)).find(row => !nonempty.some(other => other !== row && optionDominates(other, row, input.request)));
  const fewerConcerns = nonempty.find(row => hasFewerConcerns(row, best, input.request));
  // A product supplying requested nutrients without incidental nutrient load
  // can be useful even when missing administration facts prevent pill ranking.
  // Keep one evaluated choice; do not invent a "fewer pills" role for unknowns.
  const focused = nonempty.find(row => row.productCount === 1 && row.incidentalCount === 0 && row.requestedLabelCount > 0 && row.aggregateCoverage > 0);
  const fallback = best.productCount === 0 ? nonempty[0] : undefined;
  const options = new Map<string, { basket: ScoredBasket; roles: ConversationalOptionRole[] }>();
  const add = (basket: ScoredBasket | undefined, role: ConversationalOptionRole) => {
    if (!basket) return;
    const key = productDoseSignature(basket);
    const row = options.get(key) ?? { basket, roles: [] };
    if (!row.roles.includes(role)) row.roles.push(role);
    options.set(key, row);
  };
  add(best, "closest_dose"); add(lowerCost, "lower_cost"); add(simpler, "simpler"); add(fewerConcerns, "fewer_concerns"); add(fallback, "purchase_fallback");
  if (focused && !options.has(productDoseSignature(focused))) options.set(productDoseSignature(focused), { basket: focused, roles: [] });
  const mapped = [...options.values()].map(({ basket, roles }) => {
    const recommended = roles.includes("closest_dose");
    const reason = roles.length === 0 ? "Target-focused option with disclosed dose and product-data uncertainty" : recommended ? selectedReason(input.request) : roles.includes("purchase_fallback")
      ? "Available to purchase with the disclosed gaps, excesses and health advice; purchasing is not the closest dose fit."
      : roles.includes("fewer_concerns") ? "Fewer concerns without lower requested-target coverage"
      : roles.includes("simpler") ? "Fewer products or daily pills with the disclosed coverage trade-off"
      : "Lower first-order goods price with the disclosed coverage trade-off";
    return { ...basket, roles, purchaseEligible: basket.productCount > 0, recommended, reason,
      optionRole: recommended ? "requested_objective" as const : roles.includes("fewer_concerns") ? "fewer_concerns" as const : "best_value" as const };
  });
  return { selected: mapped.find(row => row.recommended)!, alternatives: mapped.filter(row => !row.recommended) };
}

/** Deterministic fallback improves the same score, never just covered-target count. */
export function salvagePartialBasket(input: Readonly<{ groups: readonly ProductGroup[]; request: CanonicalRequest; sellerId: string }>): ScoredBasket | null {
  let state = seedState(input.request);
  let best = scoreState({ ...input, state });
  if (!best) return null;
  for (let iteration = 0; iteration < input.groups.length; iteration += 1) {
    let chosen: { state: SearchState; basket: ScoredBasket } | null = null;
    for (const group of input.groups) for (const variant of group.variants) {
      const next = tryAddVariant(state, variant, group, input.request);
      if (!next) continue;
      const basket = scoreState({ ...input, state: next });
      if (!basket || compareBaskets(basket, best, input.request) >= 0) continue;
      if (!chosen || compareBaskets(basket, chosen.basket, input.request) < 0) chosen = { state: next, basket };
    }
    if (!chosen) break;
    state = chosen.state;
    best = chosen.basket;
  }
  return best;
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
  return basket.productIds
    .map((productId) => groupProduct(groups, productId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
