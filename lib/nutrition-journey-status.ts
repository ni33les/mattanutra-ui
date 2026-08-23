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

export type JourneyWorkStageId =
  | "healthscore"
  | "formulation"
  | "products";

export type JourneyWorkStageState = "complete" | "active" | "pending";

export type JourneyWorkTimeline = Readonly<{
  failed: boolean;
  readyForReveal: boolean;
  stages: Readonly<{
    formulation: JourneyWorkStageState;
    healthscore: JourneyWorkStageState;
    products: JourneyWorkStageState;
  }>;
  status: NutritionJourneyStatus;
}>;

export function isNutritionJourneyRevealReady(
  status: NutritionJourneyStatus
) {
  return status === "checkout_ready" || status === "formulation_ready";
}

export function nutritionJourneyWorkTimeline({
  hasHealthScore,
  status
}: Readonly<{
  hasHealthScore: boolean;
  status: NutritionJourneyStatus;
}>): JourneyWorkTimeline {
  const failed = status === "failed" || status === "stale";
  const readyForReveal = isNutritionJourneyRevealReady(status);

  if (readyForReveal) {
    return {
      failed: false,
      readyForReveal: true,
      stages: {
        formulation: "complete",
        healthscore: "complete",
        products: "complete"
      },
      status
    };
  }

  if (status === "product_matching_pending") {
    return {
      failed,
      readyForReveal: false,
      stages: {
        formulation: "complete",
        healthscore: "complete",
        products: failed ? "pending" : "active"
      },
      status
    };
  }

  if (status === "formulation_pending") {
    return {
      failed,
      readyForReveal: false,
      stages: {
        formulation: failed ? "pending" : "active",
        healthscore: hasHealthScore ? "complete" : "active",
        products: "pending"
      },
      status
    };
  }

  return {
    failed,
    readyForReveal: false,
    stages: {
      formulation: "pending",
      healthscore: hasHealthScore ? "complete" : failed ? "pending" : "active",
      products: "pending"
    },
    status
  };
}

export function nutritionJourneyStatusFromCounts({
  assessmentStatus,
  hasPaidPlan,
  hasStaleSnapshot,
  productCount,
  productSectionStatus,
  stackCoveragePercent,
  taskStatuses,
  visibleSupplementCount
}: Readonly<{
  assessmentStatus?: string | null;
  hasPaidPlan?: boolean;
  hasStaleSnapshot?: boolean;
  productCount?: number;
  productSectionStatus?: string | null;
  stackCoveragePercent?: number | null;
  taskStatuses?: readonly string[];
  visibleSupplementCount?: number;
}>): NutritionJourneyStatus {
  const formula =
    (visibleSupplementCount ?? 0) > 0
      ? {
          productRecommendations:
            stackCoveragePercent === null || stackCoveragePercent === undefined
              ? undefined
              : {
                  matchedCount: productCount ?? 0,
                  needsCount: 1,
                  stackCoveragePercent,
                  status: "partial" as const
                },
          recommendations: Array.from({ length: productCount ?? 0 }, (_, index) => ({
            covers: [],
            description: "",
            id: `product-${index}`,
            marketplace: "Imported product" as const,
            name: "",
            priority: index + 1,
            tag: "",
            url: ""
          })),
          sectionStatuses: {
            foods: "pending" as const,
            supplements:
              (productCount ?? 0) > 0 || productSectionStatus === "ready"
                ? ("ready" as const)
                : ("pending" as const)
          },
          supplementBreakdown: Array.from(
            { length: visibleSupplementCount ?? 0 },
            (_, index) => ({
              category: "Core" as const,
              dailyDose: "",
              effectivenessRank: index + 1,
              id: `supplement-${index}`,
              rationale: "",
              status: "add" as const,
              supplement: `supplement-${index}`
            })
          )
        }
      : null;

  return nutritionJourneyStatus({
    assessmentStatus,
    formula,
    hasPaidPlan,
    hasStaleSnapshot,
    taskStatuses
  });
}
