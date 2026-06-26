import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  productRecommendationDecisionIsStale,
  productRecommendationInsightOutcome,
  productRecommendationInsightReason
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
});
