import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Phase 3 T01/T08 shared eligibility", () => {
  it("loads live recommendations from sale-eligible Delight/retail rows only", async () => {
    const [search, workItems, applier, live, cleanup] = await Promise.all([
      readFile("lib/admin-product-search.ts", "utf8"),
      readFile("lib/task-work-items.ts", "utf8"),
      readFile("lib/task-result-applier.ts", "utf8"),
      readFile("lib/agentic/catalogue/live.ts", "utf8"),
      readFile("scripts/retail-approved-only-cleanup.ts", "utf8")
    ]);

    assert.match(search, /assessRetailSellability/);
    assert.match(search, /saleEligibleOnly: true/);
    assert.match(
      search,
      /loadProductRows\(null, \{ productIds: retailProductIds, sql \}\)/
    );
    assert.doesNotMatch(
      search.slice(
        search.indexOf("export async function getRetailerAwareProductRecommendationCandidateSets"),
        search.indexOf("export async function getLiveSaleEligibleRetailerCandidateSets")
      ),
      /loadProductRows\(input\.productId \?\? null\)/
    );
    assert.match(workItems, /loadLiveRetailSnapshot/);
    assert.doesNotMatch(
      workItems.slice(
        workItems.indexOf("async function buildProductRecommendationsWorkItem"),
        workItems.indexOf("async function buildAdminCatalogueOptimizationWorkItem")
      ),
      /getLiveSaleEligibleRetailerCandidateSets|loadProductRows/
    );
    assert.match(applier, /getLiveSaleEligibleRetailerCandidateSets/);
    assert.doesNotMatch(
      workItems.slice(
        workItems.indexOf("async function buildProductRecommendationsWorkItem"),
        workItems.indexOf("async function buildAdminCatalogueOptimizationWorkItem")
      ),
      /includeIneligible: true/
    );
    assert.match(live, /assessRetailSellability/);
    assert.match(cleanup, /HISTORICAL_CLEANUP_DEPENDENCIES/);
    assert.match(cleanup, /retail_customer_order_lines/);
    assert.doesNotMatch(search, /prd_[a-z0-9]+/);
    assert.doesNotMatch(workItems, /hardcodedSku|skuBlacklist/i);
  });
});
