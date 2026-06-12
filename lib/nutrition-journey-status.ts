import type {
  FormulationIngredient,
  FormulationResult
} from "@/lib/formulation-types";

export type NutritionJourneyStatus =
  | "healthscore_only"
  | "formulation_pending"
  | "formulation_ready"
  | "product_matching_pending"
  | "checkout_ready"
  | "failed"
  | "stale";

export type NutritionJourneyStatusInput = Readonly<{
  assessmentStatus?: string | null;
  formula?: Pick<
    FormulationResult,
    "productRecommendations" | "recommendations" | "sectionStatuses" | "supplementBreakdown"
  > | null;
  hasPaidPlan?: boolean;
  hasStaleSnapshot?: boolean;
  taskStatuses?: readonly string[];
}>;

const activeTaskStatuses = new Set(["queued", "reserved", "running", "waiting_approval"]);
const failedTaskStatuses = new Set(["failed", "cancelled"]);

export function visibleFormulaIngredients(
  ingredients: readonly FormulationIngredient[]
) {
  return ingredients.filter((ingredient) => ingredient.safety?.visibility !== "hidden");
}

export function visibleSupplementIngredientCount(
  ingredients: readonly FormulationIngredient[] | null | undefined
) {
  return visibleFormulaIngredients(ingredients ?? []).length;
}

export function visibleSupplementRecommendationCount(
  result: Pick<FormulationResult, "supplementBreakdown"> | null | undefined
) {
  return visibleSupplementIngredientCount(result?.supplementBreakdown);
}

export function hiddenSafetyIngredientCount(
  result: Pick<FormulationResult, "supplementBreakdown"> | null | undefined
) {
  return (result?.supplementBreakdown ?? []).filter(
    (ingredient) => ingredient.safety?.visibility === "hidden"
  ).length;
}

export function nutritionJourneyStatus({
  assessmentStatus,
  formula,
  hasPaidPlan,
  hasStaleSnapshot,
  taskStatuses = []
}: NutritionJourneyStatusInput): NutritionJourneyStatus {
  if (hasStaleSnapshot) {
    return "stale";
  }

  if (
    assessmentStatus === "failed" ||
    taskStatuses.some((status) => failedTaskStatuses.has(status))
  ) {
    return "failed";
  }

  if (!formula) {
    return hasPaidPlan || taskStatuses.some((status) => activeTaskStatuses.has(status))
      ? "formulation_pending"
      : "healthscore_only";
  }

  if (visibleSupplementRecommendationCount(formula) < 1) {
    return "formulation_pending";
  }

  const productStatus = formula.sectionStatuses?.supplements;
  const productCount = formula.recommendations?.length ?? 0;
  const stackCoverage = formula.productRecommendations?.stackCoveragePercent;
  const productMatchingPending =
    productStatus === "pending" ||
    (productCount < 1 && (stackCoverage === null || stackCoverage === undefined));

  if (productMatchingPending) {
    return "product_matching_pending";
  }

  return productCount > 0 ? "checkout_ready" : "formulation_ready";
}
