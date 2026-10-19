import { compileVariant } from "@/lib/matcher/candidates";
import type { CanonicalRequest, MatcherProduct, ScaledAmount, ScoredBasket } from "@/lib/matcher/types";
import type { ProductRecommendationNeed } from "@/lib/product-recommendation-types";
import type { SelectionCoverageSnapshot, StoredCoverageAmount } from "@/lib/matcher/selection-coverage";

function storedAmount(amount: ScaledAmount): StoredCoverageAmount {
  return { ...amount, units: amount.units.toString() };
}

/** Save exact contribution evidence with each immutable recommendation option. */
export function freezeSelectionCoverage(input: Readonly<{
  request: CanonicalRequest;
  needs: readonly ProductRecommendationNeed[];
  products: readonly MatcherProduct[];
  basket: Pick<ScoredBasket, "productIds" | "variantDoses">;
}>): SelectionCoverageSnapshot | undefined {
  const products: SelectionCoverageSnapshot["products"][number][] = [];
  for (const productId of input.basket.productIds) {
    const product = input.products.find(row => row.productId === productId);
    const dose = input.basket.variantDoses?.find(row => row.productId === productId);
    if (!product || !dose) return undefined;
    const variant = compileVariant({ product, request: input.request, dailyUnits: dose.dailyUnits });
    if (!variant) return undefined;
    products.push({ productId, dailyUnits: dose.dailyUnits, contributions: [...variant.contributions.values()].map(storedAmount) });
  }
  return {
    version: 1,
    needs: input.needs.filter(row => row.itemType !== "food").map(({ id, sourceId, normalizedName, displayName, itemType }) => ({ id, sourceId, normalizedName, displayName, itemType })),
    targets: input.request.targets.map(target => ({ ...target, requested: storedAmount(target.requested) })),
    currentSupplements: input.request.currentSupplements.map(row => ({ ...row, daily: storedAmount(row.daily) })),
    dietaryIntake: (input.request.dietaryIntake ?? []).map(row => ({ ...row, daily: storedAmount(row.daily) })),
    unknownIntakeSubjectIds: [...input.request.unknownIntakeSubjectIds ?? []],
    estimatedIntakeSubjectIds: [...input.request.estimatedIntakeSubjectIds ?? []],
    products
  };
}
