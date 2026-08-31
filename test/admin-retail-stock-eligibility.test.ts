import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stockRowEligibleForSale,
  stockRowIneligibleReason,
  stockRowIsOnSale,
  stockRowIsSelected,
  stockRowIsUnavailable,
  stockRowIsUnselected,
  stockRowUnavailableReason
} from "../lib/admin-retail-stock-eligibility.ts";

const labels = {
  ineligibleForSale: "Unavailable",
  ineligibleInactive: "Unselected",
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
  it("treats an approved, selected, priced row as on sale", () => {
    const onSale = row();
    assert.equal(stockRowIsSelected(onSale), true);
    assert.equal(stockRowIsOnSale(onSale), true);
    assert.equal(stockRowEligibleForSale(onSale), true);
    assert.equal(stockRowIsUnselected(onSale), false);
    assert.equal(stockRowIsUnavailable(onSale), false);
  });

  it("keeps a pending-review listing selected, unavailable, and not unselected", () => {
    const pending = row({ productStatus: "pending_review" });
    assert.equal(stockRowIsSelected(pending), true);
    assert.equal(stockRowIsOnSale(pending), false);
    assert.equal(stockRowEligibleForSale(pending), false);
    assert.equal(stockRowIsUnselected(pending), false);
    assert.equal(stockRowIsUnavailable(pending), true);
    assert.equal(stockRowUnavailableReason(pending, labels), "Not approved");
    assert.equal(stockRowIneligibleReason(pending, labels), "Not approved");
  });

  it("derives unselected as approved and not selected", () => {
    const unlisted = row({ retailSellableProductId: null, status: "active" });
    assert.equal(stockRowIsSelected(unlisted), false);
    assert.equal(stockRowIsUnselected(unlisted), true);
    assert.equal(stockRowIsOnSale(unlisted), false);
    assert.equal(stockRowIsUnavailable(unlisted), false);

    const disabled = row({ status: "disabled" });
    assert.equal(stockRowIsSelected(disabled), false);
    assert.equal(stockRowIsUnselected(disabled), true);
    assert.equal(stockRowIsUnavailable(disabled), false);
  });

  it("does not treat withdrawn products without a listing as unselected", () => {
    const withdrawn = row({
      productStatus: "ignored",
      retailSellableProductId: null
    });
    assert.equal(stockRowIsUnselected(withdrawn), false);
    assert.equal(stockRowIsSelected(withdrawn), false);
    assert.equal(stockRowIsUnavailable(withdrawn), false);
  });

  it("gives one unavailable reason among selected rows", () => {
    assert.equal(
      stockRowUnavailableReason(row({ productStatus: "pending_review" }), labels),
      "Not approved"
    );
    assert.equal(
      stockRowUnavailableReason(row({ retailPriceAmount: 0 }), labels),
      "Missing RRP"
    );
    assert.equal(
      stockRowUnavailableReason(
        row({ stockQuantity: 0, backorderPolicy: "deny" }),
        labels
      ),
      "Out of stock, no backorder"
    );
  });
});
