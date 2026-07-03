import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  decideDelightAvailableProduct,
  type DelightAvailableProductCandidate
} from "@/lib/delight-available-products-rollout";

function candidate(
  overrides: Partial<DelightAvailableProductCandidate> = {}
): DelightAvailableProductCandidate {
  return {
    availabilityStatus: "available",
    blockedSupplementCount: 0,
    brandId: "brand-1",
    brandName: "Good Brand",
    brandStatus: "approved",
    currency: "THB",
    delightSellableStatus: null,
    hasBrandThailand: true,
    matchableFactCount: 1,
    productId: "product-1",
    productStatus: "approved",
    rrpPriceAmount: 250,
    title: "Good Product",
    validationStatus: "pass",
    ...overrides
  };
}

describe("Delight available product rollout", () => {
  it("copies an approved TH-priced validation-pass product with dosed canonical facts", () => {
    const decision = decideDelightAvailableProduct(candidate());

    assert.equal(decision.selected, true);
    assert.deepEqual(decision.blockers, []);
  });

  it("plans safe brand and TH brand availability repairs without blocking copy", () => {
    const decision = decideDelightAvailableProduct(candidate({
      brandStatus: "pending_review",
      hasBrandThailand: false
    }));

    assert.equal(decision.selected, true);
    assert.equal(decision.willRepairBrand, true);
    assert.equal(decision.willRepairBrandCountry, true);
  });

  it("excludes pending, ignored, deleted, and unavailable products", () => {
    for (const productStatus of ["pending_review", "ignored", "deleted"]) {
      const decision = decideDelightAvailableProduct(candidate({ productStatus }));

      assert.equal(decision.selected, false);
      assert.ok(decision.blockers.includes("unapproved_product"));
    }

    const unavailable = decideDelightAvailableProduct(candidate({
      availabilityStatus: "unavailable"
    }));

    assert.equal(unavailable.selected, false);
    assert.ok(unavailable.blockers.includes("product_unavailable"));
  });

  it("blocks products missing price, validation, canonical facts, or TH-safe supplements", () => {
    assert.ok(decideDelightAvailableProduct(candidate({
      rrpPriceAmount: null
    })).blockers.includes("missing_th_price"));
    assert.ok(decideDelightAvailableProduct(candidate({
      currency: null
    })).blockers.includes("missing_th_price"));
    assert.ok(decideDelightAvailableProduct(candidate({
      validationStatus: "warn"
    })).blockers.includes("validation_not_pass"));
    assert.ok(decideDelightAvailableProduct(candidate({
      matchableFactCount: 0
    })).blockers.includes("missing_matchable_fact"));
    assert.ok(decideDelightAvailableProduct(candidate({
      blockedSupplementCount: 1
    })).blockers.includes("country_blocked_supplement"));
    assert.ok(decideDelightAvailableProduct(candidate({
      brandId: null,
      brandName: null
    })).blockers.includes("missing_brand"));
  });

  it("wires a dry-run-first Delight-only CLI and preserves existing stock quantity", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/delight-copy-available-products.ts", "utf8"),
      readFile("lib/delight-available-products-rollout.ts", "utf8")
    ]);

    assert.match(packageJson, /delight:copy-available-products/);
    assert.match(scriptSource, /hasArg\("apply"\)/);
    assert.match(scriptSource, /deriveUatDbUrl/);
    assert.doesNotMatch(scriptSource, /url\.port\s*=/);
    assert.match(librarySource, /assertProductListRolloutDatabaseTarget/);
    assert.match(librarySource, /const DELIGHT_ORG_SLUG = "delight-pharmacy"/);
    assert.match(librarySource, /stock_quantity,\s*\n\s*lead_time_days/);
    assert.match(librarySource, /'allow'/);
    assert.match(librarySource, /on conflict \(organisation_id, product_id\) do nothing/);
    assert.doesNotMatch(librarySource, /stock_quantity\s*=\s*excluded\.stock_quantity/);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\.retail_sellable_products/i);
  });
});
