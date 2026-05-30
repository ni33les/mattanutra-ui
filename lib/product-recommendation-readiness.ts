import type { FormulationResult } from "@/lib/formulation-types";

function productRecommendationSummaryExpectsRows(
  summary: FormulationResult["productRecommendations"] | undefined,
) {
  if (!summary || !["partial", "ready"].includes(summary.status)) {
    return false;
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
