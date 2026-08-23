import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PRODUCT_RECOMMENDATION_FRESHNESS_MS,
  productRecommendationRefreshReason,
} from "../lib/product-recommendation-freshness.ts";

const taskWorker = readFileSync(
  new URL("../lib/task-worker.ts", import.meta.url),
  "utf8",
);
const revealPage = readFileSync(
  new URL("../app/[locale]/nutrition/reveal/page.tsx", import.meta.url),
  "utf8",
);
const formulationRoute = readFileSync(
  new URL("../app/api/assessment/[planId]/formulation/route.ts", import.meta.url),
  "utf8",
);
const revealEnsureHelper = taskWorker.slice(
  taskWorker.indexOf("export async function ensureFreshProductRecommendationsForReveal"),
  taskWorker.indexOf("export async function enqueueFoodGapSupportTask"),
);

describe("product recommendation freshness", () => {
  const now = new Date("2026-06-18T12:00:00.000Z");
  const generatedAt = "2026-06-18T06:00:00.000Z";

  it("keeps a run fresh under 24 hours when catalogue inputs have not changed", () => {
    assert.equal(
      productRecommendationRefreshReason({
        formulationGeneratedAt: "2026-06-18T05:00:00.000Z",
        generatedAt,
        now,
        productCatalogueUpdatedAt: "2026-06-18T05:30:00.000Z",
        retailCatalogueUpdatedAt: "2026-06-18T05:45:00.000Z",
        stockOrAllocationUpdatedAt: "2026-06-18T05:50:00.000Z",
      }),
      null,
    );
  });

  it("marks a missing run stale", () => {
    assert.equal(
      productRecommendationRefreshReason({ generatedAt: null, now }),
      "missing_run",
    );
  });

  it("marks a run stale after the 24 hour freshness window", () => {
    assert.equal(
      productRecommendationRefreshReason({
        generatedAt: new Date(now.getTime() - PRODUCT_RECOMMENDATION_FRESHNESS_MS),
        now,
      }),
      "ttl_expired",
    );
  });

  it("uses deterministic change reasons before the TTL reason", () => {
    const staleRun = "2026-06-16T06:00:00.000Z";

    assert.equal(
      productRecommendationRefreshReason({
        formulationGeneratedAt: "2026-06-17T06:00:00.000Z",
        generatedAt: staleRun,
        now,
      }),
      "formulation_changed",
    );
    assert.equal(
      productRecommendationRefreshReason({
        generatedAt: staleRun,
        now,
        productCatalogueUpdatedAt: "2026-06-17T06:00:00.000Z",
      }),
      "product_catalogue_changed",
    );
    assert.equal(
      productRecommendationRefreshReason({
        generatedAt: staleRun,
        now,
        retailCatalogueUpdatedAt: "2026-06-17T06:00:00.000Z",
      }),
      "retail_catalogue_changed",
    );
    assert.equal(
      productRecommendationRefreshReason({
        generatedAt: staleRun,
        now,
        stockOrAllocationUpdatedAt: "2026-06-17T06:00:00.000Z",
      }),
      "stock_or_allocation_changed",
    );
    assert.equal(
      productRecommendationRefreshReason({
        generatedAt: staleRun,
        now,
        supplementGovernanceUpdatedAt: "2026-06-17T06:00:00.000Z",
      }),
      "supplement_governance_changed",
    );
  });

  it("dedupes reveal refreshes through the existing active product task path", () => {
    assert.match(taskWorker, /loadProductRecommendationFreshnessSnapshot/);
    assert.match(taskWorker, /status not in \('completed', 'failed', 'cancelled', 'skipped'\)/);
    assert.match(taskWorker, /if \(!forceNew && row\.formulationVersion >= 1 && !row\.reason\)/);
    assert.match(taskWorker, /refreshReason: row\.reason/);
    assert.match(taskWorker, /ensureFreshProductRecommendationsForReveal/);
    assert.match(taskWorker, /source: "reveal_product_recommendation_refresh"/);
    assert.doesNotMatch(revealEnsureHelper, /forceNew:\s*true/);
  });

  it("makes reveal and formulation polling responses no-store", () => {
    assert.match(revealPage, /export const dynamic = "force-dynamic"/);
    assert.match(revealPage, /export const fetchCache = "force-no-store"/);
    assert.match(revealPage, /export const revalidate = 0/);
    assert.match(
      revealPage,
      /setTimeout\(\(\) => \{[\s\S]*ensureFreshProductRecommendationsForReveal\([\s\S]*planId,[\s\S]*initialStackPreference/,
    );
    assert.match(revealPage, /detail:\s*"page"/);
    assert.doesNotMatch(revealPage, /await ensureFreshProductRecommendationsForReveal/);
    assert.ok(
      revealPage.indexOf("const initialResultPromise = getStoredFormulationResult") <
        revealPage.indexOf("setTimeout(() => {"),
      "reveal HTML must start the formula read before scheduling catalogue freshness",
    );
    assert.match(formulationRoute, /Cache-Control", "no-store, max-age=0"/);
    assert.match(formulationRoute, /jsonNoStore\(storedResult\)/);
  });
});
