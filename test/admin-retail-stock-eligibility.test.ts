import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stockRowEligibleForSale,
  stockRowIneligibleReason,
  stockRowIsSelected
} from "../lib/admin-retail-stock-eligibility.ts";

const labels = {
  ineligibleForSale: "Ineligible for sale",
  ineligibleInactive: "Inactive",
  ineligibleMissingRrp: "Missing RRP",
  ineligibleNoStock: "Out of stock, no backorder",
  ineligibleNotApproved: "Not approved"
};

function row(
  overrides: Partial<Parameters<typeof stockRowEligibleForSale>[0]> = {}
) {
  return {
    backorderPolicy: "allow" as const,
    productStatus: "approved",
    retailPriceAmount: 441,
    retailSellableProductId: "sellable-1",
    status: "active",
    stockQuantity: 4,
    ...overrides
  };
}

describe("retail stock sale eligibility", () => {
  it("treats an approved, selected, priced row as eligible", () => {
    assert.equal(stockRowIsSelected(row()), true);
    assert.equal(stockRowEligibleForSale(row()), true);
  });

  it("keeps a pending-review listing selected but not eligible", () => {
    const pending = row({ productStatus: "pending_review" });
    assert.equal(stockRowIsSelected(pending), true);
    assert.equal(stockRowEligibleForSale(pending), false);
    assert.equal(stockRowIneligibleReason(pending, labels), "Not approved");
  });

  it("does not count a stock row without a listing as selected", () => {
    const unlisted = row({ retailSellableProductId: null });
    assert.equal(stockRowIsSelected(unlisted), false);
    assert.equal(stockRowEligibleForSale(unlisted), false);
    assert.equal(stockRowIneligibleReason(unlisted, labels), "Inactive");
  });
});
