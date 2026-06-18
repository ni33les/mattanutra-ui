import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  candidateSnapshotMatchesGap,
  emptyAdminFoodImprovementInsightsData,
  emptyAdminProductImprovementInsightsData,
  emptyAdminSupplementImprovementInsightsData,
  productOpportunitySearchPhrase,
  type ProductOpportunityInsight
} from "../lib/admin-recommendation-insights.ts";
import { adminViewPermission } from "../lib/admin-rbac.ts";

const opportunity: ProductOpportunityInsight = {
  action: "Ask retailers to add this approved master product.",
  averageCoveragePercent: 82,
  blockerReason: null,
  opportunityType: "approved_master_not_retail",
  planCount: 4,
  productId: "product-zinc",
  recommendationCount: 6,
  retailerCount: 0,
  supplementSignals: ["Zinc"],
  title: "Strong Zinc"
};

describe("continuous improvement insights", () => {
  it("wires supplement, product, and food improvement pages to marketing permission", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");

    assert.match(dashboardContent, /"supplement-insights"/);
    assert.match(dashboardContent, /"product-insights"/);
    assert.match(dashboardContent, /"food-insights"/);
    assert.doesNotMatch(dashboardContent, /"out-of-catalog-insights"/);
    assert.match(dashboard, /AdminSupplementImprovementInsightsView/);
    assert.match(dashboard, /AdminProductImprovementInsightsView/);
    assert.match(dashboard, /AdminFoodImprovementInsightsView/);
    assert.match(page, /getAdminSupplementImprovementInsightsData/);
    assert.match(page, /getAdminProductImprovementInsightsData/);
    assert.match(page, /getAdminFoodImprovementInsightsData/);
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
    assert.match(view, /Real External Product Candidates Not Yet In The Master List/);
    assert.match(view, /candidate\.imageUrl/);
    assert.match(view, /candidate\.productUrl/);
    assert.doesNotMatch(`${readModel}\n${view}`, /candidateProductOrSearchPhrase/);
    assert.doesNotMatch(`${readModel}\n${view}`, /Thailand supplement product for/);
  });

  it("builds deterministic marketplace search phrases and gap checks", () => {
    assert.equal(
      productOpportunitySearchPhrase(opportunity),
      "Thailand Zinc supplement product"
    );
    assert.equal(
      candidateSnapshotMatchesGap(
        {
          brandName: "Example",
          confidence: "generated",
          diagnostics: [],
          evidenceRequired: [],
          externalProductId: "ext",
          imageUrl: "https://example.com/zinc.webp",
          matchedGapId: "zinc",
          matchedGapName: "Zinc",
          platform: "shopee",
          priceAmount: 120,
          productUrl: "https://example.com/zinc",
          query: "Thailand Zinc supplement product",
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
    assert.match(view, /product-plan-current-vs-optimum\.csv/);
    assert.match(view, /supplement-improvement-gaps\.csv/);
    assert.match(view, /food-improvement-opportunities\.csv/);
  });
});
