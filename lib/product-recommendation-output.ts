import type { RecommendedProduct } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import type {
  ProductPlatform,
  ProductRecommendationSelection
} from "@/lib/product-recommendation-types";

function marketplaceName(platform: ProductPlatform): RecommendedProduct["marketplace"] {
  if (platform === "lazada") {
    return "Lazada Thailand";
  }

  return platform === "shopee" ? "Shopee Thailand" : "Imported product";
}

export function toRecommendedProduct(
  selection: ProductRecommendationSelection,
  stackCoveragePercent: number,
  recommendationRunId?: string,
  locale: Locale = "en"
) {
  const localizedTitle =
    selection.product.translations?.[locale]?.title?.trim() ||
    selection.product.translations?.en?.title?.trim() ||
    selection.product.title;

  return {
    affiliate: selection.affiliate,
    covers: selection.coveredNeeds.map((need) => need.sourceId),
    description: selection.why,
    id: selection.product.id,
    imageUrl: selection.product.imageUrl ?? null,
    marketplace: marketplaceName(selection.product.platform),
    name: localizedTitle,
    price:
      selection.product.priceAmount && selection.product.priceAmount > 0
        ? {
            amount: selection.product.priceAmount,
            currency: selection.product.currency || "THB"
          }
        : null,
    priority: selection.rank,
    productCoveragePercent: selection.productCoveragePercent,
    productId: selection.product.id,
    rank: selection.rank,
    recommendationRunId,
    servingMultiplier: selection.servingMultiplier > 1
      ? selection.servingMultiplier
      : undefined,
    stackContributionPercent: selection.stackContributionPercent,
    stackCoveragePercent,
    tag: selection.affiliate ? "Best match + affiliate" : "Best match",
    url: selection.url
  } satisfies RecommendedProduct;
}
