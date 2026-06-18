import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  candidateSnapshotMatchesGap,
  classifySupplementAvailability,
  emptyAdminFoodImprovementInsightsData,
  emptyAdminProductImprovementInsightsData,
  emptyAdminSupplementAvailabilityMatrixData,
  emptyAdminSupplementImprovementInsightsData,
  productOpportunitySearchPhrase,
  supplementAvailabilitySearchPhrase,
  type ProductOpportunityInsight
} from "../lib/admin-recommendation-insights.ts";
import { adminViewPermission } from "../lib/admin-rbac.ts";

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
  it("wires supplement availability, supplement, product, and food improvement pages to marketing permission", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");

    assert.match(dashboardContent, /"supplement-availability-matrix"/);
    assert.match(
      dashboardContent,
      /insights: \[\s*\{ icon: BeakerIcon, name: "Supplement Availability Matrix", view: "supplement-availability-matrix" \}/
    );
    assert.match(dashboardContent, /"supplement-insights"/);
    assert.match(dashboardContent, /"product-insights"/);
    assert.match(dashboardContent, /"food-insights"/);
    assert.doesNotMatch(dashboardContent, /"out-of-catalog-insights"/);
    assert.match(dashboard, /AdminSupplementAvailabilityMatrixView/);
    assert.match(dashboard, /AdminSupplementImprovementInsightsView/);
    assert.match(dashboard, /AdminProductImprovementInsightsView/);
    assert.match(dashboard, /AdminFoodImprovementInsightsView/);
    assert.match(page, /getAdminSupplementAvailabilityMatrixData/);
    assert.match(page, /getAdminSupplementImprovementInsightsData/);
    assert.match(page, /getAdminProductImprovementInsightsData/);
    assert.match(page, /getAdminFoodImprovementInsightsData/);
    assert.equal(adminViewPermission("supplement-availability-matrix"), "marketing.read");
    assert.equal(adminViewPermission("supplement-insights"), "marketing.read");
    assert.equal(adminViewPermission("product-insights"), "marketing.read");
    assert.equal(adminViewPermission("food-insights"), "marketing.read");
  });

  it("keeps safe empty data for all new pages", () => {
    assert.equal(
      emptyAdminSupplementImprovementInsightsData("week").databaseAvailable,
      false
    );
    assert.equal(
      emptyAdminProductImprovementInsightsData("week").summary.externalCandidateCount,
      0
    );
    assert.equal(
      emptyAdminSupplementAvailabilityMatrixData("week").summary.totalSupplements,
      0
    );
    assert.equal(
      emptyAdminFoodImprovementInsightsData("week").summary.unknownFoods,
      0
    );
  });

  it("uses real marketplace snapshots instead of fake external product names", () => {
    const readModel = readFileSync(
      "lib/admin-recommendation-insights.ts",
      "utf8"
    );
    const view = readFileSync(
      "components/admin/recommendation-insights-view.tsx",
      "utf8"
    );
    const schema = readFileSync("db-schema.sql", "utf8");

    assert.match(schema, /improvement_external_product_candidate_cache/);
    assert.match(readModel, /searchMarketplaceProducts/);
    assert.match(readModel, /ProductSnapshot/);
    assert.match(readModel, /loadExternalProductCandidates/);
    assert.match(view, /External Products To Review For Master List/);
    assert.match(view, /candidate\.rationale/);
    assert.match(view, /Evidence needed/);
    assert.match(view, /candidate\.imageUrl/);
    assert.match(view, /candidate\.productUrl/);
    assert.doesNotMatch(view, /Search unavailable/);
    assert.doesNotMatch(`${readModel}\n${view}`, /candidateProductOrSearchPhrase/);
    assert.doesNotMatch(`${readModel}\n${view}`, /Thailand supplement product for/);
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

  it("exposes current versus optimum plan comparison and CSV exports", () => {
    const readModel = readFileSync(
      "lib/admin-recommendation-insights.ts",
      "utf8"
    );
    const view = readFileSync(
      "components/admin/recommendation-insights-view.tsx",
      "utf8"
    );

    assert.match(readModel, /current_products/);
    assert.match(readModel, /optimum_products/);
    assert.match(readModel, /optimumDeltaPercent/);
    assert.match(readModel, /loadMasterSupplementAvailabilityInsights/);
    assert.match(view, /product-plan-current-vs-optimum\.csv/);
    assert.match(view, /supplement-availability-matrix\.csv/);
    assert.match(view, /Supplement Availability Matrix/);
    assert.match(view, /Recommended By AI But Not Cleanly Usable/);
    assert.match(view, />Reason</);
    assert.doesNotMatch(view, />Add</);
    assert.doesNotMatch(view, />Review</);
    assert.doesNotMatch(view, />Hidden</);
    assert.doesNotMatch(view, /Retail Products To Add Or Restock/);
    assert.doesNotMatch(view, /product-retail-add-restock-actions\.csv/);
    assert.doesNotMatch(view, /\|\| "n\/a"/);
    assert.match(view, /supplement-improvement-gaps\.csv/);
    assert.match(view, /food-improvement-opportunities\.csv/);
  });
});
