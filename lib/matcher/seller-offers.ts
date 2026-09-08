import { isDeepStrictEqual } from "node:util";
import type { ProductGroup, SearchState } from "@/lib/matcher/types";

/** Commercial comparison of an already explored physical basket. It neither
 * adds a product nor probes another quantity. A seller must carry every item
 * with identical verified dose facts; partial seller baskets cannot be mixed. */
export function equivalentSellerOffers(state: SearchState, source: readonly ProductGroup[], offers: readonly ProductGroup[]) {
  if (!state.count) return [];
  const selected = state.selectedVariantIds.map(id => {
    const group = source.find(row => row.variants.some(variant => variant.variantId === id));
    if (!group) throw new Error("Explored basket lost its source offer");
    return { group, variant: group.variants.find(row => row.variantId === id)! };
  });
  const result: { sellerId: string; state: SearchState; groups: ProductGroup[] }[] = [];
  for (const sellerId of [...new Set(offers.map(row => row.sellerId))].sort()) {
    if (sellerId === selected[0]!.group.sellerId) continue;
    const replacements = selected.map(({ group, variant }) => {
      const other = offers.find(row => row.sellerId === sellerId && row.productId === group.productId && !row.product.incompleteCommercialFacts);
      if (!other || !isDeepStrictEqual(other.product.administration, group.product.administration) ||
        !isDeepStrictEqual(other.product.labelledContributions, group.product.labelledContributions) ||
        other.product.pillCountKnown !== group.product.pillCountKnown) return null;
      const replacement = other.variants.find(row => row.dailyUnits === variant.dailyUnits);
      if (!replacement || !isDeepStrictEqual({ ...replacement, variantId: "" }, { ...variant, variantId: "" })) return null;
      return { group: other, variant: replacement };
    });
    if (replacements.some(row => row === null)) continue;
    const valid = replacements.filter(row => row !== null);
    result.push({ sellerId, groups: valid.map(row => row.group), state: { ...state,
      price: valid.reduce((sum, row) => sum + row.group.product.unitPriceMinor, 0),
      selectedVariantIds: valid.map(row => row.variant.variantId) } });
  }
  return result;
}
