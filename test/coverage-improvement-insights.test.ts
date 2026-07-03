import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LOW_COVERAGE_THRESHOLD_PERCENT,
  averageCoveragePercent,
  buildLeastMatchedSupplements,
  classifyMasterListOpportunity,
  coverageDistribution,
  emptyAdminCoverageImprovementInsightsData,
  medianCoveragePercent
} from "../lib/admin-coverage-improvement-insights.ts";
import { adminViewPermission } from "../lib/admin-rbac.ts";

const timestamp = "2026-06-18T09:00:00.000Z";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    contactEmail: "low@example.com",
    countryCode: "TH",
    coveragePercent: 34,
    firstName: "Low",
    freshnessState: "stale",
    generatedAt: timestamp,
    lastActivityAt: timestamp,
    locale: "en",
    orderNumber: "SO-1001",
    orderStatus: "placed",
    planId: "11111111-1111-4111-8111-111111111111",
    refreshReason: "retail_catalogue_changed",
    selectedPlan: "precision",
    selectedProducts: [
      {
        productId: "22222222-2222-4222-8222-222222222222",
        retailerName: "Delight Pharmacy",
        title: "Near Miss Zinc"
      }
    ],
    stackCoveragePercent: 34,
    supplementProductCoveragePercent: 34,
    totalCoveragePercent: 34,
    unmatchedSupplements: ["Zinc"],
    ...overrides
  };
}

