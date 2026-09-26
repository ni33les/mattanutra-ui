import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminViewPermission, isAdminDashboardView } from "../lib/admin-rbac.ts";

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
});
