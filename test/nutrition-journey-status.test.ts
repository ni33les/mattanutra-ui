import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hiddenSafetyIngredientCount,
  isNutritionJourneyRevealReady,
  nutritionJourneyStatus,
  nutritionJourneyStatusFromCounts,
  nutritionJourneyWorkTimeline,
  visibleSupplementRecommendationCount
} from "../lib/nutrition-journey-status.ts";
import type { FormulationIngredient, FormulationResult } from "../lib/formulation-types.ts";

function ingredient(
  id: string,
  visibility: "hidden" | "visible" = "visible"
): FormulationIngredient {
  return {
    category: "Core",
    dailyDose: "1 capsule daily",
    effectivenessRank: 1,
    id,
    rationale: "Assessment-justified support.",
    safety:
      visibility === "hidden"
        ? {
            action: "human_review",
            message: "Hidden until reviewed.",
            visibility: "hidden"
          }
        : undefined,
    status: "add",
    supplement: id
  };
}

function formula(
  input: Partial<FormulationResult> = {}
): Pick<
  FormulationResult,
  "productRecommendations" | "recommendations" | "sectionStatuses" | "supplementBreakdown"
> {
  return {
    productRecommendations: input.productRecommendations,
    recommendations: input.recommendations ?? [],
    sectionStatuses: input.sectionStatuses,
    supplementBreakdown: input.supplementBreakdown ?? [
      ingredient("omega_3"),
      ingredient("iron", "hidden")
    ]
  };
}

describe("nutrition journey status", () => {
  it("uses visible formulation rows as the selected supplement count", () => {
    const result = formula();

    assert.equal(visibleSupplementRecommendationCount(result), 1);
    assert.equal(hiddenSafetyIngredientCount(result), 1);
  });

  it("reports customer-visible status from formulation and product readiness", () => {
    assert.equal(nutritionJourneyStatus({}), "healthscore_only");
    assert.equal(
      nutritionJourneyStatus({ hasPaidPlan: true, taskStatuses: ["queued"] }),
      "formulation_pending"
    );
    assert.equal(
      nutritionJourneyStatus({
        formula: formula({ sectionStatuses: { foods: "pending", supplements: "pending" } })
      }),
      "product_matching_pending"
    );
    assert.equal(
      nutritionJourneyStatus({
        formula: formula({
          productRecommendations: {
            matchedCount: 0,
            needsCount: 1,
            stackCoveragePercent: 0,
            status: "partial"
          },
          recommendations: []
        })
      }),
      "formulation_ready"
    );
    assert.equal(
      nutritionJourneyStatus({
        formula: formula({
          recommendations: [
            {
              covers: ["omega_3"],
              description: "Product",
              id: "product-1",
              marketplace: "Lazada Thailand",
              name: "Omega product",
              priority: 1,
              tag: "Omega",
              url: "https://example.test/product"
            }
          ]
        })
      }),
      "checkout_ready"
    );
    assert.equal(
      nutritionJourneyStatus({ assessmentStatus: "failed", taskStatuses: ["queued"] }),
      "failed"
    );
    assert.equal(nutritionJourneyStatus({ hasStaleSnapshot: true }), "stale");
  });

  it("maps count snapshots onto the three work stages without fake timers", () => {
    assert.equal(
      nutritionJourneyStatusFromCounts({ hasPaidPlan: true, taskStatuses: ["queued"] }),
      "formulation_pending"
    );
    assert.equal(
      nutritionJourneyWorkTimeline({
        hasHealthScore: true,
        status: "formulation_pending"
      }).stages.healthscore,
      "complete"
    );
    assert.equal(
      nutritionJourneyWorkTimeline({
        hasHealthScore: true,
        status: "formulation_pending"
      }).stages.formulation,
      "active"
    );
    assert.equal(
      nutritionJourneyWorkTimeline({
        hasHealthScore: true,
        status: "product_matching_pending"
      }).stages.products,
      "active"
    );
    assert.equal(
      isNutritionJourneyRevealReady("checkout_ready"),
      true
    );
    assert.equal(
      isNutritionJourneyRevealReady("formulation_pending"),
      false
    );
    assert.equal(
      nutritionJourneyStatusFromCounts({
        hasPaidPlan: true,
        visibleSupplementCount: 2,
        productCount: 1,
        stackCoveragePercent: 40
      }),
      "checkout_ready"
    );
  });
});
