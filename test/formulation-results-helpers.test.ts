import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resultHasPendingProductRecommendations,
  resultHasProductStackRows,
  resultHasTransientEmptyProductRecommendations,
} from "../lib/product-recommendation-readiness.ts";
import {
  coveredFormulaNeedCount,
  selectedStackCoverage,
} from "../components/formulation-results-helpers.tsx";
import {
  defaultProductStackPreferenceForResult,
  productRecommendationOptionsForResult,
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

  it("keeps polling when existing product rows are visible but availability is refreshing", () => {
    const payload = result({
      productRecommendations: {
        matchedCount: 1,
        needsCount: 1,
        refreshReason: "retail_catalogue_changed",
        refreshing: true,
        stackCoveragePercent: 100,
        stackPreference: "balanced",
        status: "ready",
      },
      recommendations: [product()],
    });

    assert.equal(resultHasTransientEmptyProductRecommendations(payload), false);
    assert.equal(resultHasPendingProductRecommendations(payload), true);
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

  it("uses main stack rows while variant option rows are still catching up", () => {
    const payload = result({
      productRecommendationOptions: [
        option({
          id: "balanced",
          productRecommendations: {
            matchedCount: 1,
            needsCount: 1,
            stackCoveragePercent: 100,
            stackPreference: "balanced",
            status: "ready",
          },
          recommendations: [],
        }),
      ],
      productRecommendations: {
        matchedCount: 1,
        needsCount: 1,
        stackCoveragePercent: 100,
        stackPreference: "balanced",
        status: "ready",
      },
      recommendations: [product()],
    });
    const options = productRecommendationOptionsForResult(payload);

    assert.equal(resultHasProductStackRows(payload, "balanced"), true);
    assert.equal(resultHasTransientEmptyProductRecommendations(payload), false);
    assert.equal(options[0]?.recommendations.length, 1);
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

describe("selected stack coverage marketing percent", () => {
  it("uses an equal average of need coverage instead of the stored weighted stack percent", () => {
    const percent = selectedStackCoverage(
      {
        matchedCount: 6,
        needCoverage: [
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 0,
            displayName: "Vitamin D3",
            id: "supplement:vitamin-d3",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "Omega-3",
            id: "supplement:omega-3",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "Magnesium",
            id: "supplement:magnesium",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 0,
            displayName: "Vitamin B12",
            id: "supplement:vitamin-b12",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "CoQ10",
            id: "supplement:coq10",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "Vitamin C",
            id: "supplement:vitamin-c",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "Zinc",
            id: "supplement:zinc",
            itemType: "supplement"
          },
          {
            bestRejectedProductId: null,
            bestRejectedReason: null,
            coveragePercent: 100,
            displayName: "Creatine",
            id: "supplement:creatine",
            itemType: "supplement"
          }
        ],
        needsCount: 8,
        stackCoveragePercent: 62,
        stackPreference: "balanced",
        status: "ready"
      },
      []
    );

    assert.equal(percent, 75);
  });

  it("counts any positive coverage as covered", () => {
    assert.equal(
      coveredFormulaNeedCount([
        { coveragePercent: 60, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 88, itemType: "supplement" },
        { coveragePercent: 2, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 66, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
      ]),
      10,
    );
    assert.equal(
      coveredFormulaNeedCount([
        { coveragePercent: 0, itemType: "supplement" },
        { coveragePercent: 100, itemType: "supplement" },
      ]),
      1,
    );
  });
});
