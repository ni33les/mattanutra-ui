import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  candidateSnapshotMatchesGap,
  classifySupplementAvailability,
  emptyAdminProductRecommendationInsightsData,
  emptyAdminSupplementImprovementInsightsData,
  productOpportunitySearchPhrase,
  supplementAvailabilitySearchPhrase,
  type ProductOpportunityInsight
} from "../lib/admin-recommendation-insights.ts";
import { adminViewPermission, isAdminDashboardView } from "../lib/admin-rbac.ts";

const opportunity: ProductOpportunityInsight = {
  action: "Ask retailers to add this approved master product.",
  averageCoveragePercent: 82,
  blockerReason: null,
  opportunityLabel: "Retailer add",
  opportunityType: "approved_master_not_retail",
  planCount: 4,
  productId: "product-zinc",
  recommendationCount: 6,
  retailerCount: 0,
  rationale: "4 plans recently needed Zinc at 30 mg.",
  supplementSignals: ["Zinc"],
  topDoseLabels: ["30 mg"],
  title: "Strong Zinc"
};

describe("continuous improvement insights", () => {
  it("replaces product insight pages with coverage and simulator pages", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const simulationInputRoute = readFileSync(
      "app/api/admin/product-coverage/simulation-input/route.ts",
      "utf8"
    );

    assert.match(dashboardContent, /"customer-insights"/);
    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"product-optimisation"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.doesNotMatch(dashboardContent, /"product-insights"/);
    assert.doesNotMatch(dashboardContent, /"supplement-insights"/);
    assert.doesNotMatch(dashboardContent, /"supplement-availability-matrix"/);
    assert.doesNotMatch(dashboardContent, /"food-insights"/);
    assert.doesNotMatch(dashboardContent, /"out-of-catalog-insights"/);
    assert.match(dashboard, /AdminProductCoverageView/);
    assert.match(dashboard, /AdminPlanCoverageSimulatorView/);
    assert.match(dashboard, /AdminProductOptimisationView/);
    assert.doesNotMatch(dashboard, /AdminProductRecommendationInsightsView/);
    assert.doesNotMatch(dashboard, /AdminSupplementImprovementInsightsView/);
    assert.doesNotMatch(dashboard, /AdminSupplementAvailabilityMatrixView/);
    assert.doesNotMatch(dashboard, /AdminProductImprovementInsightsView/);
    assert.doesNotMatch(dashboard, /AdminFoodImprovementInsightsView/);
    assert.doesNotMatch(page, /getAdminSupplementAvailabilityMatrixData/);
    assert.match(page, /getAdminProductCoverageData/);
    assert.match(page, /getAdminPlanCoverageSimulationData/);
    assert.match(simulationInputRoute, /getAdminPlanCoverageSimulationData/);
    assert.doesNotMatch(page, /getAdminProductRecommendationInsightsData/);
    assert.doesNotMatch(page, /getAdminSupplementImprovementInsightsData/);
    assert.doesNotMatch(page, /getAdminProductImprovementInsightsData/);
    assert.doesNotMatch(page, /getAdminFoodImprovementInsightsData/);
    assert.equal(adminViewPermission("product-coverage"), "marketing.read");
    assert.equal(adminViewPermission("product-optimisation"), "marketing.read");
    assert.equal(adminViewPermission("plan-coverage-simulator"), "marketing.read");
    assert.equal(isAdminDashboardView("supplement-availability-matrix"), false);
    assert.equal(isAdminDashboardView("product-insights"), false);
    assert.equal(isAdminDashboardView("supplement-insights"), false);
    assert.equal(isAdminDashboardView("coverage-improvement-insights"), false);
    assert.equal(isAdminDashboardView("product-coverage"), true);
    assert.equal(isAdminDashboardView("product-optimisation"), true);
    assert.equal(isAdminDashboardView("plan-coverage-simulator"), true);
    assert.equal(isAdminDashboardView("food-insights"), false);
  });

  it("keeps safe empty data for supplement improvement", () => {
    const data = emptyAdminSupplementImprovementInsightsData("week");

    assert.equal(data.databaseAvailable, false);
  });

  it("keeps safe empty data for product recommendation insights", () => {
    const data = emptyAdminProductRecommendationInsightsData("week");

    assert.equal(data.databaseAvailable, false);
    assert.equal(data.summary.totalProducts, 0);
    assert.deepEqual(data.rows, []);
  });

  it("renders managed-list supplement sections without the outside-master-list empty section", () => {
    const readModel = readFileSync(
      "lib/admin-recommendation-insights.ts",
      "utf8"
    );
    const view = readFileSync(
      "components/admin/recommendation-insights-view.tsx",
      "utf8"
    );

    assert.doesNotMatch(readModel, /outsideMasterList/);
    assert.match(view, /Managed list recommendations/);
    assert.match(view, /Recommended By AI But Not Cleanly Usable/);
    assert.match(view, />Reason</);
    assert.doesNotMatch(view, /AI Recommendations Outside The Master List/);
    assert.doesNotMatch(view, /ai-recommendations-outside-master-list\.csv/);
    assert.doesNotMatch(view, /No unignored AI supplement recommendations are outside the master list/);
    assert.doesNotMatch(view, /Supplement Recommendations Across The Master List/);
    assert.doesNotMatch(view, /Supplement Recommendations Across The Managed List/);
    assert.doesNotMatch(view, />Add</);
    assert.doesNotMatch(view, />Hidden</);
    assert.doesNotMatch(view, /Retail Products To Add Or Restock/);
    assert.doesNotMatch(view, /External Products To Review For Master List/);
    assert.doesNotMatch(view, /Foods To Improve Formula Outcomes/);
    assert.doesNotMatch(view, /Supplement Availability Matrix/);
  });

  it("classifies master supplement availability across master and retailer lists", () => {
    assert.equal(
      classifySupplementAvailability({
        activeRetailerCount: 0,
        availableRetailerCount: 0,
        masterProductCount: 0,
        masterProductsWithDoseCount: 0,
        retailProductCount: 0
      }),
      "missing_master_product"
    );
    assert.equal(
      classifySupplementAvailability({
        activeRetailerCount: 0,
        availableRetailerCount: 0,
        masterProductCount: 1,
        masterProductsWithDoseCount: 1,
        retailProductCount: 0
      }),
      "weak_master_product"
    );
    assert.equal(
      classifySupplementAvailability({
        activeRetailerCount: 0,
        availableRetailerCount: 0,
        masterProductCount: 2,
        masterProductsWithDoseCount: 2,
        retailProductCount: 0
      }),
      "missing_retail_product"
    );
    assert.equal(
      classifySupplementAvailability({
        activeRetailerCount: 1,
        availableRetailerCount: 1,
        masterProductCount: 2,
        masterProductsWithDoseCount: 2,
        retailProductCount: 1
      }),
      "weak_retail_product"
    );
    assert.equal(
      classifySupplementAvailability({
        activeRetailerCount: 2,
        availableRetailerCount: 2,
        masterProductCount: 2,
        masterProductsWithDoseCount: 2,
        retailProductCount: 2
      }),
      "covered"
    );
  });

  it("builds deterministic marketplace search phrases and gap checks", () => {
    assert.equal(
      productOpportunitySearchPhrase(opportunity),
      "Thailand Zinc 30 mg supplement product"
    );
    assert.equal(
      supplementAvailabilitySearchPhrase({
        supplementName: "Magnesium",
        topDoseLabels: ["200 mg"]
      }),
      "Thailand Magnesium 200 mg supplement product"
    );
    assert.equal(
      candidateSnapshotMatchesGap(
        {
          brandName: "Example",
          confidence: "generated",
          diagnostics: [],
          evidenceRequired: [],
          externalProductId: "ext",
          affectedPlanCount: 4,
          blockerSolved: "missing_master_product",
          imageUrl: "https://example.com/zinc.webp",
          matchedGapId: "zinc",
          matchedDoseLabel: "30 mg",
          matchedGapName: "Zinc",
          platform: "shopee",
          priceAmount: 120,
          productUrl: "https://example.com/zinc",
          query: "Thailand Zinc supplement product",
          rationale: "Matched Zinc search.",
          searchStatus: "generated",
          title: "Example Zinc 30 tablets"
        },
        "Zinc"
      ),
      true
    );
  });

  it("keeps coverage helper exports without the retired page exports", () => {
    const readModel = readFileSync(
      "lib/admin-recommendation-insights.ts",
      "utf8"
    );

    assert.match(readModel, /loadMasterSupplementAvailabilityInsights/);
    assert.doesNotMatch(readModel, /AdminSupplementAvailabilityMatrixData/);
    assert.doesNotMatch(readModel, /getAdminSupplementAvailabilityMatrixData/);
  });
});
