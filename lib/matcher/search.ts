import { targetDoseTicks } from "@/lib/matcher/target-basis";
import { servingIncrement } from "@/lib/matcher/serving-grid";
import { comparePillCounts } from "@/lib/matcher/pill-burden";
import { compileVariant, isDeferredConditional } from "@/lib/matcher/candidates";
import { compareDoseFit, doseFitScore } from "@/lib/matcher/dose-fit";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { fingerprintState } from "@/lib/matcher/dominance";
import { aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
import { evaluateSafety, labelledSafetyExposure } from "@/lib/matcher/safety";
import type {
  CanonicalRequest,
  DoseVariant,
  MatcherConfig,
  ProductGroup,
  SearchState
} from "@/lib/matcher/types";

/** Optional offline instrumentation. Omission preserves the production algorithm. */
export type SearchStrategy = Readonly<{
  compare?: (left: SearchState, right: SearchState) => number;
  cohort?: (state: SearchState) => string;
  variants?: (group: ProductGroup, state: SearchState, existing: readonly DoseVariant[], probe: (variant: DoseVariant) => SearchState | null) => readonly DoseVariant[];
  observe?: (state: SearchState, groups: readonly ProductGroup[]) => void;
}>;

export type SearchRun = Readonly<{
  complete: SearchState[];
  groups: readonly ProductGroup[];
  expansionAttempts: number;
  mode: "bounded" | "exact";
  trimmed: boolean;
}>;

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
    delivered: new Map(exposure),
    exposure,
    nextGroupIndex: 0,
    pills: 0,
    pillCountKnown: true,
    price: 0,
    selectedVariantIds: [],
    selectedProductIds: []
  };
}

export function tryAddVariant(
  state: SearchState,
  variant: DoseVariant,
  group: ProductGroup,
  request: CanonicalRequest
): SearchState | null {
  const helpsPurchasableTarget = request.targets.some((target) => {
    if (isDeferredConditional(target)) {
      return false;
    }

    return variant.contributions.has(target.subjectId) || (variant.unknownSafetyAmount &&
      (group.product.contributionSubjectIds.includes(target.subjectId) || variant.unknownSubjectIds?.includes(target.subjectId)));
  });

  if (!helpsPurchasableTarget && !request.retainProductIds.includes(group.productId) &&
    !request.productDoses?.some(row => row.productId === group.productId) &&
    !request.retainSubjectIds.some((id) => (variant.safetyExposure?.get(id)?.units ?? BigInt(0)) > BigInt(0))) {
    return null;
  }

  if (state.selectedVariantIds.some((id) => group.variants.some((row) => row.variantId === id))) return null;
  const count = state.count + 1;
  const pills = state.pills + variant.dailyPills;

  // Checkout acquires one pack per selected product. Daily servings affect
  // depletion and replenishment, not the number of packs in this order.
  const price = state.price + group.product.unitPriceMinor;

  const delivered = cloneMap(state.delivered);
  const exposure = cloneMap(state.exposure);
  const safetyExposure =
    variant.safetyExposure ??
    labelledSafetyExposure(group.product, variant.dailyUnits, request);
  const additions = new Map(safetyExposure);
  for (const [id, amount] of variant.contributions) additions.set(id, amount);

  for (const [subjectId, amount] of additions) {
    const nextExposure =
      (exposure.get(subjectId) ?? BigInt(0)) + amount.units;

    exposure.set(subjectId, nextExposure);
  }

  for (const [subjectId, amount] of variant.contributions) {
    delivered.set(
      subjectId,
      (delivered.get(subjectId) ?? BigInt(0)) + amount.units
    );
  }

  return {
    count,
    delivered,
    exposure,
    nextGroupIndex: state.nextGroupIndex + 1,
    pills,
    pillCountKnown: state.pillCountKnown !== false && group.product.pillCountKnown !== false,
    price,
    selectedVariantIds: [...state.selectedVariantIds, variant.variantId],
    selectedProductIds: [...(state.selectedProductIds ?? []), group.productId],
    unknownProductIds: [...(state.unknownProductIds ?? []), ...(variant.unknownSafetyAmount ? [variant.productId] : [])]
  };
}

function skipGroup(state: SearchState): SearchState {
  return { ...state, nextGroupIndex: state.nextGroupIndex + 1 };
}

