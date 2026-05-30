import type {
  FormulationResult,
  ProductRecommendationOption,
  ProductStackPreference,
} from "@/lib/formulation-types";

export function productRecommendationOptionsForResult(
  result: FormulationResult,
) {
  if (result.productRecommendationOptions?.length) {
    return result.productRecommendationOptions;
  }

  if (!result.productRecommendations) {
    return [];
  }

  return [
    {
      id: result.productRecommendations.stackPreference ?? "balanced",
      productRecommendations: result.productRecommendations,
      recommendations: result.recommendations,
    },
  ] satisfies ProductRecommendationOption[];
}

export function selectProductRecommendationOption(
  options: readonly ProductRecommendationOption[],
  selectedPreference: ProductStackPreference | null,
) {
  return (
    options.find((option) => option.id === selectedPreference) ??
    options.find((option) => option.id === "balanced") ??
    options[0]
  );
}

export function defaultProductStackPreferenceForResult(
  result: FormulationResult,
): ProductStackPreference | null {
  const options = productRecommendationOptionsForResult(result);

  return (
    options.find((option) => option.id === "balanced")?.id ??
    result.productRecommendations?.stackPreference ??
    options[0]?.id ??
    null
  );
}
