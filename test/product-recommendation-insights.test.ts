import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  productRecommendationDecisionIsStale,
  productRecommendationInsightOutcome,
  productRecommendationInsightReason,
  productRecommendationUsefulness
} from "../lib/admin-recommendation-insights.ts";

describe("product recommendation insights", () => {
  it("classifies outcomes with recommended, near-miss, rejected, not-evaluated precedence", () => {
    assert.equal(
      productRecommendationInsightOutcome({
        chosenCount: 1,
        nearMissCount: 3,
        rejectedCount: 5
      }),
      "recommended"
    );
    assert.equal(
      productRecommendationInsightOutcome({
        chosenCount: 0,
        nearMissCount: 2,
        rejectedCount: 5
      }),
      "near_miss"
    );
    assert.equal(
      productRecommendationInsightOutcome({
        chosenCount: 0,
        nearMissCount: 0,
        rejectedCount: 5
      }),
      "rejected"
    );
    assert.equal(
      productRecommendationInsightOutcome({
        chosenCount: 0,
        nearMissCount: 0,
        rejectedCount: 0
      }),
      "not_evaluated"
    );
  });

  it("uses selected near-miss and rejected reasons as the row why", () => {
    assert.equal(
      productRecommendationInsightReason({
        chosenCount: 0,
        nearMissCount: 2,
        nearMissReason: "Coverage was close but not best",
        outcome: "near_miss",
        rejectedCount: 0
      }),
      "Coverage was close but not best"
    );
    assert.equal(
      productRecommendationInsightReason({
        chosenCount: 0,
        nearMissCount: 0,
        outcome: "rejected",
        rejectedCount: 4,
        rejectedReason: "No usable per-serving product facts"
      }),
      "No usable per-serving product facts"
    );
    assert.match(
      productRecommendationInsightReason({
        chosenCount: 0,
        nearMissCount: 0,
        outcome: "not_evaluated",
        rejectedCount: 0
      }),
      /No current recommendation decisions/
    );
  });

  it("scores product usefulness from chosen rate, coverage, near misses, and rejections", () => {
    assert.deepEqual(
      productRecommendationUsefulness({
        affectedPlanCount: 5,
        averageCoveragePercent: 95,
        chosenCount: 5,
        nearMissCount: 0,
        rejectedCount: 0
      }),
      {
        band: "strong",
        sample: "standard",
        score: 89
      }
    );
    assert.deepEqual(
      productRecommendationUsefulness({
        affectedPlanCount: 3,
        averageCoveragePercent: 90,
        chosenCount: 0,
        nearMissCount: 0,
        rejectedCount: 3
      }),
      {
        band: "useless",
        sample: "standard",
        score: 2
      }
    );
    assert.deepEqual(
      productRecommendationUsefulness({
        affectedPlanCount: 1,
        averageCoveragePercent: 80,
        chosenCount: 0,
        nearMissCount: 1,
        rejectedCount: 0
      }),
      {
        band: "weak",
        sample: "low",
        score: 34
      }
    );
    assert.deepEqual(
      productRecommendationUsefulness({
        affectedPlanCount: 0,
        averageCoveragePercent: null,
        chosenCount: 0,
        nearMissCount: 0,
        rejectedCount: 0
      }),
      {
        band: "unknown",
        sample: "none",
        score: null
      }
    );
  });

  it("marks decisions stale only when product or validation changed after the latest decision", () => {
    assert.equal(
      productRecommendationDecisionIsStale(
        "2026-01-02T00:00:00.000Z",
        null,
        "2026-01-01T00:00:00.000Z"
      ),
      true
    );
    assert.equal(
      productRecommendationDecisionIsStale(
        "2025-12-31T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      ),
      true
    );
    assert.equal(
      productRecommendationDecisionIsStale(
        "2025-12-31T00:00:00.000Z",
        "2025-12-31T12:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      ),
      false
    );
    assert.equal(
      productRecommendationDecisionIsStale(
        "2026-01-02T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        null
      ),
      false
    );
  });

  it("builds the read model from all products and ranks near-miss/rejected reasons", async () => {
    const readModel = await readFile("lib/admin-recommendation-insights.ts", "utf8");
    const loader = readModel.slice(
      readModel.indexOf("export async function getAdminProductRecommendationInsightsData"),
      readModel.indexOf("export async function getAdminSupplementImprovementInsightsData")
    );

    assert.match(loader, /from public\.products/);
    assert.match(loader, /left join decision_stats/);
    assert.match(loader, /null::numeric as average_coverage_percent/);
    assert.match(loader, /products\.updated_at/);
    assert.match(loader, /products\.validation_checked_at/);
    assert.match(loader, /coalesce\(decision_stats\.chosen_count, 0\)/);
    assert.match(loader, /ranked_reasons/);
    assert.match(loader, /outcome = 'near_miss'/);
    assert.match(loader, /outcome = 'rejected'/);
  });

  it("shows usefulness score histogram instead of chosen frequency or outcome mix", async () => {
    const view = await readFile("components/admin/recommendation-insights-view.tsx", "utf8");
    const productView = view.slice(
      view.indexOf("export function AdminProductRecommendationInsightsView"),
      view.indexOf("const supplementColumns")
    );
    const productRow = view.slice(
      view.indexOf("function ProductInsightRow"),
      view.indexOf("export function AdminProductRecommendationInsightsView")
    );

    assert.match(view, /function ProductUsefulnessHistogram/);
    assert.match(view, /Usefulness score/);
    assert.match(view, /Product Usefulness Histogram/);
    assert.match(view, /Strong/);
    assert.match(view, /Useful/);
    assert.match(view, /Useless/);
    assert.match(productView, /<ProductUsefulnessHistogram rows=\{data\.rows\} locale=\{locale\} \/>/);
    assert.doesNotMatch(view, /ProductChosenHistogram/);
    assert.doesNotMatch(view, /Chosen frequency/);
    assert.doesNotMatch(view, /How Often Products Are Chosen/);
    assert.doesNotMatch(view, /Zero chosen decisions/);
    assert.doesNotMatch(view, /ProductInsightDistributionBar/);
    assert.doesNotMatch(view, /Outcome mix/);
    assert.doesNotMatch(view, /Product recommendation distribution/);
    assert.match(productRow, /ProductUsefulnessPill/);
    assert.match(productRow, /Low sample/);
    assert.match(productRow, /Usefulness/);
    assert.match(productRow, /Evaluated Plans/);
    assert.match(productRow, /Evaluated in/);
    assert.doesNotMatch(productRow, /\["Plans"/);
    assert.match(view, /usefulness_score/);
    assert.match(view, /usefulness_band/);
    assert.match(view, /usefulness_sample/);
    assert.match(view, /evaluated_plans/);
    assert.doesNotMatch(view, /affected_plans/);
  });
});
