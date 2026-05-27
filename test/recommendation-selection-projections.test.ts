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

    assert.match(schema, /product_recommendation_decisions/);
    assert.match(schema, /supplement_recommendation_selections/);
    assert.match(packageJson, /recommendation-insights:schema:apply/);
    assert.match(applyScript, /projectSupplementRecommendationSelections/);
    assert.match(applyScript, /productDecisionRowsFromStoredRun/);
    assert.match(dashboardContent, /insightsTitle/);
    assert.match(dashboardContent, /supplement-insights/);
    assert.match(dashboardContent, /product-insights/);
    assert.match(adminDashboard, /AdminRecommendationInsightsView/);
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
          affiliate: true,
          coveredNeeds: [],
          offerId: "offer",
          product: {
            activeAffiliateUrl: "https://example.com/chosen",
            activeOfferId: "offer",
            affiliateStatus: "active",
            automatedSafetyPassed: true,
            availabilityStatus: "in_stock",
            brandStatus: "approved",
            currency: "THB",
            facts: [],
            id: "chosen",
            labelStatus: "parsed",
            platform: "lazada",
            priceAmount: 120,
            productUrl: "https://example.com/chosen",
            region: "TH",
            status: "approved",
            title: "Chosen Product"
          },
          productCoveragePercent: 80,
          rank: 1,
          score: 0.8,
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
    assert.equal(rows.find((row) => row.outcome === "chosen")?.servingMultiplier, 2);
    assert.equal(rows.some((row) => row.productId === "irrelevant"), false);
  });
});
