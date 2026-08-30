import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  productDecisionRowsFromRecommendationResult,
  supplementSelectionRowsFromFormulation
} from "../lib/recommendation-selection-projections.ts";
import type { ProductRecommendationResult } from "../lib/product-recommendations.ts";

describe("recommendation selection projections", () => {
  it("keeps schema and apply script for recommendation insights", () => {
    const schema = readFileSync("db-schema.sql", "utf8");
    const packageJson = readFileSync("package.json", "utf8");
    const applyScript = readFileSync(
      "scripts/apply-recommendation-insights-schema.ts",
      "utf8"
    );
    const adminDashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const recommendationInsights = readFileSync(
      "lib/admin-recommendation-insights.ts",
      "utf8"
    );
    const productSearch = readFileSync("lib/admin-product-search.ts", "utf8");
    const taskExecution = readFileSync("lib/task-execution.ts", "utf8");
    const taskWorker = readFileSync("lib/task-worker.ts", "utf8");
    const freshness = readFileSync(
      "lib/product-recommendation-freshness.ts",
      "utf8"
    );

    assert.match(schema, /product_recommendation_decisions/);
    assert.match(schema, /selected_retailer_organisation_id uuid/);
    assert.match(schema, /retail_sellable_product_id uuid/);
    assert.match(schema, /availability_status text/);
    assert.match(schema, /unit_price_amount numeric/);
    assert.match(schema, /price_source text/);
    assert.match(schema, /eta_date date/);
    assert.match(schema, /supplement_recommendation_selections/);
    assert.match(schema, /improvement_external_product_candidate_cache/);
    assert.match(packageJson, /recommendation-insights:schema:apply/);
    assert.match(applyScript, /projectSupplementRecommendationSelections/);
    assert.match(applyScript, /productDecisionRowsFromStoredRun/);
    assert.match(applyScript, /improvement_external_product_candidate_cache/);
    assert.match(applyScript, /add column if not exists selected_retailer_organisation_id uuid/);
    assert.match(dashboardContent, /insightsTitle/);
    assert.match(dashboardContent, /product-coverage/);
    assert.match(dashboardContent, /product-optimisation/);
    assert.match(dashboardContent, /plan-coverage-simulator/);
    assert.doesNotMatch(dashboardContent, /supplement-insights/);
    assert.doesNotMatch(dashboardContent, /product-insights/);
    assert.doesNotMatch(dashboardContent, /food-insights/);
    assert.match(adminDashboard, /AdminProductCoverageView/);
    assert.match(adminDashboard, /AdminPlanCoverageSimulatorView/);
    assert.match(adminDashboard, /AdminProductOptimisationView/);
    assert.doesNotMatch(adminDashboard, /AdminProductRecommendationInsightsView/);
    assert.doesNotMatch(adminDashboard, /AdminSupplementImprovementInsightsView/);
    assert.doesNotMatch(adminDashboard, /AdminProductImprovementInsightsView/);
    assert.doesNotMatch(adminDashboard, /AdminFoodImprovementInsightsView/);
    assert.doesNotMatch(dashboardContent, /out-of-catalog-insights/);
    assert.doesNotMatch(adminDashboard, /AdminRecommendationInsightsView/);
    assert.doesNotMatch(recommendationInsights, /outOfCatalogSupplements/);
    assert.match(
      recommendationInsights,
      /supplement_recommendation_selections\.supplement_id is null/
    );
    assert.match(recommendationInsights, /left join public\.supplements/);
    assert.match(recommendationInsights, /supplements\.source_status/);
    assert.match(recommendationInsights, /review_required/);
    assert.match(recommendationInsights, /missing/);
    assert.match(recommendationInsights, /blocked/);
    assert.match(recommendationInsights, /banned/);
    assert.match(recommendationInsights, /unknown_supplement/);
    assert.match(recommendationInsights, /row\.source_status && row\.source_status !== "core"/);
    assert.match(recommendationInsights, /row\.list_status === "blocked"/);
    assert.match(productSearch, /getRetailerAwareProductRecommendationCandidateSets/);
    assert.match(productSearch, /sellable\.status = 'active'/);
    assert.match(productSearch, /assessRetailSellability/);
    assert.match(productSearch, /out_of_stock_no_backorder/);
    assert.match(productSearch, /priceSource: "master_list_country_rrp_margin"/);
    assert.match(taskExecution, /retailerCandidateSets\.map/);
    assert.match(taskExecution, /selectRetailerRecommendationOption/);
    assert.match(taskExecution, /retailerOptions: retailerOptions\.map/);
    assert.match(taskWorker, /loadProductRecommendationFreshnessSnapshot/);
    assert.match(freshness, /retail_catalogue_revision/);
    assert.match(freshness, /retail_catalogue_updated_at/);
  });

  it("projects supplement selections with parsed dose and safety visibility", () => {
    const rows = supplementSelectionRowsFromFormulation({
      supplementBreakdown: [
        {
          category: "Minerals",
          dailyDose: { en: "300 mg/day", th: "300 mg ต่อวัน" },
          effectivenessRank: 1,
          id: "magnesium",
          rationale: { en: "Recovery", th: "Recovery" },
          status: "add",
          supplement: { en: "Magnesium Glycinate", th: "แมกนีเซียม" }
        },
        {
          category: "Herbal",
          dailyDose: { en: "As directed", th: "ตามคำแนะนำ" },
          effectivenessRank: 2,
          id: "ashwagandha",
          rationale: { en: "Stress", th: "Stress" },
          safety: {
            action: "human_review",
            message: { en: "Review", th: "Review" },
            visibility: "hidden"
          },
          status: "review",
          supplement: { en: "Ashwagandha", th: "Ashwagandha" }
        }
      ]
    });

    assert.equal(rows[0]?.doseAmount, 300);
    assert.equal(rows[0]?.doseUnit, "mg");
    assert.equal(rows[0]?.doseParseStatus, "parsed");
    assert.equal(rows[0]?.supplementKey, "magnesium_glycinate");
    assert.equal(rows[1]?.doseParseStatus, "unparsed");
    assert.equal(rows[1]?.safetyVisibility, "hidden");
  });

  it("projects chosen, near-miss, and actionable rejected products", () => {
    const result: ProductRecommendationResult = {
      clientNeeds: [],
      diagnostics: {
        blockedProducts: [],
        coverage: {
          foodCoveragePercent: 0,
          supplementProductCoveragePercent: 80,
          totalPlanCoveragePercent: 80
        },
        factIssues: [],
        matchedNeeds: [],
        nearMisses: [
          {
            coveragePercent: 70,
            productId: "near",
            reason: "Lower utility than selected stack",
            title: "Near Product"
          }
        ],
        productsConsidered: 4,
        unmatchedNeeds: []
      },
      exclusions: [
        {
          productId: "blocked",
          reason: "Product is for women only",
          title: "Blocked Product"
        },
        {
          productId: "irrelevant",
          reason: "Product does not cover current client needs",
          title: "Irrelevant Product"
        }
      ],
      foodCoveragePercent: 0,
      recommendations: [
        {
          coveredNeeds: [],
          availabilityStatus: "backorder",
          etaDate: "2026-06-05",
          priceSource: "retail_override",
          product: {
            automatedSafetyPassed: true,
            availabilityStatus: "in_stock",
            brandStatus: "approved",
            currency: "THB",
            facts: [],
            id: "chosen",
            labelStatus: "parsed",
            platform: "lazada",
            priceAmount: 120,
            retailAvailabilityStatus: "backorder",
            retailEtaDate: "2026-06-05",
            retailSellableProductId: "sellable",
            selectedRetailerOrganisationId: "retailer",
            unitPriceAmount: 120,
            productUrl: "https://example.com/chosen",
            region: "TH",
            status: "approved",
            title: "Chosen Product"
          },
          productCoveragePercent: 80,
          rank: 1,
          retailSellableProductId: "sellable",
          score: 0.8,
          selectedRetailerOrganisationId: "retailer",
          servingMultiplier: 2,
          stackContributionPercent: 80,
          unknownAtRecommendation: false,
          url: "https://example.com/chosen",
          why: "Covers needs"
        }
      ],
      stackCoveragePercent: 80,
      supplementProductCoveragePercent: 80,
      totalPlanCoveragePercent: 80
    };

    const rows = productDecisionRowsFromRecommendationResult(result);

    assert.deepEqual(
      rows.map((row) => row.outcome),
      ["chosen", "near_miss", "rejected"]
    );
    const chosen = rows.find((row) => row.outcome === "chosen");

    assert.equal(chosen?.servingMultiplier, 2);
    assert.equal(chosen?.selectedRetailerOrganisationId, "retailer");
    assert.equal(chosen?.retailSellableProductId, "sellable");
    assert.equal(chosen?.availabilityStatus, "backorder");
    assert.equal(chosen?.unitPriceAmount, 120);
    assert.equal(chosen?.priceSource, "retail_override");
    assert.equal(chosen?.etaDate, "2026-06-05");
    assert.equal(rows.some((row) => row.productId === "irrelevant"), false);
  });
});
