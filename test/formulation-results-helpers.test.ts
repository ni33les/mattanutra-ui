import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resultHasPendingProductRecommendations,
  resultHasProductStackRows,
  resultHasTransientEmptyProductRecommendations,
} from "../lib/product-recommendation-readiness.ts";
import {
  defaultProductStackPreferenceForResult,
} from "../lib/product-recommendation-options.ts";
import type {
  FormulationResult,
  ProductRecommendationOption,
  RecommendedProduct,
} from "../lib/formulation-types.ts";

function product(): RecommendedProduct {
  return {
    affiliate: false,
    covers: ["omega-3"],
    description: "Matches Omega-3.",
    id: "product-omega-3",
    marketplace: "Imported product",
    name: "Omega-3",
    priority: 1,
    productCoveragePercent: 100,
    productId: "product-omega-3",
    rank: 1,
    stackContributionPercent: 100,
    tag: "Matched",
    url: "https://example.com/product",
  };
}

function result(
  overrides: Partial<FormulationResult> = {},
): FormulationResult {
  return {
    access: "full",
    assessmentSummary: {
      constraints: [],
      goals: [],
      plan: "Precision",
      profile: "Example",
      region: "Thailand",
    },
    foodGuidance: [],
    generatedAt: "2026-05-30T00:00:00.000Z",
    planId: "00000000-0000-4000-8000-000000000001",
    recommendations: [],
    schemaVersion: 1,
    sectionStatuses: {
      foods: "ready",
      supplements: "ready",
    },
    supplementBreakdown: [],
    ...overrides,
  };
}

function option(
  overrides: Partial<ProductRecommendationOption> = {},
): ProductRecommendationOption {
  return {
    id: "balanced",
    productRecommendations: {
      matchedCount: 0,
      needsCount: 1,
      stackCoveragePercent: 66,
      stackPreference: "balanced",
      status: "ready",
    },
    recommendations: [],
    ...overrides,
  };
}

describe("formulation results product recommendation readiness", () => {
  it("keeps polling when a completed run has coverage but product rows are not readable yet", () => {
    const payload = result({
      productRecommendations: {
        matchedCount: 0,
        needsCount: 8,
        stackCoveragePercent: 66,
        stackPreference: "balanced",
        status: "ready",
      },
    });

    assert.equal(resultHasTransientEmptyProductRecommendations(payload), true);
    assert.equal(resultHasPendingProductRecommendations(payload), true);
  });

  it("keeps polling when a stack option has coverage but no recommendation rows", () => {
    const payload = result({
      productRecommendationOptions: [option()],
    });

    assert.equal(resultHasTransientEmptyProductRecommendations(payload), true);
    assert.equal(resultHasPendingProductRecommendations(payload), true);
  });

  it("stops polling once recommendation rows are available", () => {
    const payload = result({
      productRecommendations: {
        matchedCount: 1,
        needsCount: 1,
        stackCoveragePercent: 100,
        stackPreference: "balanced",
        status: "ready",
      },
      recommendations: [product()],
    });

    assert.equal(resultHasTransientEmptyProductRecommendations(payload), false);
    assert.equal(resultHasPendingProductRecommendations(payload), false);
  });

  it("knows when a requested stack has rows instead of falling back to another stack", () => {
    const payload = result({
      productRecommendationOptions: [
        option({
          id: "compact",
          recommendations: [product()],
        }),
        option({
          id: "balanced",
          recommendations: [],
        }),
      ],
    });

    assert.equal(resultHasProductStackRows(payload, "compact"), true);
    assert.equal(resultHasProductStackRows(payload, "balanced"), false);
  });

  it("defaults to balanced when compact and balanced options both exist", () => {
    const payload = result({
      productRecommendationOptions: [
        option({
          id: "compact",
          productRecommendations: {
            matchedCount: 3,
            needsCount: 8,
            stackCoveragePercent: 68,
            stackPreference: "compact",
            status: "ready",
          },
        }),
        option({
          id: "balanced",
          productRecommendations: {
            matchedCount: 6,
            needsCount: 8,
            stackCoveragePercent: 87,
            stackPreference: "balanced",
            status: "ready",
          },
        }),
      ],
      productRecommendations: {
        matchedCount: 3,
        needsCount: 8,
        stackCoveragePercent: 68,
        stackPreference: "compact",
        status: "ready",
      },
    });

    assert.equal(defaultProductStackPreferenceForResult(payload), "balanced");
  });

  it("does not treat a genuine zero-coverage run as transient", () => {
    const payload = result({
      productRecommendations: {
        matchedCount: 0,
        needsCount: 8,
        stackCoveragePercent: 0,
        stackPreference: "balanced",
        status: "partial",
      },
    });

    assert.equal(resultHasTransientEmptyProductRecommendations(payload), false);
    assert.equal(resultHasPendingProductRecommendations(payload), false);
  });
});
