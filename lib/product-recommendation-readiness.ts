import type { FormulationResult } from "@/lib/formulation-types";

export function resultHasProductStackRows(
  result: FormulationResult,
  stackPreference: "balanced" | "compact",
) {
  const option = result.productRecommendationOptions?.find(
    (item) => item.id === stackPreference,
  );

  if (option) {
    return option.recommendations.length > 0;
  }

  const mainStackPreference =
    result.productRecommendations?.stackPreference ??
    (result.productRecommendations ? "balanced" : null);

  return (
    mainStackPreference === stackPreference && result.recommendations.length > 0
  );
}

function productRecommendationSummaryExpectsRows(
  summary: FormulationResult["productRecommendations"] | undefined,
) {
  if (!summary || !["partial", "ready"].includes(summary.status)) {
    return false;
  }

  if (summary.matchedCount > 0) {
    return true;
  }

  if (summary.stackCoveragePercent > 0) {
    return true;
  }

  return Boolean(
    summary.needCoverage?.some((item) => item.coveragePercent > 0),
  );
}

export function resultHasTransientEmptyProductRecommendations(
  result: FormulationResult,
) {
  if (result.access === "preview") {
    return false;
  }

  const mainRunNeedsRows =
    productRecommendationSummaryExpectsRows(result.productRecommendations) &&
    result.recommendations.length < 1;
  const optionNeedsRows = Boolean(
    result.productRecommendationOptions?.some(
      (option) =>
        productRecommendationSummaryExpectsRows(
          option.productRecommendations,
        ) && option.recommendations.length < 1,
    ),
  );

  return mainRunNeedsRows || optionNeedsRows;
}

export function resultHasPendingProductRecommendations(
  result: FormulationResult,
) {
  if (result.access === "preview") {
    return false;
  }

  const productStatus = result.productRecommendations?.status;

  if (productStatus === "pending") {
    return true;
  }

  if (resultHasTransientEmptyProductRecommendations(result)) {
    return true;
  }

  return Boolean(
    !productStatus &&
      result.sectionStatuses?.foods === "ready" &&
      result.sectionStatuses?.supplements === "ready",
  );
}