describe("product coverage improvement insights", () => {
  it("retires the old coverage improvement dashboard view", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const zhContent = readFileSync(
      "components/admin/dashboard-content.zh-CN.json",
      "utf8"
    );

    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.doesNotMatch(dashboardContent, /Coverage Improvement/);
    assert.doesNotMatch(zhContent, /覆盖改进/);
    assert.doesNotMatch(dashboard, /AdminCoverageImprovementInsightsView/);
    assert.doesNotMatch(page, /getAdminCoverageImprovementInsightsData\(range, locale\)/);
    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"product-optimisation"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.equal(
      adminViewPermission("product-coverage"),
      "marketing.read"
    );
    assert.equal(
      adminViewPermission("product-optimisation"),
      "marketing.read"
    );
    assert.equal(
      adminViewPermission("plan-coverage-simulator"),
      "marketing.read"
    );
  });

  it("keeps optional recommendation and retail tables guarded", () => {
    const readModel = readFileSync(
      "lib/admin-coverage-improvement-insights.ts",
      "utf8"
    );

    assert.match(readModel, /to_regclass\('public\.product_recommendation_runs'\)/);
    assert.match(readModel, /to_regclass\('public\.product_recommendation_decisions'\)/);
    assert.match(readModel, /to_regclass\('public\.product_facts'\)/);
    assert.match(readModel, /to_regclass\('public\.retail_checkout_payments'\)/);
    assert.match(readModel, /to_regclass\('public\.retail_order_allocations'\)/);
    assert.match(readModel, /!availability\.productDecisions/);
    assert.match(readModel, /!availability\.retailOrderAllocations/);
    assert.match(readModel, /emptyAdminCoverageImprovementInsightsData/);
  });

  it("calculates average, median, distribution and default low coverage threshold", () => {
    assert.equal(LOW_COVERAGE_THRESHOLD_PERCENT, 75);
    assert.equal(averageCoveragePercent([34, 76, 90]), 67);
    assert.equal(medianCoveragePercent([34, 76, 90]), 76);
    assert.deepEqual(
      coverageDistribution([
        { coveragePercent: 10 },
        { coveragePercent: 34 },
        { coveragePercent: 62 },
        { coveragePercent: 88 },
        { coveragePercent: 96 }
      ]).map((bucket) => bucket.count),
      [1, 1, 1, 1, 1]
    );
    assert.equal(
      emptyAdminCoverageImprovementInsightsData("week").thresholdPercent,
      75
    );
  });

  it("ranks least-matched supplements from demand and diagnostics", () => {
    const plans = [
      plan(),
      plan({
        coveragePercent: 82,
        contactEmail: "covered@example.com",
        firstName: "Covered",
        planId: "33333333-3333-4333-8333-333333333333",
        unmatchedSupplements: []
      })
    ] as never;
    const diagnostics = new Map<string, unknown>([
      [
        "11111111-1111-4111-8111-111111111111",
        {
          unmatchedNeeds: [
            {
              bestRejectedReason: "No active Thai sellable",
              displayName: "Zinc",
              id: "zinc"
            }
          ]
        }
      ],
      [
        "33333333-3333-4333-8333-333333333333",
        {
          matchedNeeds: [
            {
              displayName: "Zinc",
              id: "zinc"
            }
          ]
        }
      ]
    ]);
    const rows = buildLeastMatchedSupplements(
      plans,
      diagnostics,
      [
        {
          demand_count: 2,
          id: "zinc",
          label: "Zinc",
          last_seen_at: timestamp,
          plan_ids: [
            "11111111-1111-4111-8111-111111111111",
            "33333333-3333-4333-8333-333333333333"
          ]
        }
      ] as never,
      [
        {
          productTitle: "Near Miss Zinc",
          supplementSignals: ["Zinc"]
        }
      ]
    );

    assert.equal(rows[0]?.name, "Zinc");
    assert.equal(rows[0]?.demandPlanCount, 2);
    assert.equal(rows[0]?.matchRatePercent, 50);
    assert.equal(rows[0]?.lowCoveragePlanCount, 1);
    assert.deepEqual(rows[0]?.nearMissProductTitles, ["Near Miss Zinc"]);
  });

  it("classifies master-list opportunities into operational blockers", () => {
    assert.equal(
      classifyMasterListOpportunity({
        allowsBackorder: false,
        hasActiveSellable: false,
        hasAvailableStock: false,
        hasCountryRow: true,
        hasSellable: false,
        nearMissCount: 1,
        productStatus: "approved",
        validationStatus: "pass"
      }),
      "approved_not_sellable"
    );
    assert.equal(
      classifyMasterListOpportunity({
        allowsBackorder: false,
        hasActiveSellable: true,
        hasAvailableStock: false,
        hasCountryRow: true,
        hasSellable: true,
        nearMissCount: 0,
        productStatus: "approved",
        validationStatus: "pass"
      }),
      "stock_or_backorder"
    );
  });

  it("keeps superficial candidate suggestions out of the overview cockpit", () => {
    const readModel = readFileSync(
      "lib/admin-coverage-improvement-insights.ts",
      "utf8"
    );
    const view = readFileSync(
      "components/admin/coverage-improvement-insights-view.tsx",
      "utf8"
    );

    assert.doesNotMatch(readModel, /fallbackExternalCandidateSuggestions/);
    assert.doesNotMatch(readModel, /candidateProductOrSearchPhrase/);
    assert.doesNotMatch(readModel, /Thailand supplement product for/);
    assert.doesNotMatch(view, /externalCandidateSuggestions/);
    assert.match(view, /Actionable supplement and product coverage gaps/);
    assert.match(view, /availabilityDose/);
    assert.match(view, /supplementAvailability/);
    assert.equal(
      "aiStatus" in emptyAdminCoverageImprovementInsightsData("week"),
      false
    );
  });

  it("exposes CSV export fields for plans and least-matched supplements", () => {
    const view = readFileSync(
      "components/admin/coverage-improvement-insights-view.tsx",
      "utf8"
    );

    assert.match(view, /coverage-low-plans\.csv/);
    assert.match(view, /coverage-least-matched-supplements\.csv/);
    assert.match(view, /contactEmail/);
    assert.match(view, /orderNumber/);
    assert.match(view, /refreshReason/);
    assert.match(view, /matchRatePercent/);
    assert.match(view, /blockerMix/);
  });
});
