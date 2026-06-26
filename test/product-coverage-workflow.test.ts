import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  classifySupplementCoverage,
  emptyAdminPlanCoverageSimulationData,
  emptyAdminProductCoverageData,
  normalizeSimulationSampleSize,
  productCoversSupplementForMatching,
  runAdminPlanCoverageSimulation
} from "../lib/admin-product-coverage.ts";
import type { ProductCandidate } from "../lib/product-recommendations.ts";

const supplementId = "11111111-1111-4111-8111-111111111111";

function product(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    brandName: "Example",
    brandStatus: "approved",
    currency: "THB",
    facts: [
      {
        amount: 100,
        comparableAmount: 100000,
        confidence: "high",
        itemType: "supplement",
        name: "CoQ10",
        normalizedName: "coq10",
        supplementId,
        unit: "mg"
      }
    ],
    id: "22222222-2222-4222-8222-222222222222",
    imageUrl: "https://assets.mattanutra.com/product.webp",
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 120,
    productAudience: "both",
    productKind: "supplement",
    productUrl: "manual://product",
    region: "TH",
    status: "approved",
    title: "Example CoQ10",
    validation: {
      checkedAt: "2026-06-01T00:00:00.000Z",
      matchableFactCount: 1,
      reasons: [],
      status: "pass",
      summary: "1 matchable canonical fact."
    },
    ...overrides
  };
}

describe("product coverage workflow", () => {
  it("classifies supplement coverage from eligible, pending, dirty and missing states", () => {
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 3,
        eligibleProductCount: 1,
        pendingReviewProductCount: 0
      }),
      "covered"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 1,
        eligibleProductCount: 0,
        pendingReviewProductCount: 2
      }),
      "pending_review"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 1,
        eligibleProductCount: 0,
        pendingReviewProductCount: 0
      }),
      "dirty"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 0,
        eligibleProductCount: 0,
        pendingReviewProductCount: 0
      }),
      "missing"
    );
  });

  it("requires a linked supplement fact with usable dose for matching coverage", () => {
    assert.equal(productCoversSupplementForMatching(product(), supplementId), true);
    assert.equal(
      productCoversSupplementForMatching(
        product({
          facts: [
            {
              amount: null,
              comparableAmount: null,
              confidence: "moderate",
              itemType: "supplement",
              name: "CoQ10",
              normalizedName: "coq10",
              supplementId,
              unit: null
            }
          ]
        }),
        supplementId
      ),
      false
    );
  });

  it("runs deterministic synthetic simulations without persistence dependencies", () => {
    const input = {
      candidates: [product()],
      countryCode: "TH",
      sampleSize: 8,
      seed: "fixed",
      supplements: [
        {
          category: "Antioxidants",
          id: supplementId,
          name: "CoQ10",
          normalizedName: "coq10",
          targetComparableAmount: 100000
        }
      ]
    };
    const first = runAdminPlanCoverageSimulation(input);
    const second = runAdminPlanCoverageSimulation(input);

    assert.deepEqual(first.summary, second.summary);
    assert.deepEqual(first.mostUsefulProducts, second.mostUsefulProducts);
    assert.equal(first.databaseAvailable, true);
    assert.equal(first.mostUsefulProducts[0]?.id, product().id);
  });

  it("keeps empty data safe and clamps sample sizes", () => {
    assert.equal(emptyAdminProductCoverageData("TH").databaseAvailable, false);
    assert.equal(emptyAdminPlanCoverageSimulationData({ sampleSize: 999 }).sampleSize, 256);
    assert.equal(normalizeSimulationSampleSize(1), 8);
  });

  it("wires dashboard views, read models, and reset guardrails", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const readModel = readFileSync("lib/admin-product-coverage.ts", "utf8");
    const resetScript = readFileSync(
      "scripts/products-master-pending-review.ts",
      "utf8"
    );
    const packageJson = readFileSync("package.json", "utf8");

    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.doesNotMatch(dashboardContent, /"product-insights"/);
    assert.doesNotMatch(dashboardContent, /"supplement-insights"/);
    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.match(dashboard, /AdminProductCoverageView/);
    assert.match(dashboard, /AdminPlanCoverageSimulatorView/);
    assert.match(page, /getAdminProductCoverageData/);
    assert.match(page, /getAdminPlanCoverageSimulationData/);
    assert.match(readModel, /recommendProductStackFullBeam/);
    assert.doesNotMatch(readModel, /insert into public\.product_recommendation_runs/i);
    assert.doesNotMatch(readModel, /insert into public\.tasks/i);
    assert.match(resetScript, /Only DEV and UAT/);
    assert.match(resetScript, /target looks like production/);
    assert.match(resetScript, /--confirm-master-pending-review/);
    assert.match(packageJson, /products:master:pending-review/);
  });
});