export function compareSearchStates(a: SearchState, b: SearchState, request: CanonicalRequest) {
  const fit = compareDoseFit(doseFitScore(request, a.exposure), doseFitScore(request, b.exposure));
  if (fit !== 0) return fit;
  // Use the final dose-first routine ordering during retention and repair.
  // Independent price extrema remain in reviewFrontier for cheaper choices.
  return comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) ||
    a.count - b.count || a.price - b.price || fingerprintState(a).localeCompare(fingerprintState(b));
}

/** Count actual attempted additions, including infeasible additions and repair.
 * Skipping a listing is not a candidate expansion. There are no untracked
 * fallback passes outside this budget. */
export function searchGroups(groups: readonly ProductGroup[], request: CanonicalRequest,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG, incumbents: readonly SearchState[] = [], strategy?: SearchStrategy): SearchRun {
  // Dynamic residual variants are scoped to this search. Cached catalogue
  // compilations remain immutable across customers and request revisions.
  groups = groups.map(group => ({ ...group, variants: [...group.variants] }));
  const baselineVariants = new Map(groups.map(group => [group.productId, [...group.variants]]));
  const order = strategy?.compare ?? ((a: SearchState, b: SearchState) => compareSearchStates(a, b, request));
  const variantsForState = (group: ProductGroup, state: SearchState, phaseLimit = limit): readonly DoseVariant[] => {
    const initial = baselineVariants.get(group.productId)!;
    if (request.productDoses?.some(row => row.productId === group.productId) || !initial.length) return initial;
    const step = servingIncrement(group.product);
    const result = new Map(initial.map(variant => [variant.variantId, variant]));
    for (const target of request.targets) {
      const perServing = initial[0]!.amountPerUnit.get(target.subjectId)?.units;
      if (!perServing || perServing <= 0 || isDeferredConditional(target)) continue;
      for (const tick of targetDoseTicks(request, target, perServing, step, state.exposure.get(target.subjectId) ?? BigInt(0))) {
        const ratio = { num: tick * step.num, den: step.den };
        const dailyUnits = Number(ratio.num) / Number(ratio.den);
        const id = `${group.sellerId}:${group.productId}:x${dailyUnits}`;
        let variant = group.variants.find(row => row.variantId === id);
        if (!variant) {
          variant = compileVariant({ product: group.product, request, dailyUnits, dailyUnitsRatio: ratio }) ?? undefined;
          if (variant) (group.variants as DoseVariant[]).push(variant);
        }
        if (variant) result.set(variant.variantId, variant);
      }
    }
    const base = [...result.values()];
    return strategy?.variants?.(group, state, base, variant => add(state, variant, group, phaseLimit)) ?? base;
  };
  const mustSelect = (group: ProductGroup) => request.productDoses?.some(row => row.productId === group.productId) || (request.retainProductIds.includes(group.productId) &&
    !request.currentSupplements.some((row) => row.productId === group.productId));
  const limit = Math.max(0, Math.floor(config.expansionBudget));
  let used = 0, trimmed = false;
  const archive = new Map<string, SearchState>();
  const remember = (state: SearchState) => {
    strategy?.observe?.(state, groups);
    archive.set(fingerprintState({ ...state, nextGroupIndex: groups.length }), state);
  };
  const seed = seedState(request);
  remember(seed);
  for (const state of incumbents) remember(state);
  const add = (state: SearchState, variant: DoseVariant, group: ProductGroup, phaseLimit = limit) => {
    if (used >= phaseLimit) { trimmed = true; return null; }
    used += 1;
    const next = tryAddVariant(state, variant, group, request);
    if (next) strategy?.observe?.(next, groups);
    return next;
  };
  const variantCount = groups.reduce((sum, group) => sum + group.variants.length, 0);
  const exact = groups.length <= config.exactGroupLimit && variantCount <= config.exactVariantLimit;
  if (exact) {
    const visit = (state: SearchState) => {
      if (state.nextGroupIndex >= groups.length) { remember(state); return; }
      const group = groups[state.nextGroupIndex]!;
      if (!mustSelect(group)) visit(skipGroup(state));
      for (const variant of variantsForState(group, state)) {
        if (used >= limit) { trimmed = true; remember(state); break; }
        const next = add(state, variant, group);
        if (next) visit(next);
      }
    };
    visit(seed);
    return { complete: [...archive.values()], groups, expansionAttempts: used, mode: trimmed ? "bounded" : "exact", trimmed };
  }
  // Reserve one fifth of bounded work for repairs. Otherwise a large set of
  // single-product pairs consumes every attempt before any leading basket can
  // be replaced or completed. This reservation is independent of basket size.
  const explorationLimit = limit - Math.floor(limit / 5);
  const single: { state: SearchState; group: ProductGroup; variant: DoseVariant }[] = [];
  for (const group of groups) {
    for (const variant of group.variants) {
      const state = add(seed, variant, group, explorationLimit);
      if (state) { single.push({ state, group, variant }); remember(state); }
      if (used >= explorationLimit) break;
    }
    if (used >= explorationLimit) break;
  }
  const width = Math.max(1, Math.min(config.initialBeamWidth, config.maxBeamWidth));
  const beamLimit = used + Math.floor((explorationLimit - used) * 0.55);
  let beam: SearchState[] = [seed];
  for (let index = 0; index < groups.length && used < beamLimit; index += 1) {
    const group = groups[index]!;
    // Leave each remaining group a deterministic share. Without this, early
    // quantity-rich products can exhaust the beam before later targets appear.
    const groupLimit = used + Math.floor((beamLimit - used) / (groups.length - index));
    const expanded: SearchState[] = [];
    for (const state of beam) {
      if (!mustSelect(group)) expanded.push({ ...state, nextGroupIndex: index + 1 });
      for (const variant of variantsForState(group, state, groupLimit)) {
        if (used >= groupLimit) { trimmed = true; break; }
        const next = add(state, variant, group, groupLimit);
        if (next) expanded.push({ ...next, nextGroupIndex: index + 1 });
      }
    }
    const unique = [...new Map(expanded.map(state => [fingerprintState(state), state])).values()];
    const ranked = unique.sort((a, b) => order(a, b));
    if (ranked.length > width) trimmed = true;
    // Reserve half the frontier for different remaining-gap patterns, including
    // weak standalone contributors that complement later products.
    const chosen = ranked.slice(0, Math.ceil(width / 2));
    if (strategy?.cohort) {
      const cohorts = [...new Set(ranked.map(strategy.cohort))].sort();
      if (cohorts.length > 1) {
        chosen.splice(0);
        const quota = Math.max(1, Math.floor(width / cohorts.length));
        for (const cohort of cohorts) chosen.push(...ranked.filter(row => strategy.cohort!(row) === cohort).slice(0, quota));
      }
    }
    const patterns = new Set(chosen.map(state => residualPattern(state, request)));
    for (const state of ranked) {
      if (strategy?.cohort && chosen.length >= width) break;
      const key = residualPattern(state, request);
      if (patterns.has(key)) continue;
      chosen.push(state); patterns.add(key);
      if (chosen.length >= width) break;
    }
    for (const state of ranked) {
      if (chosen.length >= width) break;
      if (!chosen.includes(state)) chosen.push(state);
    }
    beam = chosen;
  }
  for (const state of beam) remember(state);
  // Every pair of supported single-product quantities gets a deterministic
  // opportunity. This recovers complements without requiring either member
  // to rank highly on its own. Infeasible pairs consume attempts as well.
  for (let i = 0; i < single.length && used < explorationLimit; i += 1) {
    for (let j = i + 1; j < single.length && used < explorationLimit; j += 1) {
      const a = single[i]!, b = single[j]!;
      if (a.group.productId === b.group.productId) continue;
      const state = add(a.state, b.variant, b.group, explorationLimit);
      if (state) remember(state);
    }
  }
  // Give removal/rescaling neighborhoods an opportunity before spending the
  // remaining work on two additions to one basket. Removing a collateral SKU
  // can require changing a retained SKU's quantity at the same time.
  const replacementLimit = used + Math.floor((limit - used) * 0.75);
  const leaders = [...archive.values()].sort((a, b) => order(a, b)).slice(0, 4);
  const repairedBases: SearchState[] = [];
  for (const leader of leaders) {
    if (used >= replacementLimit) break;
    for (const removed of removalSets(leader.selectedVariantIds)) {
      let base: SearchState | null = seed;
      for (const id of leader.selectedVariantIds) {
        if (removed.includes(id)) continue;
        const group = groups.find(row => row.variants.some(v => v.variantId === id));
        const variant = group?.variants.find(row => row.variantId === id);
        if (!base || !group || !variant) { base = null; break; }
        base = add(base, variant, group, replacementLimit);
      }
      if (!base) continue;
      remember(base);
      repairedBases.push(base);
      for (const group of groups) {
        if (base.selectedProductIds?.includes(group.productId)) continue;
        for (const variant of variantsForState(group, base, replacementLimit)) {
          if (used >= replacementLimit) break;
          const state = add(base, variant, group, replacementLimit);
          if (state) { repairedBases.push(state); remember(state); }
        }
        if (used >= replacementLimit) break;
      }
      if (used >= replacementLimit) break;
    }
  }
  for (const state of repairedBases.sort((a, b) => order(a, b)).slice(0, width)) {
    for (const group of groups) {
      if (state.selectedProductIds?.includes(group.productId)) continue;
      for (const variant of variantsForState(group, state)) {
        if (used >= limit) break;
        const repaired = add(state, variant, group);
        if (repaired) remember(repaired);
      }
      if (used >= limit) break;
    }
    if (used >= limit) break;
  }
  if (used >= limit) trimmed = true;
  const all = [...archive.values()];
  const complete = reviewFrontier(all, request, incumbents, order, groups);
  trimmed ||= complete.length < all.length;
  return { complete, groups, expansionAttempts: used, mode: "bounded", trimmed };
}

