import type {
  FormulationIngredient,
  FormulationResult,
  RecommendedProduct
} from "@/lib/formulation-types";

export const FREE_PREVIEW_SUPPLEMENT_LIMIT = 3;

export function isExampleFormulationModelVersion(value: unknown) {
  return typeof value === "string" && value.endsWith(":example");
}

function visibleIngredient(ingredient: FormulationIngredient) {
  return ingredient.safety?.visibility !== "hidden";
}

function effectivenessRank(
  ingredient: FormulationIngredient,
  index: number
) {
  return Number.isFinite(ingredient.effectivenessRank) &&
    ingredient.effectivenessRank > 0
    ? ingredient.effectivenessRank
    : index + 1;
}

function filterRecommendations(
  recommendations: RecommendedProduct[],
  allowedIngredientIds: Set<string>
) {
  return recommendations
    .map((product) => ({
      ...product,
      covers: product.covers.filter((ingredientId) =>
        allowedIngredientIds.has(ingredientId)
      )
    }))
    .filter((product) => product.covers.length > 0);
}

export function toFreePreviewFormulationResult(
  result: FormulationResult,
  limit = FREE_PREVIEW_SUPPLEMENT_LIMIT
) {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const visibleRankedIngredients = result.supplementBreakdown
    .map((ingredient, index) => ({
      ingredient,
      rank: effectivenessRank(ingredient, index)
    }))
    .filter(({ ingredient }) => visibleIngredient(ingredient))
    .sort((first, second) => first.rank - second.rank);
  const previewIngredientIds = new Set(
    visibleRankedIngredients
      .slice(0, normalizedLimit)
      .map(({ ingredient }) => ingredient.id)
  );
  const previewIngredients = result.supplementBreakdown.filter((ingredient) =>
    previewIngredientIds.has(ingredient.id)
  );

  return {
    ...result,
    access: "preview",
    lockedSupplementCount: Math.max(
      0,
      visibleRankedIngredients.length - previewIngredients.length
    ),
    previewLimit: normalizedLimit,
    recommendations: filterRecommendations(
      result.recommendations,
      previewIngredientIds
    ),
    supplementBreakdown: previewIngredients,
    totalSupplementCount: visibleRankedIngredients.length
  } satisfies FormulationResult;
}
