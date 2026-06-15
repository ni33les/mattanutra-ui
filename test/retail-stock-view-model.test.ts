import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminContent } from "../components/admin/dashboard-content.tsx";
import {
  buildCustomerOrderWorkflowSteps,
  customerOrderHasPickupBooked,
  customerOrderStatusMetricKey
} from "../components/admin/retail-stock/customer-order-display-model.ts";
import {
  addressDisplayLines,
  deliveryAddressForOrder,
  escapeHtml
} from "../components/admin/retail-stock/order-documents.ts";
import {
  activeShoppingListCoverageUnits,
  activeShoppingListReturnedDemandUnits,
  shoppingListIdFromResult
} from "../components/admin/retail-stock/shopping-list-view-model.ts";

function order(overrides: Record<string, unknown> = {}) {
  return {
    customerEmail: "alex@example.test",
    customerName: "Alex Example",
    deliveryDetails: null,
    notes: "Leave at reception",
    routingSnapshot: {
      shippingCountry: "TH"
    },
    shipment: null,
    status: "placed",
    workflowStage: "ordered",
    workflowTimeline: {
      allocatedAt: null,
      awaitingStockAt: null,
      boxedAt: null,
      orderedAt: "2026-06-01T10:00:00Z",
      pickupBookedAt: null,
      sentAt: null
    },
    ...overrides
  } as never;
}

const labels = {
  stock: {
    awaitingStock: "Awaiting stock",
    ordered: "Ordered",
    pickupBooked: "Pickup booked",
    readyToPack: "Ready to pack",
    readyToShip: "Ready to ship",
    sent: "Shipped"
  }
} as AdminContent;

describe("retail stock extracted view models", () => {
  it("maps customer order status and pickup display states", () => {
    assert.equal(customerOrderStatusMetricKey("picking"), "packed");
    assert.equal(
      customerOrderStatusMetricKey(
        order({
          status: "allocated",
          workflowStage: "awaiting_stock"
        })
      ),
      "awaiting_stock"
    );

    const pickupOrder = order({
      shipment: {
        pickupBookedAt: null,
        pickupProviderStatus: "requested"
      },
      status: "packed",
      workflowStage: "packed"
    });

    assert.equal(customerOrderHasPickupBooked(pickupOrder), true);
    assert.equal(customerOrderStatusMetricKey(pickupOrder), "pickup_booked");
    assert.equal(
      customerOrderHasPickupBooked(
        order({
          shipment: { pickupBookedAt: "2026-06-02T10:00:00Z" },
          status: "shipped",
          workflowStage: "shipped"
        })
      ),
      false
    );
  });

  it("builds the packed-to-pickup workflow display", () => {
    const steps = buildCustomerOrderWorkflowSteps(
      labels,
      order({
        shipment: {
          pickupBookedAt: null,
          pickupProviderStatus: "booked"
        },
        status: "packed",
        workflowStage: "packed",
        workflowTimeline: {
          allocatedAt: "2026-06-01T11:00:00Z",
          awaitingStockAt: null,
          boxedAt: "2026-06-01T12:00:00Z",
          orderedAt: "2026-06-01T10:00:00Z",
          pickupBookedAt: "2026-06-01T13:00:00Z",
          sentAt: null
        }
      })
    );

    assert.equal(steps.find((step) => step.key === "ready_to_ship")?.complete, true);
    assert.equal(steps.find((step) => step.key === "pickup_booked")?.complete, true);
    assert.equal(steps.find((step) => step.key === "sent")?.active, true);
  });

  it("falls back to customer delivery details and escapes printed HTML", () => {
    const fallbackAddress = deliveryAddressForOrder(order());

    assert.deepEqual(addressDisplayLines(fallbackAddress), [
      "Alex Example",
      "Thailand"
    ]);
    assert.equal(
      escapeHtml(`<strong data-x="1">Alex's</strong>`),
      "&lt;strong data-x=&quot;1&quot;&gt;Alex&#39;s&lt;/strong&gt;"
    );
  });

  it("calculates shopping-list coverage and returned demand", () => {
    const partialLine = {
      actualQuantity: 6,
      assignedQuantity: 10,
      requiredQuantity: 8,
      stockedQuantity: 2,
      unorderedNeedQuantity: 4
    } as never;
    const fulfilledLine = {
      actualQuantity: 14,
      assignedQuantity: 10,
      requiredQuantity: 8,
      stockedQuantity: 2,
      unorderedNeedQuantity: 4
    } as never;

    assert.equal(activeShoppingListCoverageUnits(partialLine), 4);
    assert.equal(activeShoppingListReturnedDemandUnits(partialLine), 4);
    assert.equal(activeShoppingListCoverageUnits(fulfilledLine), 10);
    assert.equal(activeShoppingListReturnedDemandUnits(fulfilledLine), 0);
    assert.equal(shoppingListIdFromResult({ shoppingListId: "sl_123" }), "sl_123");
    assert.equal(shoppingListIdFromResult({}), "");
  });
});