/** Generate only neighborhoods the work budget can inspect, including when
 * customers request large baskets. Do not allocate all pairs in advance. */
function* removalSets(ids: readonly string[]): Generator<readonly string[]> {
  yield [];
  for (const id of ids) yield [id];
  for (let first = 0; first < ids.length; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) yield [ids[first]!, ids[second]!];
  }
}

export function residualPattern(state: SearchState, request: CanonicalRequest) {
  return request.targets.map(target => {
    const delivered = state.delivered.get(target.subjectId) ?? BigInt(0);
    if (target.requested.units <= 0) return "0";
    // Distinguish absent, partial, exact and excess contributions with ten
    // proportional bins. This is frontier diversity, never clinical scoring.
    return String(delivered * BigInt(10) / target.requested.units);
  }).join("|");
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
  request: CanonicalRequest,
  options?: Readonly<{ allowIncidentalBlock?: boolean }>
) {
  void options;
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



  return { exposure, safety, variants };
}

/** Full safety and conversational rendering runs on diverse bounded extrema,
 * not thousands of losing search states. This changes computational effort,
 * never the permitted number of products or quantities in a basket. */
export function reviewFrontier(states: readonly SearchState[], request: CanonicalRequest, incumbents: readonly SearchState[], order = (a: SearchState, b: SearchState) => compareSearchStates(a, b, request), groups: readonly ProductGroup[] = []) {
  if (states.length <= 192) return [...states];
  const fitOrder = [...states].sort((a, b) => order(a, b));
  const chosen = new Set<SearchState>([...incumbents, ...fitOrder.slice(0, 64)]);
  const nonempty = states.filter(row => row.count > 0);
  const targetIds = new Set(request.targets.map(row => row.subjectId));
  const focusedIds = new Set(groups.filter(group => {
    const facts = group.product.labelledContributions.filter(row => row.amount != null && row.amount > 0);
    return facts.length > 0 && facts.every(row => row.subjectId !== null && targetIds.has(row.subjectId));
  }).map(group => group.productId));
  const focused = nonempty.filter(row => row.count === 1 && row.selectedProductIds?.some(id => focusedIds.has(id))).sort(order)[0];
  if (focused) chosen.add(focused);
  for (const compare of [
    (a: SearchState, b: SearchState) => a.price - b.price || order(a, b),
    (a: SearchState, b: SearchState) => a.count - b.count || comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) || order(a, b),
    (a: SearchState, b: SearchState) => comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) || order(a, b)
  ]) for (const state of [...nonempty].sort(compare).slice(0, 24)) chosen.add(state);
  const protectedIds = new Set(request.targets.filter(row => row.importance === "core" || row.importance === "required").map(row => row.subjectId));
  if (protectedIds.size && request.targets.some(row => row.importance === "optional")) {
    const protectedFit = (state: SearchState) => doseFitScore(request, state.exposure).perTarget.filter(row => protectedIds.has(row.subjectId)).reduce((sum, row) => sum + row.under + row.over, 0);
    for (const state of [...states].sort((a, b) => protectedFit(a) - protectedFit(b) || order(a, b)).slice(0, 48)) chosen.add(state);
  }
  const patterns = new Set<string>();
  for (const state of fitOrder) {
    const key = residualPattern(state, request);
    if (patterns.has(key)) continue;
    patterns.add(key); chosen.add(state);
    if (patterns.size >= 48) break;
  }
  return [...chosen];
}
