import { add, fromDecimal, multiply, positive, subtract, ZERO } from "@/lib/matcher/rational";
import { targetDoseTicks } from "@/lib/matcher/target-basis";
import { servingIncrement } from "@/lib/matcher/serving-grid";
import { comparePillCounts } from "@/lib/matcher/pill-burden";
import { compileVariant, isDeferredConditional } from "@/lib/matcher/candidates";
import { compareDoseFit, numericalDoseFitScore, doseFitTargetDeviations, registerDoseFitChange } from "@/lib/matcher/dose-fit";
import { administrationBasisKnown, compareSearchStateScores, monthlyGoodsPrice, PRACTICAL_OBJECTIVES, requestForProfile } from "@/lib/matcher/practical-scoring";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { fingerprintState } from "@/lib/matcher/dominance";
import { aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
import { evaluateSafety, labelledSafetyExposure } from "@/lib/matcher/safety";
import { smallest } from "@/lib/matcher/top-k";
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

const variantMeasurements = new WeakMap<DoseVariant, { product: ProductGroup["product"]; burden: ReturnType<typeof multiply>; monthly: number | null; uncertain: number; contributionOnly: boolean; exposureSubjects: readonly string[] }>();

// Quantity arrays are immutable apart from append-only, physically compiled
// probes. A resumed/replaced array gets a fresh index; traversal order is unchanged.
const quantityIndices = new WeakMap<readonly DoseVariant[], { size: number; ids: Map<string, DoseVariant>; duplicates?: Map<string, DoseVariant> }>();
function quantityIndex(variants: readonly DoseVariant[]) {
  let index = quantityIndices.get(variants);
  if (!index || index.size > variants.length) { index = { size: 0, ids: new Map() }; quantityIndices.set(variants, index); }
  while (index.size < variants.length) {
    const variant = variants[index.size++]!;
    if (!index.ids.has(variant.variantId)) index.ids.set(variant.variantId, variant);
    else (index.duplicates ??= new Map()).set(variant.variantId, variant);
  }
  return index;
}
export function quantityById(variants: readonly DoseVariant[], id: string, last = false) {
  const index = quantityIndex(variants);
  return (last ? index.duplicates?.get(id) : undefined) ?? index.ids.get(id);
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
    routineServings: [], servingBurden: ZERO, uncertainAdministrationCount: 0, monthlyPriceMinor: 0, monthlyPriceLowerBound: 0,
    count: 0,
    delivered: exposure,
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

  const quantities = quantityIndex(group.variants).ids;
  if (state.selectedVariantIds.some((id) => quantities.has(id))) return null;
  const count = state.count + 1;
  const pills = state.pills + variant.dailyPills;

  // Checkout acquires one pack per selected product. Daily servings affect
  // depletion and replenishment, not the number of packs in this order.
  const price = state.price + group.product.unitPriceMinor;
  const safetyExposure = variant.safetyExposure ?? labelledSafetyExposure(group.product, variant.dailyUnits, request);
  let measured = variantMeasurements.get(variant);
  if (measured?.product !== group.product) {
    const excess = positive(subtract(variant.dailyUnitsRatio ?? fromDecimal(variant.dailyUnits), fromDecimal(1)));
    measured = { product: group.product, burden: multiply(excess, excess),
      monthly: monthlyGoodsPrice(group.product, variant.dailyUnits, variant.dailyUnitsRatio), uncertain: Number(!administrationBasisKnown(group.product)),
      contributionOnly: safetyExposure.size === variant.contributions.size && [...safetyExposure].every(([id, amount]) => variant.contributions.get(id)?.units === amount.units),
      exposureSubjects: [...new Set([...safetyExposure.keys(), ...variant.contributions.keys()])] };
    variantMeasurements.set(variant, measured);
  }
  const monthly = measured.monthly;

  const exposure = new Map(state.exposure);
  for (const [id, amount] of safetyExposure) exposure.set(id, (state.exposure.get(id) ?? BigInt(0)) + amount.units);
  // A verified contribution replaces the same label's amount; it is not added twice.
  if (!measured.contributionOnly) for (const [id, amount] of variant.contributions) exposure.set(id, (state.exposure.get(id) ?? BigInt(0)) + amount.units);
  const delivered = measured.contributionOnly && state.delivered === state.exposure ? exposure : new Map(state.delivered);
  if (delivered !== exposure) for (const [id, amount] of variant.contributions) {
    delivered.set(id, (delivered.get(id) ?? BigInt(0)) + amount.units);
  }
  // Broad changes use the full evaluator; do not retain parent maps for them.
  if (measured.exposureSubjects.length * 3 <= request.targets.length) registerDoseFitChange(exposure, state.exposure, measured.exposureSubjects);
  return {
    routineServings: [...(state.routineServings ?? []), variant.dailyUnits],
    servingBurden: add(state.servingBurden ?? ZERO, measured.burden),
    uncertainAdministrationCount: (state.uncertainAdministrationCount ?? state.count) + measured.uncertain,
    monthlyPriceMinor: state.monthlyPriceMinor === null || monthly === null ? null : (state.monthlyPriceMinor ?? 0) + monthly,
    monthlyPriceLowerBound: (state.monthlyPriceLowerBound ?? 0) + (monthly ?? 0),
    count,
    delivered,
    exposure,
    nextGroupIndex: state.nextGroupIndex + 1,
    pills,
    pillCountKnown: state.pillCountKnown !== false && group.product.pillCountKnown !== false,
    price,
    selectedVariantIds: [...state.selectedVariantIds, variant.variantId],
    selectedProductIds: [...(state.selectedProductIds ?? []), group.productId],
    unknownProductIds: variant.unknownSafetyAmount ? [...(state.unknownProductIds ?? []), variant.productId] : state.unknownProductIds ?? []
  };
}

function skipGroup(state: SearchState): SearchState {
  return { ...state, nextGroupIndex: state.nextGroupIndex + 1 };
}

export function compareSearchStates(a: SearchState, b: SearchState, request: CanonicalRequest) {
  if (a === b) return 0;
  const practical = compareSearchStateScores(request, a, b);
  if (practical !== 0) return practical;
  const fit = compareDoseFit(numericalDoseFitScore(request, a.exposure), numericalDoseFitScore(request, b.exposure));
  if (fit !== 0) return fit;
  // Use the final dose-first routine ordering during retention and repair.
  // Independent price extrema remain in reviewFrontier for cheaper choices.
  return comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) ||
    a.count - b.count || a.price - b.price || fingerprintState(a).localeCompare(fingerprintState(b));
}

