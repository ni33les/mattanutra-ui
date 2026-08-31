import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  listingIsAvailable,
  listingIsSelected,
  ONLY_APPROVED_PLATFORM_PRODUCTS_MAY_BE_SELECTED,
  productIsApprovedForRetail
} from "../lib/retail-listing-availability.ts";

describe("retail listing availability", () => {
  it("treats only approved plus selected as available", () => {
    assert.equal(productIsApprovedForRetail("approved"), true);
    assert.equal(productIsApprovedForRetail("pending_review"), false);
    assert.equal(listingIsSelected("active"), true);
    assert.equal(listingIsSelected("disabled"), false);
    assert.equal(
      listingIsAvailable({ listingStatus: "active", productStatus: "approved" }),
      true
    );
    assert.equal(
      listingIsAvailable({
        listingStatus: "active",
        productStatus: "pending_review"
      }),
      false
    );
    assert.equal(
      listingIsAvailable({ listingStatus: "disabled", productStatus: "approved" }),
      false
    );
  });

  it("locks active listings to approved products in writers, trigger, and deploy", () => {
    const trigger = readFileSync(
      "scripts/apply-retail-sellable-approved-trigger.ts",
      "utf8"
    );
    const v9 = readFileSync("lib/v9-product-master.ts", "utf8");
    const hygeia = readFileSync("lib/hygeia-product-files.ts", "utf8");
    const shoppingList = readFileSync("lib/admin-retail-stock.ts", "utf8");
    assert.match(trigger, /retail_sellable_requires_approved_product/);
    assert.match(trigger, /Only approved platform products can be selected for retail/);
    assert.match(v9, /product\.status === "approved" && product\.price/);
    assert.match(hygeia, /status = 'approved'/);
    assert.match(shoppingList, /productApproved\(sql, existing\.product_id\)/);
    assert.equal(
      ONLY_APPROVED_PLATFORM_PRODUCTS_MAY_BE_SELECTED,
      "Only approved platform products can be selected for retail"
    );
  });
});
