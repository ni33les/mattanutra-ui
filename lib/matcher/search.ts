import { isDeferredConditional } from "@/lib/matcher/candidates";
import { compareDoseFit, doseFitScore } from "@/lib/matcher/dose-fit";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { aggregateCoverage, fingerprintState, paretoPrune } from "@/lib/matcher/dominance";
import { aggregateDailyExposure, isDoseError } from "@/lib/matcher/dose";
import { evaluateSafety, labelledSafetyExposure } from "@/lib/matcher/safety";
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


    return variant.contributions.has(target.subjectId);
  });

  if (!helpsPurchasableTarget && !request.retainProductIds.includes(group.productId) &&
    !request.productDoses?.some(row => row.productId === group.productId) &&
    !request.retainSubjectIds.some((id) => (variant.safetyExposure?.get(id)?.units ?? BigInt(0)) > BigInt(0))) {
    return null;
  }


  if (state.selectedVariantIds.some((id) => group.variants.some((row) => row.variantId === id))) return null;
  const count = state.count + 1;
  const remainingRetainedCount = request.retainProductIds.filter((id) => id !== group.productId &&
    !state.selectedProductIds?.includes(id) && !request.currentSupplements.some((row) => row.productId === id)).length;

  if (request.maxProductCount != null && count + remainingRetainedCount > request.maxProductCount) {
    return null;
  }

  const pills = state.pills + variant.dailyPills;

  if (request.maxDailyPills != null && pills > request.maxDailyPills) {
    return null;
  }

  // Checkout acquires one pack per selected product. Daily servings affect
  // depletion and replenishment, not the number of packs in this order.
  const price = state.price + group.product.unitPriceMinor;

  if (request.maxPriceMinor != null && price > request.maxPriceMinor) {
    return null;
  }

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
    price,
    selectedVariantIds: [...state.selectedVariantIds, variant.variantId],
    selectedProductIds: [...(state.selectedProductIds ?? []), group.productId],
    unknownProductIds: [...(state.unknownProductIds ?? []), ...(variant.unknownSafetyAmount ? [variant.productId] : [])]
  };
}

function skipGroup(state: SearchState): SearchState {
  return { ...state, nextGroupIndex: state.nextGroupIndex + 1 };
}

function compareStates(a: SearchState, b: SearchState, request: CanonicalRequest) {
  const fit = compareDoseFit(doseFitScore(request, a.exposure), doseFitScore(request, b.exposure));
  if (fit !== 0) return fit;
  // Explore the same bounded frontier for every commercial objective. Otherwise
  // an early pill/cost tie can discard a branch with a better eventual dose fit.
  // The requested commercial tie-break is applied to the completed candidates.
  const coverage = aggregateCoverage(request, b.delivered) - aggregateCoverage(request, a.delivered);
  if (coverage !== 0) return coverage;
  return a.price - b.price || a.pills - b.pills || a.count - b.count || fingerprintState(a).localeCompare(fingerprintState(b));
}

export function searchGroups(groups: readonly ProductGroup[], request: CanonicalRequest,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG): SearchRun {
  const mustSelect = (group: ProductGroup) => request.productDoses?.some(row => row.productId === group.productId) || (request.retainProductIds.includes(group.productId) &&
    !request.currentSupplements.some((row) => row.productId === group.productId));
  const variantCount = groups.reduce((sum, group) => sum + group.variants.length, 0);
  const exact = groups.length <= config.exactGroupLimit && variantCount <= config.exactVariantLimit;
  const complete: SearchState[] = [];
  let remaining = Math.max(0, Math.floor(config.expansionBudget));
  let trimmed = false;
  if (exact) {
    const visit = (state: SearchState) => {
      if (remaining <= 0) { trimmed = true; complete.push(state); return; }
      remaining -= 1;
      if (state.nextGroupIndex >= groups.length) { complete.push(state); return; }
      const group = groups[state.nextGroupIndex]!;
      // The zero-purchase branch is equally valid and cannot disappear on timeout.
      if (!mustSelect(group)) visit(skipGroup(state));
      for (const variant of group.variants) {
        if (remaining <= 0) { trimmed = true; break; }
        const next = tryAddVariant(state, variant, group, request);
        if (next) visit(next);
      }
    };
    visit(seedState(request));
    return { complete, mode: trimmed ? "bounded" : "exact", trimmed };
  }
  let beam: SearchState[] = [seedState(request)];
  const width = Math.max(1, Math.min(config.initialBeamWidth, config.maxBeamWidth));
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const expanded: SearchState[] = [];
    for (const state of beam) {
      if (remaining <= 0) { trimmed = true; expanded.push(state); continue; }
      remaining -= 1;
      if (!mustSelect(group)) expanded.push(skipGroup(state));
      for (const variant of group.variants) {
        const next = tryAddVariant(state, variant, group, request);
        if (next) expanded.push(next);
      }
    }
    const unique = [...new Map(expanded.map((state) => [fingerprintState(state), state])).values()];
    const layer = paretoPrune(unique, request);
    if (layer.length > width) trimmed = true;
    beam = [...layer].sort((a, b) => compareStates(a, b, request)).slice(0, width);
    if (remaining <= 0) break;
  }
  return { complete: beam, mode: "bounded", trimmed };
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