/** Representatives share one explored pool and one expansion budget. */
export function profileLeaders(states: readonly SearchState[], request: CanonicalRequest, limit: number): SearchState[] {
  const chosen = new Set<SearchState>();
  const closest = states.reduce<SearchState | undefined>((best, state) => !best ||
    (compareDoseFit(numericalDoseFitScore(request, state.exposure), numericalDoseFitScore(request, best.exposure)) || compareSearchStates(state, best, request)) < 0 ? state : best, undefined);
  if (closest) chosen.add(closest);
  for (const objective of [request.optimization, ...PRACTICAL_OBJECTIVES.filter(value => value !== request.optimization)]) {
    const profile = requestForProfile(request, objective);
    const best = states.reduce<SearchState | undefined>((previous, state) => !previous || compareSearchStates(state, previous, profile) < 0 ? state : previous, undefined);
    if (best) chosen.add(best);
    if (chosen.size >= limit) break;
  }
  return [...chosen];
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
        let variant = quantityById(group.variants, id);
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

const residualPatterns = new WeakMap<CanonicalRequest, WeakMap<SearchState["delivered"], string>>();
export function residualPattern(state: SearchState, request: CanonicalRequest) {
  let cache = residualPatterns.get(request);
  if (!cache) { cache = new WeakMap(); residualPatterns.set(request, cache); }
  let pattern = cache.get(state.delivered);
  if (pattern !== undefined) return pattern;
  pattern = request.targets.map(target => {
    const delivered = state.delivered.get(target.subjectId) ?? BigInt(0);
    if (target.requested.units <= 0) return "0";
    // Distinguish absent, partial, exact and excess contributions with ten
    // proportional bins. This is frontier diversity, never clinical scoring.
    return String(delivered * BigInt(10) / target.requested.units);
  }).join("|");
  cache.set(state.delivered, pattern);
  return pattern;
}

/** Build after quantity exploration, then share across final basket validation.
 * Last duplicate wins, both within a group and across groups. */
export function indexVariants(groups: readonly ProductGroup[]) {
  const byId = new Map<string, DoseVariant>();
  for (const group of groups) for (const variant of group.variants) byId.set(variant.variantId, variant);
  return byId;
}

export function reconstructVariants(
  groups: readonly ProductGroup[],
  variantIds: readonly string[],
  byId?: ReadonlyMap<string, DoseVariant>
) {
  if (!byId) {
    // Standalone callers already have append-aware quantity indices. Only the
    // batch finalizer needs a full cross-group index; reuse cached lookups here.
    const selected = new Map<string, DoseVariant>();
    for (const group of groups) for (const id of variantIds) {
      const variant = quantityById(group.variants, id, true);
      if (variant) selected.set(id, variant);
    }
    byId = selected;
  }
  const resolved = byId;
  return variantIds
    .map((id) => resolved.get(id))
    .filter((item): item is DoseVariant => Boolean(item));
}

export function revalidateState(
  state: SearchState,
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  variantsById?: ReadonlyMap<string, DoseVariant>
) {
  const variants = reconstructVariants(groups, state.selectedVariantIds, variantsById);
  const exposure = aggregateDailyExposure({
    current: request.currentSupplements,
    variants
  });

  if (isDoseError(exposure)) {
    return null;
  }

  const safety = evaluateSafety({
    exposure,
    preparedExposure: state.exposure,
    products: groups.map((item) => item.product),
    request,
    variants
  });



  return { exposure, safety, variants };
}

/** Full safety and conversational rendering runs on diverse bounded extrema,
 * not thousands of losing search states. This changes computational effort,
 * never the permitted number of products or quantities in a basket. */
type FrontierFacts = { deviations: ReturnType<typeof doseFitTargetDeviations>; losses?: Map<string, number>; protectedLoss?: number };
const frontierFacts = new WeakMap<CanonicalRequest, WeakMap<SearchState["exposure"], FrontierFacts>>();
function frontierFactsFor(state: SearchState, request: CanonicalRequest) {
  let cache = frontierFacts.get(request);
  if (!cache) { cache = new WeakMap(); frontierFacts.set(request, cache); }
  let facts = cache.get(state.exposure);
  if (!facts) {
    facts = { deviations: doseFitTargetDeviations(numericalDoseFitScore(request, state.exposure)) };
    cache.set(state.exposure, facts);
  }
  return facts;
}
export function reviewFrontier(states: readonly SearchState[], request: CanonicalRequest, incumbents: readonly SearchState[], order = (a: SearchState, b: SearchState) => compareSearchStates(a, b, request), groups: readonly ProductGroup[] = []) {
  if (states.length <= 192) return [...states];
  const doseOrder = (a: SearchState, b: SearchState) => compareDoseFit(numericalDoseFitScore(request, a.exposure), numericalDoseFitScore(request, b.exposure)) || order(a, b);
  const chosen = new Set<SearchState>([...incumbents, ...smallest(states, 16, doseOrder)]);
  // A close fit on one target can become the best complete basket after a
  // complementary addition, despite losing every aggregate/profile ranking.
  const protectedIds = new Set(request.targets.filter(row => row.importance === "core" || row.importance === "required").map(row => row.subjectId));
  const facts = (state: SearchState) => frontierFactsFor(state, request);
  // Most rejected candidates fail this short-circuit scan immediately. Cache
  // comparison facts only when the target or protected-fit rankings use them.
  const additiveBases = states.filter(state => doseFitTargetDeviations(numericalDoseFitScore(request, state.exposure)).every(row => row.over === 0));
  for (const target of request.targets.filter(row => !isDeferredConditional(row)).slice(0, 32)) {
    const deviation = (state: SearchState) => {
      const value = facts(state), losses = value.losses ??= new Map();
      let loss = losses.get(target.subjectId);
      if (loss === undefined) {
        const row = value.deviations.find(row => row.subjectId === target.subjectId);
        loss = row ? row.under + row.over : Infinity; losses.set(target.subjectId, loss);
      }
      return loss;
    };
    const reference = smallest(additiveBases, 1, (a,b)=>deviation(a)-deviation(b) || doseOrder(a,b))[0];
    if (reference) chosen.add(reference);
  }
  for (const objective of PRACTICAL_OBJECTIVES) {
    const profile = requestForProfile(request, objective);
    for (const state of smallest(states, 12, (a, b) => compareSearchStates(a, b, profile))) chosen.add(state);
  }
  const nonempty = states.filter(row => row.count > 0);
  const targetIds = new Set(request.targets.map(row => row.subjectId));
  const focusedIds = new Set(groups.filter(group => {
    const facts = group.product.labelledContributions.filter(row => row.amount != null && row.amount > 0);
    return facts.length > 0 && facts.every(row => row.subjectId !== null && targetIds.has(row.subjectId));
  }).map(group => group.productId));
  const focused = smallest(nonempty.filter(row => row.count === 1 && row.selectedProductIds?.some(id => focusedIds.has(id))), 1, order)[0];
  if (focused) chosen.add(focused);
  for (const compare of [
    (a: SearchState, b: SearchState) => a.price - b.price || order(a, b),
    (a: SearchState, b: SearchState) => a.count - b.count || comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) || order(a, b),
    (a: SearchState, b: SearchState) => comparePillCounts(a.pills, a.pillCountKnown, b.pills, b.pillCountKnown) || order(a, b)
  ]) for (const state of smallest(nonempty, 24, compare)) chosen.add(state);
  if (protectedIds.size && request.targets.some(row => row.importance === "optional")) {
    const protectedFit = (state: SearchState) => {
      const value = facts(state);
      return value.protectedLoss ??= value.deviations.filter(row => protectedIds.has(row.subjectId)).reduce((sum, row) => sum + row.under + row.over, 0);
    };
    for (const state of smallest(states, 48, (a, b) => protectedFit(a) - protectedFit(b) || order(a, b))) chosen.add(state);
  }
  const patterns = new Map<string, { state: SearchState; index: number }>();
  for (let index = 0; index < states.length; index++) {
    const state = states[index]!;
    const key = residualPattern(state, request);
    const previous = patterns.get(key);
    if (!previous || order(state, previous.state) < 0) patterns.set(key, { state, index });
  }
  // The first member of each bin in a stable full sort is its stable minimum.
  // Order only those representatives, retaining the original cross-bin tie order.
  for (const row of smallest([...patterns.values()], 48, (a, b) => order(a.state, b.state) || a.index - b.index)) chosen.add(row.state);
  return [...chosen];
}
