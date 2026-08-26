import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicBasketItem, publicCoverage } from "../lib/agentic/public-mapper.ts";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

describe("Phase 3 public contribution ledger", () => {
  it("selects G-C-500 for standalone vitamin C", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("c", 500)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-C-500"), true);
  });

  it("names the fish-oil product as the omega-3 contributor on the official gold stack", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_GOLD_CATALOG);
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-O3-FISH-1000"), true);
    assert.equal(result.selected.productIds.includes("G-O3-ALGAE-500"), false);
  });

  it("forwards coverage contributors and requested nutrient amounts", () => {
    const row = publicCoverage({
      contributors: [
        {
          amount: 500,
          productId: "prd_c",
          productName: "Vitamin C 500",
          unit: "mg"
        }
      ],
      coveragePercent: 100,
      currentAmount: 0,
      deliveredAmount: 500,
      name: "Vitamin C",
      percentOfUpperLimit: null,
      remainingGap: 0,
      requestedAmount: 500,
      status: "covered",
      supplementId: "sup_c",
      totalExposureAmount: 500,
      unit: "mg",
      upperLimitAmount: 2000
    });
    assert.ok(row.contributors);
    assert.equal(row.contributors[0]?.productName, "Vitamin C 500");
    assert.equal(row.contributors[0]?.amount, 500);
    const item = publicBasketItem({
      availabilityAsOf: "2026-08-26T00:00:00.000Z",
      contributionSupplementIds: ["sup_c"],
      currency: "THB",
      dailyPills: 1,
      deliveryWindow: null,
      fixture: true,
      form: "tablet",
      imageUrl: null,
      incidentalNutrientNames: [],
      incidentalNutrients: [],
      incompleteCommercialFacts: false,
      lineTotalMinor: 100,
      pillsPerServing: 1,
      productId: "prd_c",
      productName: "Vitamin C 500",
      quantity: 1,
      requestedNutrientNames: ["Vitamin C"],
      requestedNutrients: [{ amount: 500, name: "Vitamin C", unit: "mg" }],
      retailerSku: "G-C-500",
      sellerId: "seller",
      sellerName: "QA",
      servingsPerDay: 1,
      source: "fixture",
      stockStatus: "in_stock",
      unitPriceMinor: 100
    });
    assert.deepEqual(item.requestedNutrients, [
      { amount: 500, name: "Vitamin C", unit: "mg" }
    ]);
  });
});
