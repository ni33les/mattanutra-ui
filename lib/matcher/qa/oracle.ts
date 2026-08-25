import { compileGroups } from "@/lib/matcher/candidates";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { aggregateCoverage } from "@/lib/matcher/dominance";
import { scoreState, selectOptions } from "@/lib/matcher/selector";
import { seedState, tryAddVariant } from "@/lib/matcher/search";
import type {
  CanonicalRequest,
  CatalogSnapshot,
  MatcherConfig,
  ProductGroup,
  ScoredBasket,
  SearchState
} from "@/lib/matcher/types";

const ORACLE_EXPANSION_LIMIT = 20_000;
const ORACLE_GROUP_LIMIT = 12;

function isUseful(state: SearchState, request: CanonicalRequest) {
  return aggregateCoverage(request, state.delivered) > 0 || state.count > 0;
}

function exhaustiveStates(
  groups: readonly ProductGroup[],
  request: CanonicalRequest
) {
  const complete: SearchState[] = [];
  let remaining = ORACLE_EXPANSION_LIMIT;

  const dfs = (state: SearchState) => {
    remaining -= 1;

    if (remaining < 0) {
      return;
    }

    if (state.nextGroupIndex >= groups.length) {
      if (isUseful(state, request)) {
        complete.push(state);
      }

      return;
    }

    const group = groups[state.nextGroupIndex]!;
    dfs({ ...state, nextGroupIndex: state.nextGroupIndex + 1 });

    for (const variant of group.variants) {
      const next = tryAddVariant(state, variant, group, request);

      if (next) {
        dfs(next);
      }
    }
  };

  dfs(seedState(request));
  return { complete, trimmed: remaining < 0 };
}

export function bruteForceMatch(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  config: MatcherConfig = DEFAULT_MATCHER_CONFIG
): { selected: ScoredBasket | null; trimmed: boolean } {
  const groups = compileGroups(request, catalog).slice(0, ORACLE_GROUP_LIMIT);
  const run = exhaustiveStates(groups, request);
  const scored: ScoredBasket[] = [];

  for (const state of run.complete) {
    const variantId = state.selectedVariantIds[0];
    const marker = variantId?.lastIndexOf(":x") ?? -1;
    const productId =
      variantId && marker >= 0 ? variantId.slice(0, marker) : variantId;
    const sellerId =
      groups.find((item) => item.productId === productId)?.sellerId ??
      groups[0]?.sellerId ??
      "seller_th";
    const basket = scoreState({ groups, request, sellerId, state });

    if (basket) {
      scored.push(basket);
    }
  }

  return {
    selected: selectOptions({ baskets: scored, config, request }).selected,
    trimmed: run.trimmed
  };
}

export function mulberry32(seed: number) {
  let next = seed >>> 0;

  return () => {
    next += 0x6d2b79f5;
    let z = next;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickCatalog(
  catalog: CatalogSnapshot,
  count: number,
  seed: number
): CatalogSnapshot {
  const random = mulberry32(seed);
  const pool = [...catalog.products];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = pool[index]!;
    pool[index] = pool[swap]!;
    pool[swap] = current;
  }

  return {
    availabilityAsOf: catalog.availabilityAsOf,
    catalogueVersion: `${catalog.catalogueVersion}:rng-${seed}`,
    products: pool.slice(0, Math.min(count, pool.length))
  };
}
