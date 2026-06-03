import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRegionalBasketAvailabilityFromRows,
  resolveRetailCartLineAvailabilityFromRow
} from "../lib/retail-cart-availability.ts";

const now = new Date("2026-05-31T00:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    allocated_quantity: 0,
    backorder_policy: "allow",
    currency: "THB",
    id: "sellable-1",
    lead_time_days: 5,
    product_id: "product-1",
    product_status: "approved",
    rrp_price_amount: 1200,
    status: "active",
    stock_quantity: 10,
    wholesale_price_amount: 800,
    ...overrides
  };
}

function regionalRow(overrides: Record<string, unknown> = {}) {
  return {
    ...row(),
    organisation_country_code: "TH",
    organisation_currency: "THB",
    organisation_id: "retailer-th-fast",
    organisation_name: "Fast Thai Pharmacy",
    ...overrides
  };
}

describe("retail cart availability", () => {
  it("allows immediate checkout when retailer stock covers the requested quantity", () => {
    const availability = resolveRetailCartLineAvailabilityFromRow({
      now,
      productId: "product-1",
      quantity: 2,
      row: row({ stock_quantity: 4 })
    });

    assert.equal(availability.canCheckout, true);
    assert.equal(availability.availabilityStatus, "available_now");
    assert.equal(availability.backorderQuantity, 0);
    assert.equal(availability.etaDate, null);
    assert.equal(availability.unitPriceAmount, 1320);
  });

  it("allows zero-stock checkout when backorder is enabled and returns an ETA", () => {
    const availability = resolveRetailCartLineAvailabilityFromRow({
      now,
      productId: "product-1",
      quantity: 3,
      row: row({ lead_time_days: 7, stock_quantity: 0 })
    });

    assert.equal(availability.canCheckout, true);
    assert.equal(availability.availabilityStatus, "backorder");
    assert.equal(availability.backorderQuantity, 3);
    assert.equal(availability.etaDate, "2026-06-07");
  });

  it("splits insufficient stock into available now and backorder quantities", () => {
    const availability = resolveRetailCartLineAvailabilityFromRow({
      now,
      productId: "product-1",
      quantity: 5,
      row: row({ stock_quantity: 2 })
    });

    assert.equal(availability.canCheckout, true);
    assert.equal(availability.availabilityStatus, "backorder");
    assert.equal(availability.quantityAvailableNow, 2);
    assert.equal(availability.backorderQuantity, 3);
  });

  it("blocks checkout for unavailable quantity when backorder is disabled", () => {
    const availability = resolveRetailCartLineAvailabilityFromRow({
      now,
      productId: "product-1",
      quantity: 1,
      row: row({ backorder_policy: "deny", stock_quantity: 0 })
    });

    assert.equal(availability.canCheckout, false);
    assert.equal(availability.availabilityStatus, "unavailable");
    assert.equal(availability.reason, "Stock is insufficient and backorder is disabled.");
  });

  it("blocks checkout when the retailer has not listed the product for sale", () => {
    const availability = resolveRetailCartLineAvailabilityFromRow({
      now,
      productId: "product-1",
      quantity: 1,
      row: null
    });

    assert.equal(availability.canCheckout, false);
    assert.equal(availability.availabilityStatus, "unavailable");
    assert.equal(availability.reason, "Retailer does not sell this product.");
  });

  it("routes Thailand baskets only to Thai retailers", () => {
    const availability = resolveRegionalBasketAvailabilityFromRows({
      lines: [{ productId: "product-1", quantity: 1 }],
      now,
      preference: "cheapest_price",
      rows: [
        regionalRow({
          organisation_country_code: "TH",
          organisation_id: "thai-retailer",
          organisation_name: "Thai Retailer",
          rrp_price_amount: 120
        }),
        regionalRow({
          organisation_country_code: "SG",
          organisation_id: "singapore-retailer",
          organisation_name: "Singapore Retailer",
          rrp_price_amount: 50
        })
      ],
      shippingCountry: "TH"
    });

    assert.equal(availability.canCheckout, true);
    assert.equal(availability.selectedRetailer?.organisationId, "thai-retailer");
    assert.equal(availability.lines[0]?.selectedRetailerOrganisationId, "thai-retailer");
    assert.equal(availability.subtotalAmount, 132);
  });

  it("selects the cheapest full-basket retailer and uses ETA only as a tie-breaker", () => {
    const rows = [
      regionalRow({
        lead_time_days: 1,
        organisation_id: "fast-retailer",
        organisation_name: "Fast Retailer",
        rrp_price_amount: 150,
        stock_quantity: 4
      }),
      regionalRow({
        lead_time_days: 5,
        organisation_id: "cheap-retailer",
        organisation_name: "Cheap Retailer",
        rrp_price_amount: 90,
        stock_quantity: 0
      })
    ];

    const fastest = resolveRegionalBasketAvailabilityFromRows({
      lines: [{ productId: "product-1", quantity: 1 }],
      now,
      preference: "fastest_delivery",
      rows,
      shippingCountry: "TH"
    });
    const cheapest = resolveRegionalBasketAvailabilityFromRows({
      lines: [{ productId: "product-1", quantity: 1 }],
      now,
      preference: "cheapest_price",
      rows,
      shippingCountry: "TH"
    });

    assert.equal(fastest.selectedRetailer?.organisationId, "cheap-retailer");
    assert.equal(fastest.lines[0]?.availabilityStatus, "backorder");
    assert.equal(cheapest.selectedRetailer?.organisationId, "cheap-retailer");
    assert.equal(cheapest.lines[0]?.availabilityStatus, "backorder");
    assert.equal(cheapest.etaDate, "2026-06-05");
  });

  it("keeps locally unavailable lines visible but out of the payable basket", () => {
    const availability = resolveRegionalBasketAvailabilityFromRows({
      lines: [
        { productId: "product-1", quantity: 1 },
        { productId: "product-2", quantity: 2 }
      ],
      now,
      preference: "fastest_delivery",
      rows: [regionalRow({ product_id: "product-1" })],
      shippingCountry: "TH"
    });

    assert.equal(availability.canCheckout, false);
    assert.equal(availability.selectedRetailer?.organisationId, "retailer-th-fast");
    assert.equal(availability.payableLines.length, 0);
    assert.equal(availability.unavailableLines.length, 2);
    assert.equal(
      availability.unavailableLines.some((line) => line.productId === "product-2"),
      true
    );
    assert.equal(
      availability.unavailableLines.find((line) => line.productId === "product-2")
        ?.reason,
      "Unavailable in your country."
    );
  });

  it("allows local backorder lines to stay payable with an ETA", () => {
    const availability = resolveRegionalBasketAvailabilityFromRows({
      lines: [{ productId: "product-1", quantity: 3 }],
      now,
      preference: "fastest_delivery",
      rows: [
        regionalRow({
          backorder_policy: "allow",
          lead_time_days: 6,
          stock_quantity: 0
        })
      ],
      shippingCountry: "TH"
    });

    assert.equal(availability.canCheckout, true);
    assert.equal(availability.payableLines[0]?.availabilityStatus, "backorder");
    assert.equal(availability.payableLines[0]?.etaDate, "2026-06-06");
  });

  it("blocks checkout when no local retailer has payable lines", () => {
    const availability = resolveRegionalBasketAvailabilityFromRows({
      lines: [{ productId: "product-1", quantity: 1 }],
      now,
      preference: "fastest_delivery",
      rows: [
        regionalRow({
          backorder_policy: "deny",
          stock_quantity: 0
        })
      ],
      shippingCountry: "TH"
    });

    assert.equal(availability.canCheckout, false);
    assert.equal(availability.payableLines.length, 0);
    assert.equal(availability.selectedRetailer, null);
    assert.equal(
      availability.unavailableLines[0]?.reason,
      "Stock is insufficient and backorder is disabled."
    );
  });
});
